"""Conservation route: PDBe-KB's per-residue profile, mapped onto the structure."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.clinical import stored_protein
from app.models.conservation import ConservationProfile
from app.services import annotations, conservation, functional, oncology
from app.services.external import SourceNotFoundError, SourceUnavailableError
from app.services.oncology_sources import get_oncology_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins", tags=["clinical"])


@router.get("/{uid}/conservation", response_model=ConservationProfile)
async def get_conservation(uid: str) -> ConservationProfile:
    """Information content per residue, from PDBe-KB, on this structure's residues.

    No accession or no PDBe profile is an empty answer with a note; UniProt or
    PDBe being unreachable is a 502.
    """
    from app.api.search import get_rcsb_client, get_uniprot_client

    summary, file_path = stored_protein(uid)
    accession, note = await annotations.resolve_accession(
        summary, uniprot=get_uniprot_client(), rcsb=get_rcsb_client()
    )
    if accession is None:
        return ConservationProfile(protein_id=uid, resolution_note=note)
    base = accession.split("-", 1)[0]
    try:
        entry = await get_oncology_client().uniprot_gene(base)
        body = await conservation.get_conservation_client().profile(base)
    except SourceNotFoundError as exc:
        return ConservationProfile(protein_id=uid, accession=accession, resolution_note=str(exc))
    except SourceUnavailableError as exc:
        logger.warning("Conservation sources failed for %s: %s", base, exc)
        raise HTTPException(
            status_code=502, detail="Could not reach PDBe or UniProt for conservation. Try again."
        ) from exc
    _, _, sequence = oncology.gene_and_entrez(entry)

    def build() -> ConservationProfile:
        from app.api.proteins import parse_structure_for_analytics

        notes: list[str] = []
        keys_for: dict[int, list[str]] = {}
        try:
            chains = functional.read_chain_residues(
                parse_structure_for_analytics(file_path), summary
            )
            mapped = functional.map_uniprot_positions(sequence, chains).positions
            keys_for = {p: [r.key for r in refs] for p, refs in mapped.items()}
        except functional.ChainReadError as exc:
            notes.append(f"Conservation could not be placed on this structure: {exc}")
        try:
            return conservation.build_profile(
                uid,
                accession=accession,
                resolution_note=note,
                body=body,
                sequence=sequence,
                keys_for=keys_for,
                notes=notes,
            )
        except conservation.ConservationError as exc:
            return ConservationProfile(
                protein_id=uid, accession=accession, resolution_note=str(exc)
            )

    return await run_in_threadpool(build)
