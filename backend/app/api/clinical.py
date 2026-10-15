"""Clinical and disease-context routes for a stored protein (spec A2, clinical half)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.models.clinical import ClinicalEvidence
from app.models.protein import ProteinSummary
from app.services import annotations, clinical, functional, registry
from app.services.external import Metadata, SourceNotFoundError
from app.storage import local as storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins", tags=["clinical"])


def stored_protein(uid: str) -> tuple[ProteinSummary, Path]:
    """The registry summary and stored file for `uid`, or a 404."""
    try:
        storage.validate_uid(uid)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Protein not found") from exc
    summary = registry.get(uid)
    if not summary:
        raise HTTPException(status_code=404, detail="Protein not found")
    try:
        return summary, storage.get_file(uid)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc


@router.get("/{uid}/clinical-evidence", response_model=ClinicalEvidence)
async def get_clinical_evidence(uid: str) -> ClinicalEvidence:
    """ClinVar / gnomAD / disease evidence and AlphaMissense, mapped onto this file.

    The two upstreams are fetched concurrently and fail independently: with the
    variant data down the route is a 502 (there is nothing to show), with only
    AlphaMissense down the variants come back with a note saying why the
    colouring is missing. "No variants reported" is a 200 with an empty list.
    """
    from app.api.search import get_rcsb_client, get_uniprot_client

    summary, file_path = stored_protein(uid)
    accession, note = await annotations.resolve_accession(
        summary, uniprot=get_uniprot_client(), rcsb=get_rcsb_client()
    )
    if accession is None:
        return clinical.empty_clinical_evidence(uid, note)

    client = clinical.get_clinical_client()
    variation_result, am_result = await asyncio.gather(
        client.fetch_variation(accession),
        client.fetch_alphamissense(accession),
        return_exceptions=True,
    )

    notes: list[str] = []
    variation: Metadata | None = None
    if isinstance(variation_result, SourceNotFoundError):
        notes.append(f"The EBI Proteins API reports no variants for {accession}.")
    elif isinstance(variation_result, BaseException):
        logger.warning("Variation fetch failed for %s: %s", accession, variation_result)
        raise HTTPException(
            status_code=502,
            detail="Could not reach the EBI Proteins API for variant evidence. Try again.",
        ) from variation_result
    else:
        variation = variation_result

    alphamissense: Metadata | None = None
    if isinstance(am_result, SourceNotFoundError):
        notes.append(
            "AlphaFold DB has no AlphaMissense annotation for this accession "
            "(it covers the human proteome only)."
        )
    elif isinstance(am_result, BaseException):
        logger.warning("AlphaMissense fetch failed for %s: %s", accession, am_result)
        notes.append("AlphaFold DB could not be reached, so AlphaMissense is missing.")
    else:
        alphamissense = am_result

    return await run_in_threadpool(
        _build, uid, summary, file_path, accession, note, variation, alphamissense, notes
    )


def _build(
    uid: str,
    summary: ProteinSummary,
    file_path: Path,
    accession: str,
    note: str,
    variation: Metadata | None,
    alphamissense: Metadata | None,
    notes: list[str],
) -> ClinicalEvidence:
    """The blocking half: parse the file and align the UniProt sequence to it."""
    from app.api.proteins import parse_structure_for_analytics

    sequence = str((variation or {}).get("sequence") or (alphamissense or {}).get("sequence") or "")
    positions = None
    if sequence:
        try:
            chains = functional.read_chain_residues(
                parse_structure_for_analytics(file_path), summary
            )
            positions = functional.map_uniprot_positions(sequence, chains)
        except functional.ChainReadError as exc:
            notes.append(f"Positions could not be placed on this structure: {exc}")
    return clinical.build_clinical_evidence(
        uid,
        accession=accession,
        resolution_note=note,
        variation=variation,
        alphamissense=alphamissense,
        positions=positions,
        notes=notes,
    )
