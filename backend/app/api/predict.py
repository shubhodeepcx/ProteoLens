"""P19 -- predict a structure from a sequence and register it like an upload.

The model comes back from ESMFold, is normalised (pLDDT on 0-100, a HEADER and
TITLE), stored, parsed and registered through the same `ingest` path uploads
and imports use, so `/viewer/{id}` and every analysis tab work on it unchanged.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models.predict import PredictRequest
from app.models.protein import ProteinSummary
from app.services import esmfold, ingest
from app.services.external import SourceUnavailableError
from app.storage import local as storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins/predict", tags=["predict"])


@router.post("", response_model=ProteinSummary)
async def predict_structure(payload: PredictRequest) -> ProteinSummary:
    """Fold `sequence` with ESMFold and return the stored model's summary.

    422 when the sequence cannot be folded (with the reason), 502 when the
    ESMFold service fails, 500 when the model cannot be stored or parsed.
    """
    try:
        sequence = esmfold.clean_sequence(payload.sequence)
    except esmfold.InvalidSequenceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    name = (payload.name or "").strip() or f"ESMFold model, {len(sequence)} residues"

    try:
        raw = await esmfold.fold(sequence)
        pdb_text = esmfold.normalise_pdb(raw, name=name)
    except SourceUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        uid, stored_path = storage.store_upload(pdb_text.encode(), "pdb")
    except (ValueError, OSError) as exc:
        logger.error("Could not store predicted model: %s", exc)
        raise HTTPException(status_code=500, detail="Could not store the predicted model.") from exc

    try:
        summary = await ingest.parse_and_register(
            stored_path, uid, source="predicted", name=name
        )
    except ingest.StructureParseError as exc:
        logger.warning("Predicted model failed to parse: %r", exc)
        raise HTTPException(
            status_code=500, detail="The predicted model could not be read."
        ) from exc

    logger.info("Predicted %d-residue model as %s", len(sequence), uid)
    return summary
