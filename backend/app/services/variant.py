"""A2, structural half — where a protein variant sits and what it touches.

Given a stored structure and a protein-level change ("R175H", "p.Arg175His",
"W53*", "F508del"), this module finds every copy of that residue in the file
and measures its surroundings: burial, neighbours, other chains, DNA/RNA,
bound ligands, disulfide bonds, and curated UniProt sites. It then states, as
plain rules of thumb, why that context makes the change more or less
worrying.

## What this module deliberately does NOT do

It does not predict pathogenicity. A charged residue in a buried core is a
textbook reason for concern, and saying so is useful; turning a handful of
such rules into a "probability of disease" would be a score with no
calibration behind it. The rules are published with their reasons, the
concern level is the highest rule that fired, and clinical evidence lives in
its own panel with its own sources.

## The hazard this module exists to survive

The same one A5 survives: **a clinical position is a UniProt position, not a
residue number in this file.** When a UniProt entry is available the position
is mapped through `functional.map_uniprot_positions`, the alignment A5
already trusts. Without one, the position is read as the file's own residue
number and the reference amino acid is checked against the residue found
there. A mismatch is refused with both residues named, never quietly moved
to the nearest plausible residue.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from Bio.Align import substitution_matrices
from Bio.PDB import NeighborSearch

from app.models.functional import ResidueRef
from app.models.protein import ProteinSummary
from app.models.variant import (
    Concern,
    ImpactFlag,
    Numbering,
    Physicochemistry,
    VariantImpact,
    VariantKind,
    VariantSite,
)
from app.services import functional
from app.services.analytics import KD_HYDROPATHY
from app.services.external import Metadata
from app.services.parser import is_nucleic_acid_chain

logger = logging.getLogger(__name__)

#: Heavy-atom distance for "this residue touches that one". 4.5 A is a little
#: wider than A5's ligand cutoff so that side chains packed against each other
#: without a direct hydrogen bond still count as neighbours.
NEIGHBOUR_CUTOFF = 4.5

#: Ligand and nucleic-acid contacts use A5's 4.0 A cutoff, so a residue A5
#: lists as a pocket residue is a ligand contact here too.
CONTACT_CUTOFF = functional.CONTACT_CUTOFF_ANGSTROMS

#: Sulfur-sulfur distance of a disulfide bond is ~2.05 A; 2.5 A tolerates
#: modest coordinate error without catching non-bonded cysteines.
DISULFIDE_CUTOFF = 2.5

#: Changes in side-chain volume beyond this, in a buried position, are called
#: out. ~40 A^3 is roughly one methylene group plus change.
VOLUME_CHANGE_THRESHOLD = 40.0

#: Side-chain volumes in A^3 (Zamyatnin 1972, Prog. Biophys. Mol. Biol. 24:107).
RESIDUE_VOLUME: dict[str, float] = {
    "A": 88.6, "R": 173.4, "N": 114.1, "D": 111.1, "C": 108.5,
    "Q": 143.8, "E": 138.4, "G": 60.1, "H": 153.2, "I": 166.7,
    "L": 166.7, "K": 168.6, "M": 162.9, "F": 189.9, "P": 112.7,
    "S": 89.0, "T": 116.1, "W": 227.8, "Y": 193.6, "V": 140.0,
}  # fmt: skip

THREE_TO_ONE: dict[str, str] = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
}  # fmt: skip
ONE_TO_THREE = {one: three.capitalize() for three, one in THREE_TO_ONE.items()}

STOP_TOKENS = frozenset({"*", "TER", "X"})

NOT_A_PREDICTION_NOTE = (
    "These are structural rules of thumb measured from this file, not a "
    "pathogenicity prediction. Clinical significance needs clinical evidence."
)

UNIPROT_NUMBERING_NOTE = (
    "Position mapped through a global alignment of the UniProt sequence to each "
    "chain, so it holds even where the file numbers residues differently."
)
AUTHOR_NUMBERING_NOTE = (
    "No UniProt sequence was available, so the position was read as this file's "
    "own residue number, and the reference residue was checked at each match."
)

_BLOSUM62 = substitution_matrices.load("BLOSUM62")

_NOTATION = re.compile(
    r"""^\s*
    (?:(?P<gene>[A-Za-z][A-Za-z0-9-]*)[\s:]+)?   # optional gene symbol
    (?:p\.)?\(?
    (?P<ref>[A-Za-z]{3}|[A-Za-z])
    (?P<pos>\d{1,5})
    (?P<alt>[A-Za-z]{3}|[A-Za-z*=]|del)
    \)?\s*$""",
    re.VERBOSE,
)


class VariantError(ValueError):
    """The notation could not be read, or does not fit this structure."""


@dataclass(frozen=True)
class ParsedVariant:
    ref: str
    position: int
    alt: str | None  # None = deletion, "*" = stop
    kind: VariantKind

    @property
    def hgvs(self) -> str:
        ref3 = ONE_TO_THREE[self.ref]
        if self.kind == "deletion":
            return f"p.{ref3}{self.position}del"
        if self.kind == "synonymous":
            return f"p.{ref3}{self.position}="
        if self.kind == "nonsense":
            return f"p.{ref3}{self.position}Ter"
        return f"p.{ref3}{self.position}{ONE_TO_THREE[self.alt or '']}"


def _amino_acid(token: str, role: str) -> str:
    upper = token.upper()
    if len(upper) == 3:
        if upper not in THREE_TO_ONE:
            raise VariantError(f"'{token}' is not an amino-acid code ({role}).")
        return THREE_TO_ONE[upper]
    if upper not in RESIDUE_VOLUME:
        raise VariantError(f"'{token}' is not a standard amino acid ({role}).")
    return upper


def parse_notation(notation: str) -> ParsedVariant:
    """Read a protein-level change. Pure; raises `VariantError` with a reason."""
    match = _NOTATION.match(notation or "")
    if not match:
        raise VariantError(
            f"Could not read '{notation}'. Use a protein change such as R175H, "
            "p.Arg175His, W53* or F508del."
        )
    ref = _amino_acid(match["ref"], "reference")
    position = int(match["pos"])
    if position < 1:
        raise VariantError("Positions start at 1.")
    alt_token = match["alt"]
    upper = alt_token.upper()

    if upper == "DEL":
        return ParsedVariant(ref, position, None, "deletion")
    if alt_token == "=":
        return ParsedVariant(ref, position, ref, "synonymous")
    if upper in STOP_TOKENS:
        return ParsedVariant(ref, position, "*", "nonsense")
    alt = _amino_acid(alt_token, "alternate")
    kind: VariantKind = "synonymous" if alt == ref else "missense"
    return ParsedVariant(ref, position, alt, kind)


def physicochemistry(parsed: ParsedVariant) -> Physicochemistry:
    alt = parsed.alt if parsed.alt not in (None, "*") else None
    return Physicochemistry(
        hydropathy_ref=KD_HYDROPATHY.get(parsed.ref, 0.0),
        hydropathy_alt=KD_HYDROPATHY.get(alt, 0.0) if alt else None,
        charge_ref=functional.FORMAL_CHARGE.get(parsed.ref, 0),
        charge_alt=functional.FORMAL_CHARGE.get(alt, 0) if alt else None,
        volume_ref=RESIDUE_VOLUME[parsed.ref],
        volume_alt=RESIDUE_VOLUME[alt] if alt else None,
        blosum62=int(_BLOSUM62[parsed.ref][alt]) if alt else None,
    )


# ------------------------------------------------------------- locating


def locate(
    parsed: ParsedVariant,
    chains: list[functional.ChainResidues],
    *,
    entry: Metadata | None,
    chain_filter: str | None,
) -> tuple[list[ResidueRef], Numbering, str]:
    """Every residue in this structure the variant position lands on, or refuse."""
    if chain_filter:
        chains = [c for c in chains if c.label == chain_filter]
        if not chains:
            raise VariantError(f"This structure has no protein chain '{chain_filter}'.")

    reference = functional.entry_sequence(entry) if entry else ""
    if reference:
        if parsed.position > len(reference):
            raise VariantError(
                f"Position {parsed.position} is past the end of the {len(reference)}-residue "
                "UniProt sequence."
            )
        expected = reference[parsed.position - 1]
        if expected != parsed.ref:
            raise VariantError(
                f"UniProt has {ONE_TO_THREE.get(expected, expected)} at position "
                f"{parsed.position}, not {ONE_TO_THREE[parsed.ref]}. Check the position "
                "and the isoform."
            )
        mapping = functional.map_uniprot_positions(reference, chains)
        hits = mapping.positions.get(parsed.position, [])
        if not hits:
            raise VariantError(
                f"UniProt position {parsed.position} is not resolved in this structure: "
                "the construct does not include it, or those residues are disordered."
            )
        mismatched = [ref for ref in hits if ref.residue != parsed.ref]
        if mismatched and len(mismatched) == len(hits):
            raise VariantError(
                f"UniProt position {parsed.position} maps to {mismatched[0].residue} at "
                f"{mismatched[0].key} in this file, which already carries a different "
                "residue there (an engineered or natural variant)."
            )
        hits = [ref for ref in hits if ref.residue == parsed.ref]
        return (
            hits,
            "uniprot",
            UNIPROT_NUMBERING_NOTE,
        )

    hits = []
    found_other: ResidueRef | None = None
    for chain in chains:
        for index, number in enumerate(chain.auth_seq_ids):
            if number != parsed.position or chain.insertion_codes[index]:
                continue
            ref = chain.ref(index + 1)
            if ref.residue == parsed.ref:
                hits.append(ref)
            elif found_other is None:
                found_other = ref
    if hits:
        return (
            hits,
            "author",
            AUTHOR_NUMBERING_NOTE,
        )
    if found_other is not None:
        raise VariantError(
            f"Residue {parsed.position} in this file is {ONE_TO_THREE.get(found_other.residue, found_other.residue)}"
            f" ({found_other.key}), not {ONE_TO_THREE[parsed.ref]}. Without a UniProt entry "
            "the position is read as the file's own numbering, which may differ from the "
            "clinical numbering."
        )
    raise VariantError(f"No residue numbered {parsed.position} in this file.")


# ------------------------------------------------------------ measuring


def _heavy_atoms(residue) -> list:
    return [atom for atom in residue.get_atoms() if not functional._is_hydrogen(atom)]


def _polymer_residues(model) -> dict[str, list]:
    """Chain label -> polymer residues in ordinal order, as the parser counts them."""
    return {
        chain.id: [r for r in chain.get_residues() if r.id[0] == " "]
        for chain in model.get_chains()
    }


def measure_sites(
    structure,
    chains: list[functional.ChainResidues],
    hits: list[ResidueRef],
    *,
    curated: dict[str, list[str]],
) -> tuple[list[VariantSite], str]:
    """Context of every hit. Mutates `structure` (strips non-polymer for SASA)."""
    model = next(structure.get_models())
    polymer = _polymer_residues(model)
    by_label = {chain.label: chain for chain in chains}
    nucleic = {
        label
        for label, residues in polymer.items()
        if residues and is_nucleic_acid_chain([r.get_resname() for r in residues])
    }

    atoms = [
        atom
        for residue in model.get_residues()
        if not functional._is_solvent(residue)
        for atom in _heavy_atoms(residue)
    ]
    search = NeighborSearch(atoms) if atoms else None
    ordinal_of = {
        id(residue): index + 1
        for residues in polymer.values()
        for index, residue in enumerate(residues)
    }

    sites: list[VariantSite] = []
    for hit in hits:
        residue = polymer[hit.chain][hit.ordinal - 1]
        site = VariantSite(residue=hit, curated_sites=curated.get(hit.key, []))
        neighbour_keys: set[str] = set()
        interface: set[str] = set()
        nucleic_touch: set[str] = set()
        ligands: set[str] = set()

        for atom in _heavy_atoms(residue) if search else []:
            for other in search.search(atom.coord, NEIGHBOUR_CUTOFF, level="A"):
                other_residue = other.get_parent()
                if other_residue is residue:
                    continue
                label = other_residue.get_parent().id
                distance = float(atom - other)
                if other_residue.id[0] != " ":
                    # A modified residue inside the chain (SEP, MSE) is part of
                    # the polymer, not a bound ligand, and has no ordinal.
                    if functional._is_in_polymer(other_residue):
                        continue
                    if distance <= CONTACT_CUTOFF:
                        ligands.add(other_residue.get_resname().strip())
                    continue
                if label in nucleic:
                    if distance <= CONTACT_CUTOFF:
                        nucleic_touch.add(label)
                    continue
                chain = by_label.get(label)
                if chain is None:
                    continue
                ordinal = ordinal_of[id(other_residue)]
                neighbour_keys.add(f"{label}:{ordinal}")
                if label != hit.chain:
                    interface.add(label)

        if hit.residue == "C" and "SG" in residue and search:
            for other in search.search(residue["SG"].coord, DISULFIDE_CUTOFF, level="A"):
                partner = other.get_parent()
                if other.get_name() == "SG" and partner is not residue and partner.id[0] == " ":
                    label = partner.get_parent().id
                    if label in by_label:
                        ordinal = ordinal_of[id(partner)]
                        site.disulfide_partner = by_label[label].ref(ordinal)
                        break

        site.neighbours = [
            by_label[key.split(":")[0]].ref(int(key.split(":")[1]))
            for key in sorted(neighbour_keys, key=lambda k: (k.split(":")[0], int(k.split(":")[1])))
        ]
        site.interface_chains = sorted(interface)
        site.nucleic_acid_chains = sorted(nucleic_touch)
        site.ligand_contacts = sorted(ligands)
        sites.append(site)

    # Ligands and partners are measured; now the protein's own surface.
    functional.strip_non_polymer(structure)
    areas, note = functional._residue_areas(structure, chains)
    for site in sites:
        values = areas.get(site.residue.chain, [])
        maximum = functional.MAX_ACCESSIBLE_AREA.get(site.residue.residue)
        if len(values) == len(by_label[site.residue.chain].sequence) and maximum:
            fraction = round(values[site.residue.ordinal - 1] / maximum, 3)
            site.relative_accessibility = fraction
            site.burial = "buried" if fraction < functional.EXPOSURE_THRESHOLD else "exposed"
    return sites, note


# ---------------------------------------------------------------- rules


def flags_for(
    parsed: ParsedVariant, chem: Physicochemistry, site: VariantSite
) -> list[ImpactFlag]:
    """Plain-language reasons for concern at one site. Pure."""
    flags: list[ImpactFlag] = []

    def add(severity, code, text):
        flags.append(ImpactFlag(severity=severity, code=code, text=text))

    if parsed.kind == "synonymous":
        add("info", "synonymous", "No amino-acid change; the protein is unchanged.")
        return flags
    if parsed.kind == "nonsense":
        add("high", "truncation", "A stop codon here truncates the chain; everything after "
            "this position is never made.")
    if parsed.kind == "deletion":
        add("high", "in-frame-deletion", "Deleting a residue shifts every residue after it "
            "by one position along a helix or strand, which can misfold the region.")

    buried = site.burial == "buried"
    if site.disulfide_partner is not None:
        add("high", "disulfide", f"Breaks the disulfide bond to {site.disulfide_partner.key}.")
    if site.ligand_contacts:
        add("high", "ligand-contact", f"Touches bound {', '.join(site.ligand_contacts)}; "
            "binding or catalysis may be affected.")
    if site.nucleic_acid_chains:
        add("high", "nucleic-acid-contact", "Touches DNA/RNA (chain "
            f"{', '.join(site.nucleic_acid_chains)}); nucleic-acid binding may be lost.")
    if site.curated_sites:
        add("high", "curated-site", f"UniProt annotates this position: {'; '.join(site.curated_sites)}.")
    if site.interface_chains:
        add("moderate", "interface", f"Sits at the interface with chain "
            f"{', '.join(site.interface_chains)}; assembly may be weakened.")

    if parsed.kind == "missense" and chem.charge_alt is not None:
        if buried and chem.charge_ref == 0 and chem.charge_alt != 0:
            add("high", "buried-charge", "Places a charged side chain in the buried core, "
                "which is usually destabilising.")
        if chem.charge_ref * chem.charge_alt < 0:
            add("moderate", "charge-reversal", "Reverses the side-chain charge, breaking any "
                "salt bridge this residue makes.")
        elif chem.charge_ref != 0 and chem.charge_alt == 0 and not buried:
            add("info", "charge-loss", "Removes a surface charge.")
        if buried and chem.volume_alt is not None:
            delta = chem.volume_alt - chem.volume_ref
            if delta > VOLUME_CHANGE_THRESHOLD:
                add("moderate", "buried-overpacking", f"A side chain {delta:.0f} A^3 larger "
                    "in a packed core is likely to clash.")
            elif delta < -VOLUME_CHANGE_THRESHOLD:
                add("moderate", "buried-cavity", f"A side chain {-delta:.0f} A^3 smaller "
                    "leaves a cavity in the core.")
        if parsed.alt == "P":
            add("moderate", "proline", "Proline cannot donate a backbone hydrogen bond and "
                "kinks the chain, so it often breaks helices and strands.")
        if parsed.ref == "G":
            add("moderate", "glycine-loss", "Glycine's missing side chain often allows a "
                "backbone conformation other residues cannot adopt.")
        if chem.blosum62 is not None and chem.blosum62 <= -2:
            add("info", "dissimilar", f"Chemically dissimilar exchange (BLOSUM62 {chem.blosum62}).")
    return flags


_RANK = {"high": 2, "moderate": 1, "info": 0}
_CONCERN_ORDER = {"high": 2, "moderate": 1, "low": 0}


def concern_of(flags: list[ImpactFlag]) -> Concern:
    top = max((_RANK[f.severity] for f in flags), default=0)
    return "high" if top == 2 else "moderate" if top == 1 else "low"


def curated_labels(entry: Metadata | None, chains, accession: str | None) -> dict[str, list[str]]:
    """Selection key -> UniProt site labels at that residue."""
    reference = functional.entry_sequence(entry) if entry else ""
    if not reference:
        return {}
    mapping = functional.map_uniprot_positions(reference, chains)
    labels: dict[str, list[str]] = {}
    for bucket in functional.curated_sites(entry, mapping, accession or "").values():
        for site in bucket:
            for ref in site.positions:
                text = f"{site.label} ({site.description})" if site.description else site.label
                labels.setdefault(ref.key, []).append(text)
    return labels


# ------------------------------------------------------------- assembly


def analyse(
    uid: str,
    summary: ProteinSummary,
    structure,
    notation: str,
    *,
    chain: str | None = None,
    entry: Metadata | None = None,
    accession: str | None = None,
) -> VariantImpact:
    """Parse, locate, measure and explain. Raises `VariantError` with a reason."""
    parsed = parse_notation(notation)
    try:
        chains = functional.read_chain_residues(structure, summary)
    except functional.ChainReadError as exc:
        raise VariantError("Residue numbering could not be verified for this file.") from exc
    if not chains:
        raise VariantError("This file contains no standard amino-acid chain.")

    hits, numbering, numbering_note = locate(parsed, chains, entry=entry, chain_filter=chain)
    chem = physicochemistry(parsed)
    sites, surface_note = measure_sites(
        structure, chains, hits, curated=curated_labels(entry, chains, accession)
    )
    for site in sites:
        site.flags = flags_for(parsed, chem, site)
        site.concern = concern_of(site.flags)

    truncated = None
    if parsed.kind == "nonsense":
        first = hits[0]
        length = len(next(c for c in chains if c.label == first.chain).sequence)
        truncated = length - first.ordinal + 1

    notes = [NOT_A_PREDICTION_NOTE, surface_note]
    return VariantImpact(
        id=uid,
        notation=notation,
        hgvs=parsed.hgvs,
        kind=parsed.kind,
        ref=parsed.ref,
        alt=parsed.alt,
        position=parsed.position,
        numbering=numbering,
        numbering_note=numbering_note,
        accession=accession,
        physicochemistry=chem,
        truncated_residues=truncated,
        sites=sites,
        concern=max((s.concern for s in sites), key=_CONCERN_ORDER.__getitem__),
        neighbour_cutoff=NEIGHBOUR_CUTOFF,
        contact_cutoff=CONTACT_CUTOFF,
        notes=notes,
    )
