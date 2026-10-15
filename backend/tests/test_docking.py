"""Docking — `services/docking.py`, `services/chemcomp.py` and the docking routes.

The structure is 1HSG (HIV-1 protease with indinavir, MK1). The poses are
`fixtures/vina_1HSG_MK1_out.pdbqt`, a real Vina 1.2.7 run through this
service's own preparation, recorded by `fixtures/record_docking_fixtures.py`,
so everything after the search is tested without Vina. The one test that runs
Vina itself is skipped where no binary is installed. `@respx.mock` fails any
unmocked request.
"""

from __future__ import annotations

import httpx
import numpy as np
import pytest
import respx
from Bio.PDB import PDBParser
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models.docking import DockRequest
from app.services import chemcomp, docking, functional, registry
from app.services.parser import parse
from app.storage import local as storage
from tests.helpers import FIXTURES, load_json

client = TestClient(app)
CHEMCOMP_MK1 = chemcomp.RCSB_CHEMCOMP_URL.format(code="MK1")
SITE = "MK1:B:902"


@pytest.fixture(autouse=True)
def fresh_client(monkeypatch):
    monkeypatch.setattr(chemcomp, "_CLIENT", chemcomp.ChemCompClient())


@pytest.fixture(scope="module")
def structure():
    return PDBParser(QUIET=True).get_structure("1HSG", str(FIXTURES / "1HSG.pdb"))


@pytest.fixture(scope="module")
def chains(structure):
    summary = parse(FIXTURES / "1HSG.pdb", "x", source="rcsb", source_id="1HSG")
    return functional.read_chain_residues(structure, summary)


@pytest.fixture(scope="module")
def smiles() -> str:
    return chemcomp.smiles_from(load_json("rcsb_chemcomp_MK1.json")) or ""


@pytest.fixture(scope="module")
def recorded() -> str:
    return (FIXTURES / "vina_1HSG_MK1_out.pdbqt").read_text()


@pytest.fixture(scope="module")
def poses(recorded):
    return docking.parse_poses(recorded)


