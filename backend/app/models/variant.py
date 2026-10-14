"""Structural impact of a single protein variant (spec A2, structural half).

Everything here is measured from the coordinate file or read from residue
chemistry. Clinical evidence (ClinVar, population frequency, predicted
pathogenicity) is a separate concern with separate sources and is not mixed
into this payload.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.functional import ResidueRef

VariantKind = Literal["missense", "nonsense", "synonymous", "deletion"]
Severity = Literal["high", "moderate", "info"]
Concern = Literal["high", "moderate", "low"]
Numbering = Literal["uniprot", "author"]


class VariantRequest(BaseModel):
    notation: str = Field(
        ...,
        max_length=64,
        description="Protein-level change, e.g. 'R175H', 'p.Arg175His', 'TP53 R175H', "
        "'W53*', 'F508del'. A leading gene symbol is accepted and ignored.",
    )
    chain: str | None = Field(
        None, max_length=4, description="Restrict to one chain label; all copies when absent."
    )


class Physicochemistry(BaseModel):
    """Residue-identity properties of the reference and the alternate residue."""

    hydropathy_ref: float = Field(..., description="Kyte-Doolittle hydropathy of the reference.")
    hydropathy_alt: float | None = Field(None, description="Kyte-Doolittle of the alternate.")
    charge_ref: int = Field(..., description="Formal side-chain charge at pH 7.")
    charge_alt: int | None = None
    volume_ref: float = Field(..., description="Side-chain volume in cubic angstroms (Zamyatnin 1972).")
    volume_alt: float | None = None
    blosum62: int | None = Field(
        None, description="BLOSUM62 substitution score; negative means rarely exchanged."
    )


class ImpactFlag(BaseModel):
    severity: Severity
    code: str = Field(..., description="Stable machine-readable reason, e.g. 'buried-charge'.")
    text: str = Field(..., description="One sentence a biologist can read.")


class VariantSite(BaseModel):
    """One copy of the variant residue in this structure, with its surroundings."""

    residue: ResidueRef
    relative_accessibility: float | None = Field(
        None,
        description="Shrake-Rupley area over the residue's maximum (Tien et al. 2013), "
        "computed on the whole polymer assembly in this file. None when not computed.",
    )
    burial: Literal["buried", "exposed"] | None = None
    neighbours: list[ResidueRef] = Field(
        default_factory=list,
        description="Protein residues with a heavy atom within the neighbour cutoff.",
    )
    interface_chains: list[str] = Field(
        default_factory=list, description="Other protein chains this residue touches."
    )
    nucleic_acid_chains: list[str] = Field(
        default_factory=list, description="DNA/RNA chains this residue touches."
    )
    ligand_contacts: list[str] = Field(
        default_factory=list, description="Bound ligands (HETATM, not water) it touches."
    )
    disulfide_partner: ResidueRef | None = Field(
        None, description="The cysteine this residue is disulfide-bonded to, if any."
    )
    curated_sites: list[str] = Field(
        default_factory=list, description="UniProt site labels at this position."
    )
    flags: list[ImpactFlag] = Field(default_factory=list)
    concern: Concern = "low"


class VariantImpact(BaseModel):
    id: str = Field(..., description="Stored protein uid.")
    notation: str = Field(..., description="The notation as submitted.")
    hgvs: str = Field(..., description="Normalised protein HGVS, e.g. 'p.Arg175His'.")
    kind: VariantKind
    ref: str = Field(..., description="Reference amino acid, one letter.")
    alt: str | None = Field(None, description="Alternate amino acid; None for a deletion, '*' for a stop.")
    position: int = Field(..., description="Position as written in the notation.")
    numbering: Numbering = Field(
        ...,
        description="'uniprot' when the position was mapped through the UniProt sequence "
        "alignment; 'author' when read as the file's own residue number.",
    )
    numbering_note: str
    accession: str | None = None
    physicochemistry: Physicochemistry
    truncated_residues: int | None = Field(
        None, description="For a stop: residues lost after this position in the chain."
    )
    sites: list[VariantSite]
    concern: Concern = Field(..., description="Highest concern over all sites.")
    neighbour_cutoff: float
    contact_cutoff: float
    notes: list[str] = Field(default_factory=list)
