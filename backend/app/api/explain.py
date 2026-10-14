"""``POST /api/proteins/{uid}/explain`` — P16 plain-language explanation."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.proteins import compute_analytics, parse_structure_for_analytics
from app.models.explain import ExplainRequest, ExplainResponse
from app.models.protein import ProteinSummary
from app.services import explain as explain_service
from app.services import functional, registry
from app.storage import local as storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins", tags=["proteins"])


@router.post("/{uid}/explain", response_model=ExplainResponse)
async def explain_protein(uid: str, body: ExplainRequest) -> ExplainResponse:
    """Explain the open structure, or answer a question about it, at the chosen level.

    503 when no API key is configured, 502 when the model API fails; the
    measured facts are computed locally either way.
    """
    try:
        storage.validate_uid(uid)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Protein not found") from exc
    summary = registry.get(uid)
    if not summary:
        raise HTTPException(status_code=404, detail="Protein not found")
    try:
        file_path = storage.get_file(uid)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

    if not explain_service.api_key():
        raise HTTPException(
            status_code=503,
            detail="The Explain assistant needs EXPLAIN_API_KEY set in the backend's environment.",
        )

    facts = await run_in_threadpool(_facts, uid, summary, file_path, body.selection)
    try:
        answer, model = await explain_service.explain(facts, body.question, body.level)
    except explain_service.ExplainUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except explain_service.ExplainFailed as exc:
        logger.warning("Explain failed for %s: %s", uid, exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ExplainResponse(answer=answer, model=model, facts=facts)


def _facts(uid: str, summary: ProteinSummary, file_path: Path, selection: list[str]) -> list[str]:
    try:
        analytics = compute_analytics(uid, summary, file_path)
    except Exception:  # facts degrade; the explanation still runs
        logger.exception("Analytics failed while building explain facts for %s", uid)
        analytics = None
    try:
        chains = functional.read_chain_residues(parse_structure_for_analytics(file_path), summary)
    except functional.ChainReadError:
        chains = []
    return explain_service.build_facts(summary, analytics, chains, selection)
