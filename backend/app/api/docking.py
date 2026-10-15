"""Docking routes: the ligand sites in a structure, and a Vina run against it."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.api.clinical import stored_protein
from app.models.docking import DockingSite, DockingSites, DockRequest, DockResult
from app.services import compounds, docking, functional
from app.services.chemcomp import get_chemcomp_client

if TYPE_CHECKING:
    from Bio.PDB.Structure import Structure

    from app.services.functional import ChainResidues

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins", tags=["docking"])

SITE_CATEGORIES = ("ligand", "cofactor")


def _read(
    uid: str,
) -> tuple[Structure, list[ChainResidues], list[docking.Site], dict[str, str]]:
    """(structure, chains, sites, names) for a stored protein; blocking."""
    from app.api.proteins import parse_structure_for_analytics

    summary, file_path = stored_protein(uid)
    structure = parse_structure_for_analytics(file_path)
    groups = compounds.build_compounds(
        uid, summary, structure, compounds.read_component_info(file_path)
    ).groups
    names = {g.code: g.name for g in groups if g.category in SITE_CATEGORIES}
    try:
        chains = functional.read_chain_residues(structure, summary)
    except functional.ChainReadError as exc:
        raise docking.DockingError(f"The protein chains could not be read: {exc}") from exc
    return structure, chains, docking.ligand_sites(structure, set(names)), names


@router.get("/{uid}/docking/sites", response_model=DockingSites)
async def get_docking_sites(uid: str) -> DockingSites:
    """Ligands and cofactors in the file, as boxes to dock into, with their SMILES."""
    stored_protein(uid)
    try:
        _, _, sites, names = await run_in_threadpool(_read, uid)
    except docking.DockingError:
        sites, names = [], {}
    codes = sorted({s.code for s in sites})
    client = get_chemcomp_client()
    smiles = dict(zip(codes, await asyncio.gather(*(client.smiles(c) for c in codes)), strict=True))
    binary = docking.find_vina()
    out: list[DockingSite] = []
    for site in sites:
        center, size = docking.site_extent(site)
        out.append(
            DockingSite(
                id=site.id,
                code=site.code,
                name=names.get(site.code),
                chain=site.chain,
                auth_seq_id=site.auth_seq_id,
                atom_count=len(site.coords),
                center=center,
                size=size,
                smiles=smiles.get(site.code),
            )
        )
    return DockingSites(
        protein_id=uid,
        sites=out,
        vina_available=binary is not None,
        vina_note=None if binary else docking.unavailable_note(),
    )


@router.post("/{uid}/dock", response_model=DockResult)
async def post_dock(uid: str, request: DockRequest) -> DockResult:
    """Dock one SMILES with AutoDock Vina. Synchronous: one to a few minutes.

    A request Vina cannot run (bad SMILES, unknown site, empty selection) is a
    400; no Vina binary on the server is a 503.
    """
    stored_protein(uid)
    binary = docking.find_vina()
    if binary is None:
        raise HTTPException(status_code=503, detail=docking.unavailable_note())

    def run() -> DockResult:
        structure, chains, sites, _ = _read(uid)
        return docking.dock(uid, structure, chains, request, sites, binary)

    try:
        return await run_in_threadpool(run)
    except docking.VinaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except docking.DockingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
