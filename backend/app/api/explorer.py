"""Central Dogma Explorer routes: one variant from chromosome to protein."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable
from typing import TypeVar

from fastapi import APIRouter, HTTPException, Query

from app.models.explorer import ExplorerView, Scenario
from app.services import explorer
from app.services.external import SourceNotFoundError, SourceUnavailableError

logger = logging.getLogger(__name__)

T = TypeVar("T")

router = APIRouter(prefix="/explorer", tags=["explorer"])


@router.get("/scenarios", response_model=list[Scenario])
def list_scenarios() -> list[Scenario]:
    """The guided disorder stories, in display order."""
    return list(explorer.SCENARIOS.values())


@router.get("", response_model=ExplorerView)
async def explore(
    scenario: str | None = Query(None, max_length=40, description="A scenario id."),
    gene: str | None = Query(None, max_length=20, description="Gene symbol, e.g. BRAF."),
    change: str | None = Query(None, max_length=20, description="Protein change, e.g. V600E."),
) -> ExplorerView:
    """Either `scenario`, or `gene` + `change` for any human protein-coding gene.

    400 when the change does not fit the gene (wrong reference residue, no such
    codon), 404 when Ensembl does not know the gene, 502 when Ensembl is down.
    """
    story = None
    if scenario:
        story = explorer.SCENARIOS.get(scenario)
        if story is None:
            raise HTTPException(status_code=404, detail="No such scenario.")
        gene, change = story.gene, story.change
    if not gene or not change:
        raise HTTPException(status_code=400, detail="Give a scenario, or a gene and a change.")

    client = explorer.get_ensembl_client()
    try:
        symbol = explorer.check_gene(gene)
        _, position, _ = explorer.parse_change(change)
        lookup, assembly, uniprot = await asyncio.gather(
            client.lookup(symbol), client.karyotype(), _optional(client.uniprot(symbol))
        )
        transcript = explorer.canonical_transcript(lookup)
        cds, codon_map = await asyncio.gather(
            client.cds(str(transcript["id"])),
            client.map_codon(str(transcript["Translation"]["id"]), position),
        )
        return explorer.build_view(
            symbol=symbol,
            change=change,
            scenario=story,
            assembly=assembly,
            lookup=lookup,
            cds=cds,
            codon_map=codon_map,
            uniprot=uniprot,
        )
    except explorer.ExplorerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SourceNotFoundError as exc:
        raise HTTPException(
            status_code=404, detail=f"Ensembl does not know gene {gene!r}."
        ) from exc
    except SourceUnavailableError as exc:
        logger.warning("Explorer upstream failed for %s %s: %s", gene, change, exc)
        raise HTTPException(
            status_code=502, detail="Could not reach Ensembl for the gene model. Try again."
        ) from exc


async def _optional(coro: Awaitable[T]) -> T | None:
    """UniProt only powers the 3D hand-off; its absence is a note, not a failure."""
    try:
        return await coro
    except (SourceNotFoundError, SourceUnavailableError) as exc:
        logger.info("UniProt lookup for the explorer failed: %s", exc)
        return None
