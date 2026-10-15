"""Central Dogma Explorer: one variant followed from chromosome to protein.

Every coordinate and base here comes from Ensembl (GRCh38) and UniProt; the
only thing computed is the codon arithmetic, and it is checked: the reference
codon read from Ensembl's CDS must translate to the reference amino acid the
user named, or the request is refused.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Consequence = Literal["missense", "nonsense", "synonymous"]


class Band(BaseModel):
    id: str
    start: int
    end: int
    stain: str


class Chromosome(BaseModel):
    name: str
    length: int
    bands: list[Band] = Field(default_factory=list)


class Exon(BaseModel):
    number: int
    start: int
    end: int


class GeneLocus(BaseModel):
    symbol: str
    description: str | None = None
    ensembl_gene: str
    chromosome: str
    start: int
    end: int
    strand: Literal[1, -1]
    cytoband: str | None = None
    transcript: str
    exons: list[Exon]
    cds_start: int = Field(
        ..., description="Genomic start of the coding region (lowest coordinate)."
    )
    cds_end: int


class VariantChange(BaseModel):
    protein_position: int
    ref_aa: str
    alt_aa: str
    ref_aa3: str
    alt_aa3: str
    ref_codon: str
    alt_codon: str
    changed_bases: list[int] = Field(
        ..., description="0-based offsets within the codon that differ."
    )
    consequence: Consequence
    hgvs_p: str
    hgvs_c: str
    genomic_position: int = Field(..., description="GRCh38 coordinate of the first changed base.")
    genomic_ref: str = Field(..., description="Reference base on the + strand.")
    genomic_alt: str
    exon_number: int | None = None


class CodingWindow(BaseModel):
    """Coding-strand DNA around the variant codon, in frame."""

    first_codon: int = Field(..., description="Protein position of the window's first codon.")
    ref: str
    alt: str
    ref_protein: str
    alt_protein: str


class Scenario(BaseModel):
    id: str
    title: str
    disease: str
    field: str
    gene: str
    change: str
    summary: str
    story: list[str] = Field(
        default_factory=list, description="What goes wrong, one step per line."
    )
    structure_note: str | None = None


class ExplorerView(BaseModel):
    scenario: Scenario | None = None
    gene: GeneLocus
    chromosomes: list[Chromosome]
    variant: VariantChange
    window: CodingWindow
    accession: str | None = Field(None, description="UniProt accession for the 3D hand-off.")
    protein_length: int | None = None
    handoff_ok: bool = Field(
        False,
        description="True when UniProt has the same residue at this position, so the AlphaFold "
        "model's residue N is this variant's residue.",
    )
    notes: list[str] = Field(default_factory=list)
