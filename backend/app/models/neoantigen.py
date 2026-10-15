"""Neoantigen candidates: mutant peptides predicted to be presented on HLA class I."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

BindingClass = Literal["strong", "weak"]


class NeoantigenCandidate(BaseModel):
    peptide: str = Field(..., description="Mutant peptide.")
    wild_type: str = Field(..., description="The same window in the reference protein.")
    allele: str
    length: int
    start: int = Field(..., description="UniProt position of the peptide's first residue.")
    mutant_offset: int = Field(
        ..., description="1-based position of the mutated residue in the peptide."
    )
    mutant_rank: float = Field(
        ..., description="NetMHCpan EL percentile rank (lower binds better)."
    )
    wild_type_rank: float | None = None
    mutant_score: float
    binding: BindingClass
    fold_change: float | None = Field(
        None, description="Wild-type rank over mutant rank; above 1 the mutant is presented better."
    )
    anchor: bool = Field(
        ...,
        description="The change sits at peptide position 2 or the C terminus, the usual HLA-I "
        "anchor positions, so it mainly changes binding rather than what T cells see.",
    )
    residue_keys: list[str] = Field(
        default_factory=list, description="Structure keys of the peptide's residues."
    )


class NeoantigenReport(BaseModel):
    protein_id: str
    accession: str | None = None
    gene: str | None = None
    change: str | None = None
    alleles: list[str] = Field(default_factory=list)
    lengths: list[int] = Field(default_factory=list)
    method: str = "NetMHCpan 4.1 EL (IEDB)"
    peptides_scored: int = 0
    candidates: list[NeoantigenCandidate] = Field(default_factory=list)
    variant_keys: list[str] = Field(default_factory=list)
    resolution_note: str = ""
    notes: list[str] = Field(default_factory=list)
