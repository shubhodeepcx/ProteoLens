"""Central Dogma Explorer — a variant followed from chromosome to codon to protein.

Sources: Ensembl REST (GRCh38 karyotype bands, gene model, canonical CDS, and
the protein-to-genome coordinate map) and UniProt (the accession and sequence
the 3D hand-off lands on). Everything below `# ---- projection` is pure.

## What is checked, because it is easy to get wrong

* **The reference amino acid.** The codon is read from Ensembl's canonical CDS
  and translated; if it does not encode the residue the user named (BRAF "V600"
  must be a Val), the request is refused rather than silently "mutated".
* **The strand.** Genes on the minus strand (HBB, TP53, KRAS, BRAF) have their
  coding sequence on the reverse complement, so the genomic base at the variant
  is the complement of the coding base. Both are reported, labelled.
* **The hand-off.** The AlphaFold model of a UniProt entry numbers residues by
  UniProt position. The hand-off is only offered as exact when the UniProt
  sequence carries the same reference residue at that position.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

import httpx
from Bio.Data.CodonTable import standard_dna_table

from app.models.explorer import (
    Band,
    Chromosome,
    CodingWindow,
    Exon,
    ExplorerView,
    GeneLocus,
    Scenario,
    VariantChange,
)
from app.services.cache import TTLCache
from app.services.external import (
    Metadata,
    SourceNotFoundError,
    SourceUnavailableError,
    new_client,
)

ENSEMBL = "https://rest.ensembl.org"
KARYOTYPE_URL = f"{ENSEMBL}/info/assembly/homo_sapiens"
LOOKUP_URL = f"{ENSEMBL}/lookup/symbol/homo_sapiens/{{symbol}}"
CDS_URL = f"{ENSEMBL}/sequence/id/{{transcript}}"
MAP_URL = f"{ENSEMBL}/map/translation/{{translation}}/{{start}}..{{end}}"
UNIPROT_SEARCH_URL = "https://rest.uniprot.org/uniprotkb/search"

WINDOW_CODONS = 10

ONE_TO_THREE = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys", "Q": "Gln",
    "E": "Glu", "G": "Gly", "H": "His", "I": "Ile", "L": "Leu", "K": "Lys",
    "M": "Met", "F": "Phe", "P": "Pro", "S": "Ser", "T": "Thr", "W": "Trp",
    "Y": "Tyr", "V": "Val", "*": "Ter",
}  # fmt: skip
THREE_TO_ONE = {v.upper(): k for k, v in ONE_TO_THREE.items()}
COMPLEMENT = str.maketrans("ACGT", "TGCA")
CODON_TABLE: dict[str, str] = {
    **standard_dna_table.forward_table,
    **{c: "*" for c in standard_dna_table.stop_codons},
}

_GENE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,19}$")
_CHANGE = re.compile(
    r"^\s*(?:p\.)?(?P<ref>[A-Za-z]{3}|[A-Za-z])(?P<pos>\d{1,5})(?P<alt>[A-Za-z]{3}|[A-Za-z*])\s*$"
)


class ExplorerError(ValueError):
    """The request cannot be explored as asked; the message says why."""


# ------------------------------------------------------------------ scenarios

SCENARIOS: dict[str, Scenario] = {
    s.id: s
    for s in (
        Scenario(
            id="sickle-cell",
            title="Sickle cell disease",
            disease="Sickle cell anaemia",
            field="Molecular biology",
            gene="HBB",
            change="E7V",
            summary="One base, GAG to GTG, swaps a charged glutamate for a sticky valine on the "
            "surface of haemoglobin.",
            story=[
                (
                    "Codon 7 of HBB (written Glu6Val in the older numbering that skips the first "
                    "Met) changes from GAG to GTG: an A-to-T transversion."
                ),
                "The mRNA carries GUG, and the ribosome inserts valine where glutamate belongs.",
                (
                    "Valine is hydrophobic. On deoxygenated haemoglobin it fits a pocket on a "
                    "neighbouring molecule, so haemoglobin S molecules stack into long fibres."
                ),
                (
                    "The fibres bend red cells into sickles that block small vessels and break "
                    "early: pain crises and anaemia. One copy (the trait) protects against malaria."
                ),
            ],
        ),
        Scenario(
            id="tp53-r175h",
            title="TP53 R175H",
            disease="Li-Fraumeni syndrome and many cancers",
            field="Oncology",
            gene="TP53",
            change="R175H",
            summary="The most common TP53 hotspot: one base, CGC to CAC, and the guardian of the "
            "genome can no longer hold DNA.",
            story=[
                (
                    "Codon 175 of TP53 changes from CGC to CAC: a G-to-A transition at a CpG site, "
                    "the most mutation-prone kind of DNA position."
                ),
                "Arginine becomes histidine in the DNA-binding domain.",
                (
                    "Arg175 braces the loops that hold p53's zinc ion. Without it the zinc site "
                    "loosens and the whole DNA-binding domain misfolds."
                ),
                (
                    "Misfolded p53 cannot switch on its target genes, so damaged cells keep "
                    "dividing instead of repairing or dying."
                ),
            ],
        ),
        Scenario(
            id="kras-g12c",
            title="KRAS G12C",
            disease="Lung adenocarcinoma",
            field="Oncology",
            gene="KRAS",
            change="G12C",
            summary="A switch stuck on, and the first drug ever to turn it off: GGT to TGT.",
            story=[
                (
                    "Codon 12 of KRAS changes from GGT to TGT: a G-to-T transversion typical of "
                    "tobacco-smoke damage."
                ),
                (
                    "Glycine 12 sits in the P-loop that cradles GTP. Any larger side chain blocks "
                    "the helper protein that makes KRAS hydrolyse GTP and switch itself off."
                ),
                "KRAS stays in its GTP-bound 'on' state and keeps signalling cells to grow.",
                (
                    "The new cysteine is also a weakness: sotorasib and adagrasib bond to it "
                    "covalently and lock KRAS G12C in the 'off' state."
                ),
            ],
            structure_note="RCSB 6OIM shows KRAS G12C with sotorasib bound to Cys12.",
        ),
        Scenario(
            id="egfr-l858r",
            title="EGFR L858R",
            disease="Non-small cell lung cancer",
            field="Oncology",
            gene="EGFR",
            change="L858R",
            summary="CTG to CGG in the kinase's activation loop leaves the receptor signalling "
            "with no growth factor present.",
            story=[
                "Codon 858 of EGFR changes from CTG to CGG: a T-to-G transversion.",
                (
                    "Leucine 858 helps hold the kinase in its inactive shape. Arginine cannot, so "
                    "the kinase flips to its active shape on its own."
                ),
                (
                    "The mutant kinase is also more sensitive to EGFR inhibitors such as gefitinib, "
                    "erlotinib and osimertinib, which is why tumours are tested for it."
                ),
            ],
        ),
        Scenario(
            id="braf-v600e",
            title="BRAF V600E",
            disease="Melanoma",
            field="Oncology",
            gene="BRAF",
            change="V600E",
            summary="GTG to GAG puts a negative charge where a phosphate would go, so the kinase "
            "is permanently active.",
            story=[
                "Codon 600 of BRAF changes from GTG to GAG: a T-to-A transversion.",
                (
                    "Glutamate's negative charge mimics the phosphorylation that normally activates "
                    "BRAF, so the kinase no longer needs a signal from RAS."
                ),
                (
                    "Around half of melanomas carry it; vemurafenib and dabrafenib were designed "
                    "against this exact mutant."
                ),
            ],
        ),
    )
}


def parse_change(change: str) -> tuple[str, int, str]:
    """'E7V', 'p.Glu7Val', 'R175*' -> (ref, position, alt), one-letter codes."""
    m = _CHANGE.match(change or "")
    if not m:
        raise ExplorerError(f"{change!r} is not a protein change like R175H or p.Arg175His.")

    def one(token: str) -> str:
        if len(token) == 3:
            if token.upper() not in THREE_TO_ONE:
                raise ExplorerError(f"{token!r} is not an amino acid.")
            return THREE_TO_ONE[token.upper()]
        letter = token.upper()
        if letter not in ONE_TO_THREE:
            raise ExplorerError(f"{token!r} is not an amino acid.")
        return letter

    ref, alt = one(m["ref"]), one(m["alt"])
    if ref == "*":
        raise ExplorerError("A stop codon cannot be the reference residue.")
    return ref, int(m["pos"]), alt


def check_gene(symbol: str) -> str:
    if not _GENE.match(symbol or ""):
        raise ExplorerError(f"{symbol!r} is not a gene symbol.")
    return symbol.upper()


# --------------------------------------------------------------------- client


class EnsemblClient:
    def __init__(self, cache: TTLCache[Any] | None = None) -> None:
        self._cache: TTLCache[Any] = cache if cache is not None else TTLCache(maxsize=128)

    async def _get(self, url: str, label: str, params: dict[str, str] | None = None) -> Any:
        key = f"{url}?{sorted((params or {}).items())}"
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        async with new_client(
            headers={"Content-Type": "application/json", "Accept": "application/json"}
        ) as c:
            try:
                response = await c.get(url, params=params)
            except httpx.HTTPError as exc:
                raise SourceUnavailableError(f"{label} request failed: {exc}") from exc
        if response.status_code in (400, 404):
            raise SourceNotFoundError(f"{label}: HTTP {response.status_code}")
        if response.status_code >= 400:
            raise SourceUnavailableError(f"{label} returned HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError as exc:
            raise SourceUnavailableError(f"{label} returned a non-JSON body") from exc
        self._cache.put(key, body)
        return body

    async def karyotype(self) -> Metadata:
        return await self._get(KARYOTYPE_URL, "Ensembl assembly", {"bands": "1"})

    async def lookup(self, symbol: str) -> Metadata:
        return await self._get(
            LOOKUP_URL.format(symbol=quote(symbol, safe="")),
            f"Ensembl gene {symbol}",
            {"expand": "1"},
        )

    async def cds(self, transcript: str) -> Metadata:
        return await self._get(
            CDS_URL.format(transcript=quote(transcript, safe="")), "Ensembl CDS", {"type": "cds"}
        )

    async def map_codon(self, translation: str, position: int) -> Metadata:
        return await self._get(
            MAP_URL.format(translation=quote(translation, safe=""), start=position, end=position),
            "Ensembl coordinate map",
        )

    async def uniprot(self, symbol: str) -> Metadata:
        return await self._get(
            UNIPROT_SEARCH_URL,
            "UniProt",
            {
                "query": f"gene_exact:{symbol} AND organism_id:9606 AND reviewed:true",
                "fields": "accession,sequence",
                "size": "1",
            },
        )


_CLIENT = EnsemblClient()


def get_ensembl_client() -> EnsemblClient:
    return _CLIENT


# ----------------------------------------------------------------- projection


def canonical_transcript(lookup: Metadata) -> Metadata:
    for t in lookup.get("Transcript") or []:
        if t.get("is_canonical") and t.get("Translation"):
            return t
    raise ExplorerError(
        f"Ensembl has no canonical protein-coding transcript for {lookup.get('display_name')}."
    )


def chromosomes(assembly: Metadata) -> list[Chromosome]:
    names = [n for n in assembly.get("karyotype") or [] if n != "MT"]
    regions = {r.get("name"): r for r in assembly.get("top_level_region") or []}
    out = []
    for name in names:
        r = regions.get(name)
        if not r:
            continue
        bands = sorted(
            (
                Band(
                    id=b["id"],
                    start=int(b["start"]),
                    end=int(b["end"]),
                    stain=str(b.get("stain") or ""),
                )
                for b in r.get("bands") or []
                if "id" in b
            ),
            key=lambda b: b.start,
        )
        out.append(Chromosome(name=name, length=int(r["length"]), bands=bands))
    return out


def choose_alt_codon(ref_codon: str, alt_aa: str, preferred: str | None = None) -> str:
    """The alternate codon: the scenario's own if given, else the single-base
    change that encodes `alt_aa` (transitions first), else the closest codon."""
    if preferred:
        return preferred
    candidates = [c for c, aa in CODON_TABLE.items() if aa == alt_aa]
    if not candidates:
        raise ExplorerError(f"No codon encodes {alt_aa!r}.")

    def distance(c: str) -> int:
        return sum(a != b for a, b in zip(c, ref_codon, strict=True))

    def is_transition(c: str) -> bool:
        pairs = {frozenset("AG"), frozenset("CT")}
        return all(frozenset((a, b)) in pairs for a, b in zip(c, ref_codon, strict=True) if a != b)

    return min(candidates, key=lambda c: (distance(c), not is_transition(c), c))


SCENARIO_CODONS = {
    "sickle-cell": "GTG",
    "tp53-r175h": "CAC",
    "kras-g12c": "TGT",
    "egfr-l858r": "CGG",
    "braf-v600e": "GAG",
}


def build_view(
    *,
    symbol: str,
    change: str,
    scenario: Scenario | None,
    assembly: Metadata,
    lookup: Metadata,
    cds: Metadata,
    codon_map: Metadata,
    uniprot: Metadata | None,
) -> ExplorerView:
    ref, position, alt = parse_change(change)
    transcript = canonical_transcript(lookup)
    sequence = str(cds.get("seq") or "").upper()
    if len(sequence) < position * 3:
        raise ExplorerError(
            f"{symbol}'s canonical coding sequence has {len(sequence) // 3} codons; "
            f"there is no codon {position}."
        )
    ref_codon = sequence[(position - 1) * 3 : position * 3]
    encoded = CODON_TABLE.get(ref_codon, "?")
    if encoded != ref:
        raise ExplorerError(
            f"Codon {position} of {symbol} is {ref_codon}, which encodes "
            f"{ONE_TO_THREE.get(encoded, '?')}, not {ONE_TO_THREE[ref]}. Check the residue and "
            "its numbering (UniProt/Ensembl numbering counts the first Met as 1)."
        )
    preferred = SCENARIO_CODONS.get(scenario.id) if scenario else None
    alt_codon = choose_alt_codon(ref_codon, alt, preferred)
    if CODON_TABLE.get(alt_codon) != alt:
        raise ExplorerError(f"{alt_codon} does not encode {alt}.")  # pragma: no cover
    changed = [i for i in range(3) if ref_codon[i] != alt_codon[i]]
    consequence = "synonymous" if alt == ref else "nonsense" if alt == "*" else "missense"

    strand = int(lookup.get("strand") or 1)
    mapping = next(iter(codon_map.get("mappings") or []), None)
    if not mapping:
        raise ExplorerError("Ensembl could not place this codon on the genome.")
    codon_start, codon_end = int(mapping["start"]), int(mapping["end"])
    first = changed[0] if changed else 0
    genomic_position = codon_start + first if strand == 1 else codon_end - first
    coding_ref, coding_alt = ref_codon[first], alt_codon[first]
    genomic_ref = coding_ref if strand == 1 else coding_ref.translate(COMPLEMENT)
    genomic_alt = coding_alt if strand == 1 else coding_alt.translate(COMPLEMENT)

    exons = sorted(
        (
            Exon(number=0, start=int(e["start"]), end=int(e["end"]))
            for e in transcript.get("Exon") or []
        ),
        key=lambda e: e.start * strand,
    )
    exons = [e.model_copy(update={"number": i + 1}) for i, e in enumerate(exons)]
    exon_number = next((e.number for e in exons if e.start <= genomic_position <= e.end), None)
    translation = transcript["Translation"]
    chroms = chromosomes(assembly)
    chrom = str(lookup.get("seq_region_name"))
    gene_start = int(lookup["start"])
    band = next(
        (
            b.id
            for c in chroms
            if c.name == chrom
            for b in c.bands
            if b.start <= gene_start <= b.end
        ),
        None,
    )

    first_codon = max(1, position - WINDOW_CODONS)
    last_codon = min(len(sequence) // 3, position + WINDOW_CODONS)
    window_ref = sequence[(first_codon - 1) * 3 : last_codon * 3]
    offset = (position - first_codon) * 3
    window_alt = window_ref[:offset] + alt_codon + window_ref[offset + 3 :]

    notes: list[str] = []
    accession, length, handoff = None, None, False
    entry = next(iter((uniprot or {}).get("results") or []), None)
    if entry:
        accession = entry.get("primaryAccession")
        protein = str((entry.get("sequence") or {}).get("value") or "")
        length = len(protein) or None
        handoff = len(protein) >= position and protein[position - 1] == ref
        if not handoff:
            notes.append(
                f"UniProt {accession} does not carry {ref} at position {position}, so the 3D "
                "hand-off opens the protein without selecting the residue."
            )
    else:
        notes.append(
            "No reviewed UniProt entry was found for this gene, so there is no 3D hand-off."
        )
    if not preferred and len(changed) > 1:
        notes.append(
            f"No single-base change turns {ref_codon} into a codon for {ONE_TO_THREE[alt]}; "
            f"the closest codon, {alt_codon}, differs at {len(changed)} bases."
        )

    hgvs_c = (
        f"c.{(position - 1) * 3 + first + 1}{coding_ref}>{coding_alt}"
        if len(changed) == 1
        else f"c.{(position - 1) * 3 + 1}_{position * 3}delins{alt_codon}"
    )

    return ExplorerView(
        scenario=scenario,
        gene=GeneLocus(
            symbol=str(lookup.get("display_name") or symbol),
            description=_clean_description(lookup.get("description")),
            ensembl_gene=str(lookup["id"]),
            chromosome=chrom,
            start=gene_start,
            end=int(lookup["end"]),
            strand=1 if strand == 1 else -1,
            cytoband=f"{chrom}{band}" if band else None,
            transcript=str(transcript["id"]),
            exons=exons,
            cds_start=int(translation["start"]),
            cds_end=int(translation["end"]),
        ),
        chromosomes=chroms,
        variant=VariantChange(
            protein_position=position,
            ref_aa=ref,
            alt_aa=alt,
            ref_aa3=ONE_TO_THREE[ref],
            alt_aa3=ONE_TO_THREE[alt],
            ref_codon=ref_codon,
            alt_codon=alt_codon,
            changed_bases=changed,
            consequence=consequence,
            hgvs_p=f"p.{ONE_TO_THREE[ref]}{position}{ONE_TO_THREE[alt]}",
            hgvs_c=hgvs_c,
            genomic_position=genomic_position,
            genomic_ref=genomic_ref,
            genomic_alt=genomic_alt,
            exon_number=exon_number,
        ),
        window=CodingWindow(
            first_codon=first_codon,
            ref=window_ref,
            alt=window_alt,
            ref_protein=_translate(window_ref),
            alt_protein=_translate(window_alt),
        ),
        accession=accession,
        protein_length=length,
        handoff_ok=handoff,
        notes=notes,
    )


def _translate(dna: str) -> str:
    return "".join(CODON_TABLE.get(dna[i : i + 3], "X") for i in range(0, len(dna) - 2, 3))


def _clean_description(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return re.sub(r"\s*\[Source:.*\]$", "", value).strip() or None
