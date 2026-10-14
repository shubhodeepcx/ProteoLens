"""Pydantic models for the P14 sequence tools (ORFs, restriction map, primers, CRISPR).

Every tool takes a raw DNA sequence and nothing else from the server: no stored
protein, no external service. Positions are always 1-based and always on the
forward strand of the sequence as submitted, whichever strand a feature sits on,
so the client can draw every result on one ruler.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Strand = Literal["+", "-"]


class SequenceRequest(BaseModel):
    """Body shared by every sequence tool."""

    sequence: str = Field(
        ...,
        description=(
            "DNA or RNA, plain or FASTA. Header lines, whitespace and digits are "
            "ignored; U is read as T. Only A, C, G, T and N are accepted."
        ),
    )


class SequenceStats(BaseModel):
    length: int
    gc_percent: float
    counts: dict[str, int]
    reverse_complement: str
    molecular_weight_ds: float = Field(..., description="Double-stranded DNA, Da.")


# ---------------------------------------------------------------- ORFs


class OrfRequest(SequenceRequest):
    min_codons: int = Field(30, ge=5, le=1000, description="Shortest ORF reported, stop excluded.")
    require_atg: bool = Field(True, description="Start at ATG; off means stop-to-stop.")


class Orf(BaseModel):
    frame: Literal[1, 2, 3, -1, -2, -3]
    strand: Strand
    start: int = Field(..., description="1-based, forward-strand coordinate of the lower end.")
    end: int = Field(..., description="1-based, inclusive; includes the stop codon when present.")
    length_nt: int
    length_aa: int
    complete: bool = Field(..., description="False when the sequence ends before a stop codon.")
    protein: str


class FrameTranslation(BaseModel):
    frame: Literal[1, 2, 3, -1, -2, -3]
    protein: str


class OrfResponse(BaseModel):
    stats: SequenceStats
    orfs: list[Orf]
    frames: list[FrameTranslation]


# ---------------------------------------------------------------- restriction


class RestrictionRequest(SequenceRequest):
    circular: bool = False
    enzymes: list[str] | None = Field(
        None, description="Enzyme names. Defaults to a panel of common cloning enzymes."
    )


class EnzymeCuts(BaseModel):
    name: str
    site: str = Field(..., description="Recognition site with the cut marked, e.g. G^AATT_C.")
    overhang: Literal["5'", "3'", "blunt", "unknown"]
    cuts: list[int] = Field(
        ..., description="1-based position of the first base after each top-strand cut."
    )
    fragments: list[int] = Field(..., description="Fragment sizes in bp, largest first.")


class RestrictionResponse(BaseModel):
    length: int
    circular: bool
    enzymes: list[EnzymeCuts] = Field(..., description="Enzymes that cut, fewest cuts first.")
    unique_cutters: list[str]
    non_cutters: list[str]


# ---------------------------------------------------------------- primers


class PrimerRequest(SequenceRequest):
    target_start: int | None = Field(
        None, ge=1, description="1-based start of the region to amplify."
    )
    target_end: int | None = Field(None, ge=1, description="1-based end of the region to amplify.")
    min_length: int = Field(18, ge=15, le=35)
    max_length: int = Field(25, ge=15, le=35)
    target_tm: float = Field(60.0, ge=45, le=75)
    max_pairs: int = Field(5, ge=1, le=20)


class Primer(BaseModel):
    sequence: str
    strand: Strand
    start: int = Field(..., description="1-based forward-strand coordinate of the lower end.")
    end: int
    length: int
    tm: float = Field(..., description="Nearest-neighbour Tm, 50 mM Na+, 250 nM primer.")
    gc_percent: float
    gc_clamp: bool
    max_run: int = Field(..., description="Longest single-base run.")
    self_dimer_3prime: int = Field(
        ..., description="Longest 3'-end self-complementary stretch, bp."
    )
    penalty: float


class PrimerPair(BaseModel):
    forward: Primer
    reverse: Primer
    product_size: int
    tm_difference: float
    pair_dimer_3prime: int
    penalty: float


class PrimerResponse(BaseModel):
    target_start: int
    target_end: int
    pairs: list[PrimerPair]
    notes: list[str]


# ---------------------------------------------------------------- CRISPR


class CrisprRequest(SequenceRequest):
    target_start: int | None = Field(None, ge=1)
    target_end: int | None = Field(None, ge=1)
    max_guides: int = Field(20, ge=1, le=200)


class CrisprGuide(BaseModel):
    protospacer: str = Field(..., description="20 nt, 5'->3', as it would be cloned.")
    pam: str
    strand: Strand
    start: int = Field(
        ..., description="1-based forward-strand coordinate of the protospacer's lower end."
    )
    end: int
    cut_site: int = Field(
        ..., description="Blunt cut lies between this base and the next, forward-strand numbering."
    )
    gc_percent: float
    flags: list[str]
    off_targets_in_sequence: int = Field(
        ..., description="Other NGG sites in the submitted sequence within 3 mismatches."
    )
    score: float = Field(..., description="0-100 heuristic. Not Rule Set 2 / Azimuth.")


class CrisprResponse(BaseModel):
    nuclease: str
    guides: list[CrisprGuide]
    total_sites: int
    notes: list[str]
