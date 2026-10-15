"""A2, clinical half — what variant databases say about each position.

Two sources, fetched independently so one being down never hides the other:

* **EBI Proteins API `/variation/{accession}`.** One call returns every variant
  UniProt, ClinVar, Ensembl, gnomAD, COSMIC and TCGA report for the canonical
  sequence, already in UniProt numbering, with clinical significance, disease
  associations, population frequency and SIFT/PolyPhen predictions.
* **AlphaFold DB `/api/annotations/{accession}.json?type=MUTAGEN`.** The mean
  AlphaMissense pathogenicity over all 19 substitutions at each residue.

## Why per-residue AlphaMissense and not per-substitution

AlphaFold DB advertises a per-substitution CSV (`amAnnotationsUrl`), but on
2026-10-14 every one of those files tried answered 403 from the storage bucket
behind it, while the per-residue annotation endpoint answered 200. The per-residue
mean is what AlphaFold DB's own viewer paints the structure with, so it is the
right quantity for colouring; it is labelled as a residue mean wherever it is
shown so nobody reads it as the score of one specific change.

## The hazard

The same one A5 and the structural half survive: a clinical position is a
UniProt position, not a residue number in this file. Positions are mapped
through `functional.map_uniprot_positions`, and a position the alignment cannot
place is reported with no residues rather than moved to a plausible neighbour.

Everything below `# ---- projection` is pure: JSON in, model out.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Iterable
from urllib.parse import quote

import httpx

from app.models.clinical import (
    ClinicalClass,
    ClinicalEvidence,
    ClinicalVariant,
    DiseaseCount,
    Prediction,
    ResidueEvidence,
)
from app.services.cache import TTLCache
from app.services.external import (
    Metadata,
    SourceNotFoundError,
    SourceUnavailableError,
    as_float,
    new_client,
)
from app.services.functional import PositionMap

logger = logging.getLogger(__name__)

VARIATION_URL = "https://www.ebi.ac.uk/proteins/api/variation/{accession}"
AM_ANNOTATIONS_URL = "https://alphafold.ebi.ac.uk/api/annotations/{accession}.json"

#: TP53 reports ~2,900 classified variants. The roll-up in `residues` covers all
#: of them; the itemised list is capped so the panel payload stays small, and the
#: shortfall is reported in `variants_truncated` rather than dropped silently.
MAX_VARIANTS = 400
MAX_CLINVAR_IDS = 4
MAX_DISEASES_PER_VARIANT = 4
MAX_TOP_DISEASES = 10

AM_NOTE = (
    "AlphaMissense values are the mean predicted pathogenicity of all 19 possible "
    "substitutions at a residue (Cheng et al., Science 2023, via AlphaFold DB), "
    "not the score of one specific change."
)
NOT_ADVICE_NOTE = (
    "Clinical significance is reported as the source databases state it. It is "
    "evidence for study, not a diagnosis."
)

#: Severity order used to pick one class from several labels and to sort.
CLASS_ORDER: tuple[ClinicalClass, ...] = (
    "pathogenic",
    "likely_pathogenic",
    "conflicting",
    "uncertain",
    "likely_benign",
    "benign",
    "other",
)
_PATHOGENIC = frozenset({"pathogenic", "likely_pathogenic"})
_BENIGN = frozenset({"benign", "likely_benign"})

THREE_LETTER: dict[str, str] = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys", "Q": "Gln",
    "E": "Glu", "G": "Gly", "H": "His", "I": "Ile", "L": "Leu", "K": "Lys",
    "M": "Met", "F": "Phe", "P": "Pro", "S": "Ser", "T": "Thr", "W": "Trp",
    "Y": "Tyr", "V": "Val", "*": "Ter", "U": "Sec",
}  # fmt: skip


class ClinicalClient:
    """Async client for the two clinical-evidence endpoints."""

    source = "clinical"

    def __init__(
        self,
        variation_cache: TTLCache[Metadata] | None = None,
        am_cache: TTLCache[Metadata] | None = None,
    ) -> None:
        # Separate caches: a TP53 variation body is ~14 MB on the wire and the
        # AlphaMissense one ~30 kB, so they must not compete for one LRU's slots.
        self._variation_cache: TTLCache[Metadata] = (
            variation_cache if variation_cache is not None else TTLCache(maxsize=32)
        )
        self._am_cache: TTLCache[Metadata] = am_cache if am_cache is not None else TTLCache()

    async def fetch_variation(self, accession: str) -> Metadata:
        key = base_accession(accession)
        cached = self._variation_cache.get(key)
        if cached is not None:
            return cached
        body = await _get_json(
            VARIATION_URL.format(accession=quote(key, safe="")),
            label=f"EBI Proteins variation for {key}",
            headers={"Accept": "application/json"},
        )
        self._variation_cache.put(key, body)
        return body

    async def fetch_alphamissense(self, accession: str) -> Metadata:
        key = base_accession(accession)
        cached = self._am_cache.get(key)
        if cached is not None:
            return cached
        body = await _get_json(
            AM_ANNOTATIONS_URL.format(accession=quote(key, safe="")),
            label=f"AlphaMissense annotations for {key}",
            params={"type": "MUTAGEN"},
        )
        self._am_cache.put(key, body)
        return body


async def _get_json(
    url: str,
    *,
    label: str,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
) -> Metadata:
    async with new_client(headers=headers or {}) as client:
        try:
            response = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise SourceUnavailableError(f"{label} failed: {exc}") from exc
    if response.status_code == 404:
        raise SourceNotFoundError(f"{label}: not found")
    if response.status_code >= 400:
        raise SourceUnavailableError(f"{label} returned HTTP {response.status_code}")
    try:
        body = response.json()
    except ValueError as exc:
        raise SourceUnavailableError(f"{label} returned a non-JSON body") from exc
    if not isinstance(body, dict):
        raise SourceUnavailableError(f"{label} returned an unexpected payload")
    return body


def base_accession(accession: str) -> str:
    """Both services index canonical accessions only; drop any isoform suffix."""
    return accession.strip().upper().split("-", 1)[0]


# ---------------------------------------------------------------- projection


def classify(labels: Iterable[str]) -> ClinicalClass | None:
    """One class from every significance label a variant carries.

    None when there is no label at all, so an unclassified population variant
    is told apart from one that was reviewed and called "other".
    """
    classes = {_class_of(label) for label in labels}
    classes.discard(None)
    if not classes:
        return None
    if classes & _PATHOGENIC and classes & _BENIGN:
        return "conflicting"
    for candidate in CLASS_ORDER:
        if candidate in classes:
            return candidate
    return "other"  # pragma: no cover - CLASS_ORDER is exhaustive


def _class_of(label: str) -> ClinicalClass | None:
    text = label.strip().lower()
    if not text:
        return None
    if "conflicting" in text:
        return "conflicting"
    if "likely pathogenic" in text:
        return "likely_pathogenic"
    if "pathogenic" in text:
        return "pathogenic"
    if "likely benign" in text:
        return "likely_benign"
    if "benign" in text:
        return "benign"
    if "uncertain" in text:
        return "uncertain"
    return "other"


def am_scores(body: Metadata | None) -> dict[int, float]:
    """UniProt position -> AlphaMissense residue mean, from the MUTAGEN payload."""
    if not body:
        return {}
    out: dict[int, float] = {}
    for annotation in body.get("annotation") or []:
        if not isinstance(annotation, dict) or annotation.get("type") != "MUTAGEN":
            continue
        for region in annotation.get("regions") or []:
            if not isinstance(region, dict):
                continue
            start, end = region.get("start"), region.get("end")
            score = as_float(region.get("annotation_value"))
            if not isinstance(start, int) or not isinstance(end, int) or score is None:
                continue
            for position in range(start, end + 1):
                out[position] = score
    return out


def build_clinical_evidence(
    uid: str,
    *,
    accession: str,
    resolution_note: str,
    variation: Metadata | None,
    alphamissense: Metadata | None,
    positions: PositionMap | None,
    notes: list[str] | None = None,
) -> ClinicalEvidence:
    """Assemble the payload. Pure: recorded JSON and an alignment in, model out."""
    notes = list(notes or [])
    features = [
        f for f in (variation or {}).get("features") or [] if isinstance(f, dict)
    ]
    sequence = str((variation or {}).get("sequence") or "")
    scores = am_scores(alphamissense)
    am_sequence = str((alphamissense or {}).get("sequence") or "")
    if scores and sequence and am_sequence and am_sequence != sequence:
        # Different sequence versions number positions differently; painting
        # one onto the other would shift every score. Refuse instead.
        notes.append(
            "AlphaMissense was computed on a different sequence version than the "
            "variant data, so its scores are not shown."
        )
        scores = {}

    mapped = positions.positions if positions else {}
    variants: list[ClinicalVariant] = []
    rollup: dict[int, ResidueEvidence] = {}
    counts: Counter[str] = Counter()
    disease_counts: Counter[str] = Counter()

    def slot(position: int) -> ResidueEvidence:
        if position not in rollup:
            rollup[position] = ResidueEvidence(
                position=position,
                alphamissense=scores.get(position),
                keys=[r.key for r in mapped.get(position, [])],
            )
        return rollup[position]

    features = _merge_duplicates(features)
    for feature in features:
        variant = _variant(feature, scores, mapped)
        if variant is None:
            continue
        here = slot(variant.position)
        if variant.somatic:
            here.somatic += 1
        if not variant.significance_labels:
            continue
        counts[variant.clinical_class] += 1
        if variant.clinical_class in _PATHOGENIC:
            here.pathogenic += 1
            disease_counts.update(set(variant.diseases))
        elif variant.clinical_class in _BENIGN:
            here.benign += 1
        elif variant.clinical_class in ("uncertain", "conflicting"):
            here.uncertain += 1
        variants.append(variant)

    for position in scores:
        slot(position)

    rank = {name: i for i, name in enumerate(CLASS_ORDER)}
    # Within a class, the best-attested change first: a variant several
    # submitters and diseases agree on is the one a reader came looking for.
    variants.sort(key=lambda v: (rank[v.clinical_class], -_weight(v), v.position, v.alt))
    truncated = max(0, len(variants) - MAX_VARIANTS)

    residues = sorted(rollup.values(), key=lambda r: r.position)
    if scores:
        notes.append(AM_NOTE)
    if features:
        notes.append(NOT_ADVICE_NOTE)
    if positions is not None:
        notes.extend(
            f"Chain {c.chain}: {c.note}" for c in positions.chains if not c.mapped and c.note
        )

    return ClinicalEvidence(
        id=uid,
        accession=accession,
        accession_resolved=True,
        resolution_note=resolution_note,
        gene=_gene(variation),
        class_counts={name: counts[name] for name in CLASS_ORDER if counts[name]},
        total_variants=len(features),
        variants=variants[:MAX_VARIANTS],
        variants_truncated=truncated,
        residues=residues,
        top_diseases=[
            DiseaseCount(name=name, variants=n)
            for name, n in disease_counts.most_common(MAX_TOP_DISEASES)
        ],
        alphamissense_available=bool(scores),
        mapped_positions=sum(1 for r in residues if r.keys),
        notes=notes,
    )


def empty_clinical_evidence(
    uid: str, note: str, *, accession: str | None = None
) -> ClinicalEvidence:
    return ClinicalEvidence(
        id=uid,
        accession=accession,
        accession_resolved=accession is not None,
        resolution_note=note,
    )


_LIST_KEYS = (
    "clinicalSignificances",
    "xrefs",
    "association",
    "populationFrequencies",
    "predictions",
)


def _merge_duplicates(features: list[Metadata]) -> list[Metadata]:
    """One feature per (span, ref, alt).

    The same change is often reported as several features, one per submitting
    source (UniProt, ClinVar via Ensembl, TCGA). Counting each would inflate the
    class totals and list the change twice, so their evidence lists are pooled.
    """
    merged: dict[tuple[str, str, str, str], Metadata] = {}
    for feature in features:
        alt = feature.get("alternativeSequence") or feature.get("mutatedType") or ""
        key = (
            str(feature.get("begin")),
            str(feature.get("end")),
            str(feature.get("wildType") or ""),
            f"{alt}|{feature.get('consequenceType') or ''}",
        )
        if key not in merged:
            merged[key] = {**feature, **{k: list(feature.get(k) or []) for k in _LIST_KEYS}}
            continue
        target = merged[key]
        for k in _LIST_KEYS:
            target[k].extend(feature.get(k) or [])
        if feature.get("somaticStatus") == 1:
            target["somaticStatus"] = 1
    return list(merged.values())


def _variant(
    feature: Metadata, scores: dict[int, float], mapped: dict[int, list]
) -> ClinicalVariant | None:
    begin, end = _int(feature.get("begin")), _int(feature.get("end"))
    if begin is None:
        return None
    end = end if end is not None and end >= begin else begin
    ref = str(feature.get("wildType") or "").strip() or "?"
    alt = str(feature.get("alternativeSequence") or feature.get("mutatedType") or "").strip()
    alt = alt or "-"

    labels: list[str] = []
    sources: list[str] = []
    for item in feature.get("clinicalSignificances") or []:
        if isinstance(item, dict) and isinstance(item.get("type"), str):
            labels.append(item["type"])
            sources.extend(s for s in item.get("sources") or [] if isinstance(s, str))
    cls = classify(labels) or "other"

    xrefs = [x for x in feature.get("xrefs") or [] if isinstance(x, dict)]
    clinvar = _unique(
        str(x["id"]) for x in xrefs if x.get("name") == "ClinVar" and str(x.get("id", "")).startswith("RCV")
    )
    rs = next(
        (str(x["id"]) for x in xrefs if str(x.get("id", "")).startswith("rs")), None
    )

    consequence = _str(feature.get("consequenceType"))
    residues = []
    for position in range(begin, end + 1):
        residues.extend(mapped.get(position, []))

    return ClinicalVariant(
        position=begin,
        end=end,
        ref=ref,
        alt=alt,
        hgvs=_hgvs(ref, begin, end, alt, consequence),
        short=_short(ref, begin, end, alt, consequence),
        consequence=consequence,
        clinical_class=cls,
        significance_labels=_unique(labels),
        significance_sources=_unique(sources),
        diseases=_unique(
            str(a["name"])
            for a in feature.get("association") or []
            if isinstance(a, dict) and a.get("disease") and a.get("name")
        )[:MAX_DISEASES_PER_VARIANT],
        clinvar_ids=clinvar[:MAX_CLINVAR_IDS],
        dbsnp_id=rs,
        gnomad_af=_gnomad_af(feature.get("populationFrequencies")),
        somatic=feature.get("somaticStatus") == 1,
        predictions=_predictions(feature.get("predictions")),
        alphamissense=scores.get(begin),
        residues=residues,
    )


def _weight(variant: ClinicalVariant) -> int:
    return (
        len(variant.clinvar_ids)
        + len(variant.significance_sources)
        + len(variant.diseases)
        + (1 if variant.consequence == "missense" else 0)
    )


def _hgvs(ref: str, begin: int, end: int, alt: str, consequence: str | None) -> str:
    def three(seq: str) -> str:
        return "".join(THREE_LETTER.get(aa, "Xaa") for aa in seq)

    if consequence == "frameshift":
        return f"p.{three(ref[:1])}{begin}fs"

    if begin == end and len(ref) == 1 and len(alt) == 1 and alt not in "-?":
        return f"p.{three(ref)}{begin}{'=' if alt == ref else three(alt)}"
    if alt == "-":
        span = f"{begin}" if begin == end else f"{begin}_{end}"
        return f"p.{span}del"
    span = f"{begin}" if begin == end else f"{begin}_{end}"
    return f"p.{span}delins{three(alt)}" if alt != "?" else f"p.{three(ref[:1])}{begin}?"


def _short(ref: str, begin: int, end: int, alt: str, consequence: str | None) -> str:
    if consequence == "frameshift":
        return f"{ref[:1]}{begin}fs"
    if alt == "-":
        return f"{ref[:1]}{begin}del" if begin == end else f"{ref[:1]}{begin}_{end}del"
    return f"{ref}{begin}{alt}" if begin == end else f"{ref}{begin}_{end}{alt}"


def _gnomad_af(value: object) -> float | None:
    best: float | None = None
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict) or not str(item.get("source", "")).startswith("gnomAD"):
            continue
        freq = as_float(item.get("frequency"))
        if freq is not None and (best is None or freq > best):
            best = freq
    return best


def _predictions(value: object) -> list[Prediction]:
    out: list[Prediction] = []
    seen: set[str] = set()
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        name, label = item.get("predAlgorithmNameType"), item.get("predictionValType")
        if not isinstance(name, str) or not isinstance(label, str) or name in seen:
            continue
        seen.add(name)
        out.append(Prediction(algorithm=name, label=label, score=as_float(item.get("score"))))
    return out


def _gene(variation: Metadata | None) -> str | None:
    return _str((variation or {}).get("geneName"))


def _int(value: object) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def _str(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _unique(items: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(items))


# ------------------------------------------------------------- the singleton

_CLIENT = ClinicalClient()


def get_clinical_client() -> ClinicalClient:
    """Read through, so tests can swap it."""
    return _CLIENT
