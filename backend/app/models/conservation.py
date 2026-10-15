"""Per-residue evolutionary conservation of a protein, mapped onto its structure."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ResidueConservation(BaseModel):
    position: int = Field(..., description="UniProt position.")
    residue: str = Field(..., description="The UniProt residue at this position.")
    information: float = Field(
        ...,
        description="Information content of the position's amino-acid profile, in bits (0 to 4.32).",
    )
    dominant: str = Field(..., description="The most probable amino acid among homologues.")
    dominant_probability: float
    keys: list[str] = Field(default_factory=list, description="Structure residue keys.")


class ConservationProfile(BaseModel):
    protein_id: str
    accession: str | None = None
    accession_resolved: bool = False
    resolution_note: str = ""
    source: str = "PDBe-KB sequence conservation"
    sequence_length: int = 0
    residues: list[ResidueConservation] = Field(default_factory=list)
    most_conserved: list[int] = Field(
        default_factory=list, description="Positions of the most conserved residues, best first."
    )
    mean_information: float | None = None
    placed: int = Field(0, description="Positions that land on a residue in this structure.")
    notes: list[str] = Field(default_factory=list)
