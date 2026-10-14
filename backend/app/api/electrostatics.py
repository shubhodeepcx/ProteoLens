"""``GET /api/proteins/{uid}/electrostatics`` — P15 surface electrostatics.

Computed from the stored coordinate file alone, so like `/compounds` it needs
nothing external and cannot 502.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.proteins import parse_structure_for_analytics
from app.models.electrostatics import ElectrostaticsResponse
from app.models.protein import ProteinSummary
from app.services import electrostatics, registry
from app.storage import local as storage

router = APIRouter(prefix="/proteins", tags=["proteins"])


@router.get("/{uid}/electrostatics", response_model=ElectrostaticsResponse)
async def get_electrostatics(uid: str) -> ElectrostaticsResponse:
    """Per-residue Coulombic surface potential, charged patches, net charge and dipole."""
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
    return await run_in_threadpool(_compute, uid, summary, file_path)


def _compute(uid: str, summary: ProteinSummary, file_path: Path) -> ElectrostaticsResponse:
    structure = parse_structure_for_analytics(file_path)
    return electrostatics.build_electrostatics(uid, summary, structure)
