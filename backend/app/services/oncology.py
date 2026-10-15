"""Oncology layer — tumour hotspots, TCGA mutations, drugs, clinical evidence,
pathways and partners, projected onto one payload.

Pure: recorded JSON in, `OncologyContext` out. The HTTP side is in
`services/oncology_sources.py`.

## The hazard

Cancer databases number residues on a transcript, not on the UniProt entry,
and the two usually agree but not always. So every position is checked
against the UniProt reference residue before it is placed on the structure:
a hotspot "G12" is only mapped if residue 12 of the UniProt sequence is G. A
mismatch keeps the record and leaves it unmapped, with a note, rather than
painting a neighbouring residue.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from typing import Any

from app.models.oncology import (
    CancerTypeFrequency,
    CountedLabel,
    Drug,
    EvidenceItem,
    Hotspot,
    Interactor,
    MutationPosition,
    OncologyContext,
    Pathway,
    SourceStatus,
    TcgaSummary,
)
from app.services.external import (
    Metadata,
    SourceNotFoundError,
    as_float,
)
from app.services.functional import PositionMap

MAX_EVIDENCE = 150
MAX_PATHWAYS = 30
MAX_TUMOR_TYPES = 6
MAX_ALTERNATES = 6
TRUNCATING = frozenset(
    {
        "Nonsense_Mutation",
        "Frame_Shift_Del",
        "Frame_Shift_Ins",
        "Splice_Site",
        "Nonstop_Mutation",
    }
)
_LEVEL_RANK = {level: i for i, level in enumerate("ABCDE")}
_RESIDUE_TOKEN = re.compile(r"\b([ACDEFGHIKLMNPQRSTVWY])(\d{1,5})(?:[A-Z*]|fs|del|\b)")
_STUDY_SUFFIX = re.compile(r"\s*\(TCGA, PanCancer Atlas\)\s*$")

CHEMBL_URL = "https://www.ebi.ac.uk/chembl/explore/compound/{id}"
CIVIC_URL = "https://civicdb.org/evidence/{id}/summary"
REACTOME_URL = "https://reactome.org/content/detail/{id}"

DISCLAIMER = (
    "Tumour frequencies, drugs and clinical evidence are reported as their sources state "
    "them, for study. They are not treatment guidance."
)


class Placer:
    """UniProt position -> structure keys, refusing a position whose reference
    residue disagrees with the UniProt sequence."""

    def __init__(self, sequence: str, positions: PositionMap | None) -> None:
        self.sequence = sequence
        self.mapped = positions.positions if positions else {}
        self.mismatches: set[str] = set()

    def keys(self, position: int, ref: str | None = None) -> list[str]:
        mismatch = not 0 < position <= len(self.sequence) or self.sequence[position - 1] != ref
        if ref and self.sequence and mismatch:
            self.mismatches.add(f"{ref}{position}")
            return []
        return [r.key for r in self.mapped.get(position, [])]


def gene_and_entrez(entry: Metadata | None) -> tuple[str | None, int | None, str]:
    """(gene symbol, Entrez Gene id, sequence) from the UniProt entry."""
    if not entry:
        return None, None, ""
    gene = None
    for g in entry.get("genes") or []:
        value = ((g or {}).get("geneName") or {}).get("value")
        if isinstance(value, str) and value:
            gene = value
            break
    entrez = None
    for xref in entry.get("uniProtKBCrossReferences") or []:
        if xref.get("database") == "GeneID":
            try:
                entrez = int(xref["id"])
            except (KeyError, ValueError):
                pass
            break
    sequence = str(((entry.get("sequence") or {}).get("value")) or "")
    return gene, entrez, sequence


def build_oncology_context(
    uid: str,
    *,
    accession: str,
    resolution_note: str,
    gene: str | None,
    sequence: str,
    positions: PositionMap | None,
    results: dict[str, Any],
    notes: list[str] | None = None,
) -> OncologyContext:
    """`results[name]` is each source's raw payload, or the exception it raised,
    or absent when the source was skipped."""
    notes = list(notes or [])
    placer = Placer(sequence, positions)
    statuses: list[SourceStatus] = []

    def take(name: str, label: str) -> Any:
        if name not in results:
            statuses.append(SourceStatus(name=label, state="skipped", detail="No gene symbol."))
            return None
        value = results[name]
        if isinstance(value, SourceNotFoundError):
            statuses.append(SourceStatus(name=label, state="empty"))
            return None
        if isinstance(value, BaseException):
            statuses.append(SourceStatus(name=label, state="unavailable", detail=str(value)))
            return None
        statuses.append(SourceStatus(name=label, state="ok"))
        return value

    hotspots = _hotspots(take("hotspots", "cancerhotspots.org") or [], placer)
    tcga_raw = take("tcga", "cBioPortal TCGA PanCancer")
    tcga = _tcga(tcga_raw[0], tcga_raw[1], placer) if tcga_raw else None
    chembl = take("chembl", "ChEMBL")
    drugs = _drugs(*chembl) if chembl else []
    civic = take("civic", "CIViC")
    evidence_total, evidence = (civic[0], _evidence(civic[1], gene or "", placer)) if civic else (0, [])
    reactome = take("reactome", "Reactome") or []
    interactors = _interactors(take("string", "STRING") or [])

    for status in statuses:
        if status.state == "ok":
            continue
        # A source that answered but has nothing is normal for most genes.
        if status.state == "unavailable":
            notes.append(f"{status.name} could not be reached, so its section is missing.")
    if placer.mismatches:
        notes.append(
            "Not placed on the structure because the reference residue differs from the "
            "UniProt sequence (a different transcript numbering): "
            + ", ".join(sorted(placer.mismatches, key=lambda t: int(t[1:])))
            + "."
        )
    notes.append(DISCLAIMER)

    return OncologyContext(
        id=uid,
        accession=accession,
        accession_resolved=True,
        resolution_note=resolution_note,
        gene=gene,
        sequence_length=len(sequence),
        hotspots=hotspots,
        tcga=tcga,
        drugs=drugs,
        evidence=evidence[:MAX_EVIDENCE],
        evidence_total=evidence_total,
        pathways=_pathways(reactome)[:MAX_PATHWAYS],
        pathways_total=len(reactome),
        interactors=interactors,
        sources=statuses,
        notes=notes,
    )


def empty_oncology_context(uid: str, note: str, accession: str | None = None) -> OncologyContext:
    return OncologyContext(
        id=uid, accession=accession, accession_resolved=accession is not None, resolution_note=note
    )


# ------------------------------------------------------------------ sources


def _hotspots(records: Iterable[Metadata], placer: Placer) -> list[Hotspot]:
    out: list[Hotspot] = []
    for r in records:
        if not isinstance(r, dict) or r.get("type") != "single residue":
            continue
        residue = str(r.get("residue") or "")
        position = ((r.get("aminoAcidPosition") or {}).get("start"))
        if not isinstance(position, int) or not residue:
            continue
        out.append(
            Hotspot(
                residue=residue,
                position=position,
                tumor_count=int(r.get("tumorCount") or 0),
                q_value=as_float(r.get("qValue")),
                alternates=_counted(r.get("variantAminoAcid"), MAX_ALTERNATES),
                tumor_types=_counted(r.get("tumorTypeComposition"), MAX_TUMOR_TYPES),
                keys=placer.keys(position, residue[0]),
            )
        )
    out.sort(key=lambda h: -h.tumor_count)
    return out


def _tcga(studies: list[Metadata], mutations: list[Metadata], placer: Placer) -> TcgaSummary:
    names = {s["studyId"]: s for s in studies if isinstance(s, dict) and "studyId" in s}
    mutated: dict[str, set[str]] = defaultdict(set)
    per_position: dict[int, set[str]] = defaultdict(set)
    truncating: dict[int, set[str]] = defaultdict(set)
    changes: dict[int, Counter[str]] = defaultdict(Counter)
    kinds: Counter[str] = Counter()

    for m in mutations:
        study, sample = m.get("studyId"), m.get("sampleId")
        if not isinstance(study, str) or not isinstance(sample, str):
            continue
        sample_key = f"{study}:{sample}"
        mutated[study].add(sample_key)
        kinds[str(m.get("mutationType") or "Other").replace("_", " ")] += 1
        position = m.get("proteinPosStart")
        change = str(m.get("proteinChange") or "")
        if not isinstance(position, int) or position <= 0 or not change:
            continue
        per_position[position].add(sample_key)
        changes[position][change] += 1
        if m.get("mutationType") in TRUNCATING:
            truncating[position].add(sample_key)

    by_type = []
    for study_id, samples in mutated.items():
        meta = names.get(study_id, {})
        total = int(meta.get("allSampleCount") or 0)
        if total <= 0:
            continue
        by_type.append(
            CancerTypeFrequency(
                study_id=study_id,
                cancer_type=_STUDY_SUFFIX.sub("", str(meta.get("name") or study_id)),
                mutated_samples=len(samples),
                samples=total,
                fraction=round(len(samples) / total, 4),
            )
        )
    by_type.sort(key=lambda c: -c.fraction)

    positions = []
    for position, samples in per_position.items():
        top = changes[position].most_common(1)[0][0]
        positions.append(
            MutationPosition(
                position=position,
                count=len(samples),
                truncating=len(truncating[position]),
                top_change=top,
                keys=placer.keys(position, top[0] if top[:1].isalpha() else None),
            )
        )
    positions.sort(key=lambda p: p.position)

    return TcgaSummary(
        studies=len(names),
        samples=sum(int(s.get("allSampleCount") or 0) for s in names.values()),
        mutated_samples=sum(len(s) for s in mutated.values()),
        by_cancer_type=by_type,
        mutation_types=[CountedLabel(label=k, count=v) for k, v in kinds.most_common()],
        positions=positions,
    )


def _drugs(mechanisms: list[Metadata], molecules: list[Metadata]) -> list[Drug]:
    info = {m.get("molecule_chembl_id"): m for m in molecules if isinstance(m, dict)}
    out: dict[str, Drug] = {}
    for mech in mechanisms:
        chembl_id = mech.get("molecule_chembl_id")
        if not isinstance(chembl_id, str) or chembl_id in out:
            continue
        mol = info.get(chembl_id, {})
        variant = (mech.get("variant_sequence") or {}).get("mutation")
        first_approval = mol.get("first_approval")
        out[chembl_id] = Drug(
            chembl_id=chembl_id,
            name=str(mol.get("pref_name") or chembl_id).title(),
            max_phase=as_float(mol.get("max_phase") or mech.get("max_phase")),
            first_approval=first_approval if isinstance(first_approval, int) else None,
            molecule_type=mol.get("molecule_type"),
            mechanism=mech.get("mechanism_of_action"),
            action_type=mech.get("action_type"),
            variant=variant if isinstance(variant, str) else None,
            url=CHEMBL_URL.format(id=chembl_id),
        )
    return sorted(out.values(), key=lambda d: (-(d.max_phase or 0), d.name))


def _evidence(nodes: list[Metadata], gene: str, placer: Placer) -> list[EvidenceItem]:
    word = re.compile(rf"\b{re.escape(gene)}\b") if gene else None
    out: list[EvidenceItem] = []
    for n in nodes:
        profile = str(((n.get("molecularProfile") or {}).get("name")) or "")
        if word and not word.search(profile):
            continue  # a substring match on another gene's profile
        positions, keys = [], []
        if word:
            for part in re.split(r"\s+(?:AND|OR)\s+", profile):
                if not word.search(part):
                    continue
                for ref, pos in _RESIDUE_TOKEN.findall(part):
                    positions.append(int(pos))
                    keys.extend(placer.keys(int(pos), ref))
        disease = (n.get("disease") or {}).get("name")
        out.append(
            EvidenceItem(
                id=int(n["id"]),
                profile=profile,
                evidence_type=str(n.get("evidenceType") or "").title(),
                significance=_label(n.get("significance")),
                direction=_label(n.get("evidenceDirection")),
                level=n.get("evidenceLevel"),
                rating=n.get("evidenceRating") if isinstance(n.get("evidenceRating"), int) else None,
                therapies=[t["name"] for t in n.get("therapies") or [] if t.get("name")],
                disease=disease if isinstance(disease, str) else None,
                positions=sorted(set(positions)),
                keys=list(dict.fromkeys(keys)),
                url=CIVIC_URL.format(id=int(n["id"])),
            )
        )
    out.sort(key=lambda e: (_LEVEL_RANK.get(e.level or "", 9), -(e.rating or 0), e.id))
    return out


def _pathways(records: list[Metadata]) -> list[Pathway]:
    out = [
        Pathway(
            id=str(p["stId"]),
            name=str(p.get("displayName") or p["stId"]),
            in_disease=bool(p.get("isInDisease")),
            url=REACTOME_URL.format(id=p["stId"]),
        )
        for p in records
        if isinstance(p, dict) and p.get("stId")
    ]
    out.sort(key=lambda p: (not p.in_disease, p.name.lower()))
    return out


def _interactors(records: list[Metadata]) -> list[Interactor]:
    out = []
    for r in records:
        name, score = r.get("preferredName_B"), as_float(r.get("score"))
        if isinstance(name, str) and score is not None:
            out.append(Interactor(name=name, score=score))
    return sorted(out, key=lambda i: -i.score)


def _counted(value: object, limit: int) -> list[CountedLabel]:
    if not isinstance(value, dict):
        return []
    pairs = [(str(k), int(v)) for k, v in value.items() if isinstance(v, int)]
    pairs.sort(key=lambda kv: -kv[1])
    return [CountedLabel(label=k.replace("_", " "), count=v) for k, v in pairs[:limit]]


def _label(value: object) -> str | None:
    if not isinstance(value, str) or not value or value == "NA":
        return None
    return value.replace("SENSITIVITYRESPONSE", "Sensitivity/response").replace("_", " ").capitalize()
