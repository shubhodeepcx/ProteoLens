"""Oncology route for a stored protein: hotspots, TCGA, drugs, CIViC, pathways."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.clinical import stored_protein
from app.models.oncology import OncologyContext
from app.services import annotations, functional, oncology
from app.services.external import SourceNotFoundError
from app.services.oncology_sources import get_oncology_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins", tags=["clinical"])


@router.get("/{uid}/oncology", response_model=OncologyContext)
async def get_oncology(uid: str) -> OncologyContext:
    """Cancer context for a protein, from six sources fetched concurrently.

    The UniProt entry supplies the gene symbol, Entrez id and reference
    sequence the other sources are keyed by; without it the route is a 502.
    After that every source fails on its own: a section whose source is down
    comes back empty with a status and a note, and the rest still render.
    """
    from app.api.search import get_rcsb_client, get_uniprot_client

    summary, file_path = stored_protein(uid)
    accession, note = await annotations.resolve_accession(
        summary, uniprot=get_uniprot_client(), rcsb=get_rcsb_client()
    )
    if accession is None:
        return oncology.empty_oncology_context(uid, note)
    base = accession.split("-", 1)[0]

    client = get_oncology_client()
    try:
        entry = await client.uniprot_gene(base)
    except SourceNotFoundError:
        return oncology.empty_oncology_context(
            uid, f"UniProt has no entry for {base}.", accession=accession
        )
    except Exception as exc:
        logger.warning("UniProt gene lookup failed for %s: %s", base, exc)
        raise HTTPException(
            status_code=502, detail="Could not reach UniProt for this protein's gene. Try again."
        ) from exc

    gene, entrez, sequence = oncology.gene_and_entrez(entry)
    jobs: dict[str, Any] = {
        "chembl": client.chembl_drugs(base),
        "reactome": client.reactome(base),
    }
    if gene:
        jobs["hotspots"] = client.hotspots(gene)
        jobs["civic"] = client.civic_evidence(gene)
        jobs["string"] = client.string_partners(gene)
    if entrez is not None:
        jobs["tcga"] = client.tcga_mutations(entrez)
    values = await asyncio.gather(*jobs.values(), return_exceptions=True)
    results = dict(zip(jobs.keys(), values, strict=True))
    for name, value in results.items():
        if isinstance(value, BaseException) and not isinstance(value, SourceNotFoundError):
            logger.warning("Oncology source %s failed for %s: %s", name, base, value)

    def build() -> OncologyContext:
        from app.api.proteins import parse_structure_for_analytics

        notes: list[str] = []
        positions = None
        try:
            chains = functional.read_chain_residues(
                parse_structure_for_analytics(file_path), summary
            )
            positions = functional.map_uniprot_positions(sequence, chains)
        except functional.ChainReadError as exc:
            notes.append(f"Positions could not be placed on this structure: {exc}")
        return oncology.build_oncology_context(
            uid,
            accession=accession,
            resolution_note=note,
            gene=gene,
            sequence=sequence,
            positions=positions,
            results=results,
            notes=notes,
        )

    return await run_in_threadpool(build)
