"""Clinical evidence for a protein's variants (spec A2, clinical half).

The structural half (`models/variant.py`) measures what a change touches in the
coordinate file. This payload is the other half: what clinical and population
databases say about variants at each position, and AlphaMissense's predicted
pathogenicity. Every value names its source; nothing here is computed from the
structure except which residues a UniProt position lands on.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.functional import ResidueRef

#: Normalised ClinVar-style classes. `conflicting` means at least one source
#: calls the variant (likely) pathogenic and at least one (likely) benign.
ClinicalClass = Literal[
    "pathogenic",
    "likely_pathogenic",
    "uncertain",
    "likely_benign",
    "benign",
    "conflicting",
    "other",
]


class Prediction(BaseModel):
    algorithm: str = Field(..., description="Predictor name, e.g. 'SIFT' or 'PolyPhen'.")
    label: str = Field(..., description="Predictor's own call, e.g. 'deleterious'.")
    score: float | None = None


class ClinicalVariant(BaseModel):
    """One amino-acid change reported at a UniProt position."""

    position: int = Field(..., description="First UniProt position affected.")
    end: int = Field(..., description="Last UniProt position affected.")
    ref: str = Field(..., description="Reference residue(s), one-letter.")
    alt: str = Field(..., description="Alternate residue(s); '*' is a stop, '-' a deletion.")
    hgvs: str = Field(..., description="Protein HGVS, e.g. 'p.Glu7Val'.")
    short: str = Field(..., description="Compact form, e.g. 'E7V'.")
    consequence: str | None = None
    clinical_class: ClinicalClass
    significance_labels: list[str] = Field(
        default_factory=list, description="Every significance term reported, as written."
    )
    significance_sources: list[str] = Field(default_factory=list)
    diseases: list[str] = Field(default_factory=list)
    clinvar_ids: list[str] = Field(default_factory=list, description="RCV accessions.")
    dbsnp_id: str | None = None
    gnomad_af: float | None = Field(
        None, description="Highest allele frequency gnomAD reports for this change."
    )
    somatic: bool = Field(False, description="Reported as a somatic (tumour) variant.")
    predictions: list[Prediction] = Field(default_factory=list)
    alphamissense: float | None = Field(
        None,
        description="AlphaMissense mean pathogenicity at this position (0-1). "
        "Per-residue, not per-substitution; see the payload note.",
    )
    residues: list[ResidueRef] = Field(
        default_factory=list, description="Every residue in this structure at the position."
    )


class ResidueEvidence(BaseModel):
    """Per-position roll-up used to paint the structure."""

    position: int
    pathogenic: int = Field(0, description="Pathogenic or likely-pathogenic variants here.")
    benign: int = Field(0, description="Benign or likely-benign variants here.")
    uncertain: int = Field(0, description="Uncertain or conflicting variants here.")
    somatic: int = Field(0, description="Somatic observations (COSMIC / TCGA) here.")
    alphamissense: float | None = None
    keys: list[str] = Field(default_factory=list, description="Structure residue keys here.")


class DiseaseCount(BaseModel):
    name: str
    variants: int = Field(..., description="(Likely) pathogenic variants naming this disease.")


class ClinicalEvidence(BaseModel):
    id: str = Field(..., description="Stored protein uid.")
    accession: str | None = None
    accession_resolved: bool
    resolution_note: str
    gene: str | None = None
    class_counts: dict[str, int] = Field(
        default_factory=dict, description="Variants per clinical class, over the whole protein."
    )
    total_variants: int = Field(0, description="Distinct changes reported, after pooling per-source duplicates.")
    variants: list[ClinicalVariant] = Field(default_factory=list)
    variants_truncated: int = Field(
        0, description="Classified variants left out of `variants` by the size cap."
    )
    residues: list[ResidueEvidence] = Field(default_factory=list)
    top_diseases: list[DiseaseCount] = Field(default_factory=list)
    alphamissense_available: bool = False
    mapped_positions: int = Field(
        0, description="UniProt positions with evidence that land on a residue in this file."
    )
    notes: list[str] = Field(default_factory=list)
