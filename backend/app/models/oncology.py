"""Oncology context for a protein: where tumours mutate it, which drugs act on
it, what the clinical literature says about its variants, and which pathways
and partners surround it (spec A2, oncology layer).

Every list names its source. Positions are UniProt canonical positions; each
one is checked against the UniProt reference residue before it is mapped onto
the structure, and a position whose residue disagrees is reported unmapped.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SourceState = Literal["ok", "empty", "unavailable", "skipped"]


class SourceStatus(BaseModel):
    name: str
    state: SourceState
    detail: str | None = None


class CountedLabel(BaseModel):
    label: str
    count: int


class Hotspot(BaseModel):
    """A statistically recurrent tumour mutation site (cancerhotspots.org)."""

    residue: str = Field(..., description="Reference residue + position, e.g. 'G12'.")
    position: int
    tumor_count: int = Field(..., description="Tumours carrying a change at this residue.")
    q_value: float | None = None
    alternates: list[CountedLabel] = Field(
        default_factory=list, description="Alternate residues seen, most frequent first."
    )
    tumor_types: list[CountedLabel] = Field(default_factory=list)
    keys: list[str] = Field(default_factory=list, description="Structure residue keys.")


class MutationPosition(BaseModel):
    position: int
    count: int = Field(..., description="Mutated samples with a change at this position.")
    truncating: int = 0
    top_change: str = Field(..., description="Most frequent protein change, e.g. 'G12D'.")
    keys: list[str] = Field(default_factory=list)


class CancerTypeFrequency(BaseModel):
    study_id: str
    cancer_type: str
    mutated_samples: int
    samples: int
    fraction: float


class TcgaSummary(BaseModel):
    """Somatic mutations across the 32 TCGA PanCancer Atlas studies (cBioPortal)."""

    studies: int
    samples: int
    mutated_samples: int
    by_cancer_type: list[CancerTypeFrequency] = Field(default_factory=list)
    mutation_types: list[CountedLabel] = Field(default_factory=list)
    positions: list[MutationPosition] = Field(default_factory=list)


class Drug(BaseModel):
    chembl_id: str
    name: str
    max_phase: float | None = Field(None, description="4 = approved.")
    first_approval: int | None = None
    molecule_type: str | None = None
    mechanism: str | None = None
    action_type: str | None = None
    variant: str | None = Field(None, description="Mutant the mechanism is specific to, e.g. 'G12C'.")
    url: str


class EvidenceItem(BaseModel):
    """One accepted CIViC evidence item."""

    id: int
    profile: str = Field(..., description="CIViC molecular profile, e.g. 'KRAS G12C'.")
    evidence_type: str
    significance: str | None = None
    direction: str | None = None
    level: str | None = Field(None, description="A (validated) to E (inferential).")
    rating: int | None = None
    therapies: list[str] = Field(default_factory=list)
    disease: str | None = None
    positions: list[int] = Field(default_factory=list)
    keys: list[str] = Field(default_factory=list)
    url: str


class Pathway(BaseModel):
    id: str
    name: str
    in_disease: bool = False
    url: str


class Interactor(BaseModel):
    name: str
    score: float


class OncologyContext(BaseModel):
    id: str
    accession: str | None = None
    accession_resolved: bool
    resolution_note: str
    gene: str | None = None
    sequence_length: int = Field(0, description="UniProt canonical length, for plotting.")
    hotspots: list[Hotspot] = Field(default_factory=list)
    tcga: TcgaSummary | None = None
    drugs: list[Drug] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    evidence_total: int = 0
    pathways: list[Pathway] = Field(default_factory=list)
    pathways_total: int = 0
    interactors: list[Interactor] = Field(default_factory=list)
    sources: list[SourceStatus] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
