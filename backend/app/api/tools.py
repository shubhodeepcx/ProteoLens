"""``/api/tools/*`` — P14 sequence tools on a submitted DNA sequence.

Stateless and offline: nothing is stored and no external service is called, so
the only failure mode is bad input, reported as a 422 with the reason.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.models.seqtools import (
    CrisprRequest,
    CrisprResponse,
    OrfRequest,
    OrfResponse,
    PrimerRequest,
    PrimerResponse,
    RestrictionRequest,
    RestrictionResponse,
)
from app.services import seqtools

router = APIRouter(prefix="/tools", tags=["tools"])


async def _run(fn, *args, **kwargs):
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except seqtools.SequenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _seq(text: str) -> str:
    try:
        return seqtools.clean(text)
    except seqtools.SequenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/orfs", response_model=OrfResponse)
async def orfs(body: OrfRequest) -> OrfResponse:
    """Six-frame translation and open reading frames."""
    return await _run(seqtools.find_orfs, _seq(body.sequence), body.min_codons, body.require_atg)


@router.post("/restriction", response_model=RestrictionResponse)
async def restriction(body: RestrictionRequest) -> RestrictionResponse:
    """Restriction map against a panel of common enzymes, or a chosen set."""
    return await _run(seqtools.restriction_map, _seq(body.sequence), body.circular, body.enzymes)


@router.post("/primers", response_model=PrimerResponse)
async def primers(body: PrimerRequest) -> PrimerResponse:
    """PCR primer pairs flanking a target region."""
    return await _run(
        seqtools.design_primers,
        _seq(body.sequence),
        body.target_start,
        body.target_end,
        body.min_length,
        body.max_length,
        body.target_tm,
        body.max_pairs,
    )


@router.post("/crispr", response_model=CrisprResponse)
async def crispr(body: CrisprRequest) -> CrisprResponse:
    """SpCas9 guide RNAs cutting inside a target region."""
    return await _run(
        seqtools.design_guides,
        _seq(body.sequence),
        body.target_start,
        body.target_end,
        body.max_guides,
    )