def register_1hsg() -> str:
    uid, path = storage.store_upload((FIXTURES / "1HSG.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="rcsb", source_id="1HSG"))
    return uid


def fake_vina(monkeypatch, recorded: str) -> None:
    monkeypatch.setattr(docking, "find_vina", lambda: docking.BIN_DIR / "vina")
    monkeypatch.setattr(docking, "vina_version", lambda _: "1.2.7")
    monkeypatch.setattr(docking, "run_vina", lambda *a, **k: (recorded, 42.0))


# ----------------------------------------------------------------- binary


def test_find_vina_honours_the_environment(monkeypatch, tmp_path):
    binary = tmp_path / "vina"
    binary.write_text("")
    monkeypatch.setenv(docking.VINA_ENV, str(binary))
    assert docking.find_vina() == binary
    monkeypatch.setenv(docking.VINA_ENV, str(tmp_path / "missing"))
    assert docking.find_vina() is None


# -------------------------------------------------------------------- box


def test_box_is_padded_and_clipped():
    coords = np.array([[0.0, 0.0, 0.0], [10.0, 2.0, 60.0]])
    center, size = docking.box_around(coords, 8.0)
    assert center == [5.0, 1.0, 30.0]
    assert size == [18.0, docking.MIN_BOX, docking.MAX_BOX]


def test_finds_the_indinavir_site(structure):
    sites = docking.ligand_sites(structure, {"MK1"})
    assert [s.id for s in sites] == [SITE]
    site = sites[0]
    assert (site.code, site.chain, site.auth_seq_id) == ("MK1", "B", 902)
    assert len(site.coords) == 45  # indinavir's heavy atoms
    _, extent = docking.site_extent(site)
    assert all(5 < e < 20 for e in extent)
    assert site.pdb_block.startswith("HETATM") and site.pdb_block.endswith("END\n")
    assert docking.ligand_sites(structure, {"ZZZ"}) == []


def test_residue_box_uses_chain_ordinals(structure, chains):
    coords = docking.residue_coords(structure, ["A:25", "B:25"], chains)
    assert len(coords) == 16  # two Asp, 8 heavy atoms each
    with pytest.raises(docking.DockingError):
        docking.residue_coords(structure, ["Q:1", "A:9999"], chains)


# ---------------------------------------------------------------- receptor


def test_receptor_is_protein_only_and_typed(structure):
    pdb = docking.receptor_pdb(structure)
    assert "HOH" not in pdb and "MK1" not in pdb
    rigid, skipped = docking.prepare_receptor(pdb)
    assert skipped == 0
    atoms = [line for line in rigid.splitlines() if line.startswith("ATOM")]
    assert len(atoms) > 1500
    assert {line[77:79].strip() for line in atoms} >= {"C", "OA", "N", "HD"}


# ------------------------------------------------------------------ ligand


def test_ligand_embedding_is_repeatable(smiles):
    a = docking.ligand_from_smiles(smiles).GetConformer().GetPositions()
    b = docking.ligand_from_smiles(smiles).GetConformer().GetPositions()
    assert np.allclose(a, b)
    pdbqt = docking.prepare_ligand(docking.ligand_from_smiles(smiles))
    assert "ROOT" in pdbqt and "TORSDOF" in pdbqt


@pytest.mark.parametrize(
    ("bad", "reason"),
    [
        ("C1CC", "could not read"),
        ("CCO.CCN", "more than one molecule"),
        ("C" * 130, "heavy atoms"),
    ],
)
def test_ligand_errors_say_why(bad, reason):
    with pytest.raises(docking.DockingError, match=reason):
        docking.ligand_from_smiles(bad)


def test_request_needs_exactly_one_target():
    DockRequest(smiles="CCO", site=SITE)
    DockRequest(smiles="CCO", residues=["A:25"])
    with pytest.raises(ValidationError):
        DockRequest(smiles="CCO")
    with pytest.raises(ValidationError):
        DockRequest(smiles="CCO", site=SITE, residues=["A:25"])
    with pytest.raises(ValidationError):
        DockRequest(smiles="CCO", site=SITE, exhaustiveness=64)


# ------------------------------------------------------------------- poses


def test_poses_are_read_back_ranked(poses):
    assert len(poses) == 9
    affinities = [p.affinity for p in poses]
    assert affinities == sorted(affinities)
    assert affinities[0] < -10
    assert poses[0].rmsd_lb == 0 and poses[0].rmsd_ub == 0
    assert all(p.mol.GetNumConformers() == 1 for p in poses)
    assert poses[0].mol.GetNumHeavyAtoms() == 45


def test_top_pose_reproduces_the_crystal(poses, structure, smiles):
    block = docking.ligand_sites(structure, {"MK1"})[0].pdb_block
    rmsd = docking.crystal_rmsd(poses[0].mol, smiles, block)
    assert rmsd is not None and rmsd < 2.0
    assert docking.crystal_rmsd(poses[0].mol, "CCO", block) is None


def test_top_pose_sits_between_the_catalytic_aspartates(poses, structure, chains):
    contacts = docking.pose_contacts(poses[0].mol, structure, chains)
    assert {"A:25", "B:25"} <= set(contacts)  # Asp25 of both monomers
    assert docking.molblock(poses[0].mol).rstrip().endswith("M  END")


def test_dock_assembles_a_result(monkeypatch, structure, chains, smiles, recorded):
    fake_vina(monkeypatch, recorded)
    sites = docking.ligand_sites(structure, {"MK1"})
    result = docking.dock(
        "x", structure, chains, DockRequest(smiles=smiles, site=SITE), sites, docking.BIN_DIR
    )
    assert result.site_label == "MK1 site, chain B"
    assert result.vina_version == "1.2.7" and result.elapsed_seconds == 42.0
    assert [p.rank for p in result.poses] == list(range(1, 10))
    assert result.poses[0].rmsd_to_crystal < 2.0
    assert result.notes == []

    other = docking.dock(
        "x", structure, chains, DockRequest(smiles="CCO", site=SITE), sites, docking.BIN_DIR
    )
    assert other.poses[0].rmsd_to_crystal is None
    assert "not MK1" in other.notes[0]

    with pytest.raises(docking.DockingError, match="no ligand"):
        docking.dock(
            "x", structure, chains, DockRequest(smiles="CCO", site="HEM:A:1"), sites, docking.BIN_DIR
        )


# --------------------------------------------------------------- chemcomp


@respx.mock
async def test_chemcomp_smiles_is_cached_and_soft():
    route = respx.get(CHEMCOMP_MK1).mock(
        return_value=httpx.Response(200, json=load_json("rcsb_chemcomp_MK1.json"))
    )
    c = chemcomp.ChemCompClient()
    first = await c.smiles("mk1")
    assert first and first.startswith("CC(C)(C)NC(=O)[C@@H]1")
    assert await c.smiles("MK1") == first
    assert route.call_count == 1

    respx.get(chemcomp.RCSB_CHEMCOMP_URL.format(code="ZZZ")).mock(
        return_value=httpx.Response(404)
    )
    respx.get(chemcomp.RCSB_CHEMCOMP_URL.format(code="HEM")).mock(
        return_value=httpx.Response(503)
    )
    assert await c.smiles("ZZZ") is None
    assert await c.smiles("HEM") is None
    assert await c.smiles("../x") is None


# ------------------------------------------------------------------ routes


@respx.mock
def test_sites_route(monkeypatch):
    uid = register_1hsg()
    respx.get(CHEMCOMP_MK1).mock(
        return_value=httpx.Response(200, json=load_json("rcsb_chemcomp_MK1.json"))
    )
    monkeypatch.setattr(docking, "find_vina", lambda: None)
    body = client.get(f"/api/proteins/{uid}/docking/sites").json()
    assert body["vina_available"] is False and "install_vina.py" in body["vina_note"]
    [site] = body["sites"]
    assert site["id"] == SITE and site["atom_count"] == 45
    assert site["name"] and site["smiles"].startswith("CC(C)(C)")


@respx.mock
def test_sites_route_without_the_rcsb(monkeypatch):
    uid = register_1hsg()
    respx.get(CHEMCOMP_MK1).mock(return_value=httpx.Response(503))
    monkeypatch.setattr(docking, "find_vina", lambda: docking.BIN_DIR / "vina")
    body = client.get(f"/api/proteins/{uid}/docking/sites").json()
    assert body["vina_available"] is True
    assert body["sites"][0]["smiles"] is None


def test_sites_route_404():
    assert client.get("/api/proteins/nope/docking/sites").status_code == 404


def test_dock_route(monkeypatch, recorded, smiles):
    uid = register_1hsg()
    route = f"/api/proteins/{uid}/dock"

    monkeypatch.setattr(docking, "find_vina", lambda: None)
    response = client.post(route, json={"smiles": smiles, "site": SITE})
    assert response.status_code == 503

    fake_vina(monkeypatch, recorded)
    body = client.post(route, json={"smiles": smiles, "site": SITE}).json()
    assert len(body["poses"]) == 9 and body["poses"][0]["rmsd_to_crystal"] < 2.0
    assert body["poses"][0]["sdf"].rstrip().endswith("M  END")

    by_residues = client.post(route, json={"smiles": smiles, "residues": ["A:25", "B:25"]})
    assert by_residues.status_code == 200
    assert by_residues.json()["site_label"] == "2 selected residues"

    assert client.post(route, json={"smiles": "C1CC", "site": SITE}).status_code == 400
    assert client.post(route, json={"smiles": smiles, "site": "HEM:A:1"}).status_code == 400
    assert client.post(route, json={"smiles": smiles}).status_code == 422


# -------------------------------------------------------------- real vina


@pytest.mark.skipif(docking.find_vina() is None, reason="no Vina binary installed")
def test_real_vina_run(structure, chains):
    sites = docking.ligand_sites(structure, {"MK1"})
    request = DockRequest(smiles="OC(=O)c1ccccc1O", site=SITE, exhaustiveness=1, num_modes=3)
    result = docking.dock("x", structure, chains, request, sites, docking.find_vina())
    assert 1 <= len(result.poses) <= 3
    assert result.poses[0].affinity < -3
    assert result.vina_version and result.vina_version.startswith("1.2")
