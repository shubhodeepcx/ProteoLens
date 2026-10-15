"""Oncology layer — `services/oncology.py` and `GET /{uid}/oncology`.

Every upstream body comes from `fixtures/oncology_P01116.json`, recorded live on
2026-10-14 by `fixtures/record_oncology_fixtures.py` (KRAS). The structure is
6OIM: KRAS G12C with sotorasib bound, so residue 12 in the file is a Cys while
the UniProt reference is Gly. `@respx.mock` fails any unmocked request.
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import oncology, oncology_sources, registry
from app.services.functional import ChainResidues, map_uniprot_positions
from app.services.parser import parse
from app.storage import local as storage
from tests.helpers import FIXTURES, load_json

client = TestClient(app)
ROUTE = "/api/proteins/{uid}/oncology"


@pytest.fixture(autouse=True)
def fresh_oncology_client(monkeypatch):
    monkeypatch.setattr(oncology_sources, "_CLIENT", oncology_sources.OncologyClient())


@pytest.fixture(scope="module")
def rec() -> dict:
    return load_json("oncology_P01116.json")


def register_6oim() -> str:
    uid, path = storage.store_upload((FIXTURES / "6OIM.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="uniprot", source_id="P01116"))
    return uid


def mock_all(rec: dict, *, down: set[str] = frozenset()) -> None:
    def ok(body: object) -> httpx.Response:
        return httpx.Response(200, json=body)

    def maybe(name: str, body: object) -> httpx.Response:
        return httpx.Response(503) if name in down else ok(body)

    respx.get(url__startswith="https://rest.uniprot.org/uniprotkb/P01116.json").mock(
        return_value=maybe("uniprot", rec["uniprot"])
    )
    respx.get(url__startswith="https://www.cancerhotspots.org/").mock(
        return_value=maybe("hotspots", rec["hotspots"])
    )
    respx.get(url__startswith=oncology_sources.CBIO_STUDIES_URL).mock(
        return_value=maybe("tcga", rec["cbio_studies"])
    )
    respx.post(url__startswith=oncology_sources.CBIO_MUTATIONS_URL).mock(
        return_value=maybe("tcga", rec["cbio_mutations"])
    )
    respx.get(url__startswith=oncology_sources.CHEMBL_TARGETS_URL).mock(
        return_value=maybe("chembl", rec["chembl_targets"])
    )

    def mechanisms(request: httpx.Request) -> httpx.Response:
        target = request.url.params["target_chembl_id"]
        return maybe("chembl", rec["chembl_mechanisms"][target])

    respx.get(url__startswith=oncology_sources.CHEMBL_MECHANISMS_URL).mock(side_effect=mechanisms)
    respx.get(url__startswith="https://www.ebi.ac.uk/chembl/api/data/molecule/set/").mock(
        return_value=maybe("chembl", rec["chembl_molecules"])
    )
    pages = iter(rec["civic_pages"])
    respx.post(oncology_sources.CIVIC_URL).mock(
        side_effect=lambda _r: httpx.Response(503) if "civic" in down else ok(next(pages))
    )
    respx.get(url__startswith="https://reactome.org/").mock(
        return_value=maybe("reactome", rec["reactome"])
    )
    respx.get(url__startswith=oncology_sources.STRING_URL).mock(
        return_value=maybe("string", rec["string"])
    )


# ------------------------------------------------------------------ pure parts


def test_gene_and_entrez(rec: dict) -> None:
    gene, entrez, sequence = oncology.gene_and_entrez(rec["uniprot"])
    assert (gene, entrez, len(sequence)) == ("KRAS", 3845, 189)


def test_placer_refuses_a_reference_mismatch(rec: dict) -> None:
    sequence = oncology.gene_and_entrez(rec["uniprot"])[2]
    n = len(sequence)
    chain = ChainResidues("A", sequence, (None,) * n, (None,) * n)
    placer = oncology.Placer(sequence, map_uniprot_positions(sequence, [chain]))
    assert placer.keys(12, "G") == ["A:12"]
    assert placer.keys(12, "Q") == []
    assert "Q12" in placer.mismatches


def test_bad_gene_symbol_is_rejected_before_any_request() -> None:
    with pytest.raises(oncology_sources.SourceNotFoundError):
        oncology_sources.check_gene("KRAS/../x")


def test_evidence_positions_come_from_the_profile_name(rec: dict) -> None:
    nodes = [n for p in rec["civic_pages"] for n in p["data"]["evidenceItems"]["nodes"]]
    placer = oncology.Placer(oncology.gene_and_entrez(rec["uniprot"])[2], None)
    items = oncology._evidence(nodes, "KRAS", placer)
    g12c = next(e for e in items if e.profile == "KRAS G12C")
    assert g12c.positions == [12]
    both = next(e for e in items if e.profile == "KRAS G12/G13")
    assert both.positions == [12, 13]
    levels = [e.level for e in items]
    assert levels == sorted(levels, key=lambda lv: "ABCDE".index(lv))


# -------------------------------------------------------------------- the route


@respx.mock
def test_kras_context_end_to_end(rec: dict) -> None:
    uid = register_6oim()
    mock_all(rec)

    body = client.get(ROUTE.format(uid=uid)).json()

    assert body["gene"] == "KRAS"
    assert body["sequence_length"] == 189
    assert all(s["state"] == "ok" for s in body["sources"])

    g12 = next(h for h in body["hotspots"] if h["residue"] == "G12")
    assert body["hotspots"][0]["residue"] == "G12", "G12 is KRAS's most recurrent hotspot"
    # 6OIM numbers from Gly0 (an expression-tag residue), so UniProt 12 is the
    # file's 13th residue: ordinal 13, auth 12. A naive number match would be off by one.
    assert g12["keys"] == ["A:13"]
    assert g12["alternates"][0]["label"] in {"D", "V"}

    tcga = body["tcga"]
    assert tcga["studies"] == 32
    assert tcga["by_cancer_type"][0]["cancer_type"].startswith("Pancreatic")
    p12 = next(p for p in tcga["positions"] if p["position"] == 12)
    assert p12["count"] == max(p["count"] for p in tcga["positions"])

    sotorasib = next(d for d in body["drugs"] if d["name"] == "Sotorasib")
    assert sotorasib["max_phase"] == 4.0
    assert sotorasib["variant"] == "G12C"

    assert body["evidence_total"] == 200
    assert body["evidence"][0]["level"] == "A"
    assert body["pathways_total"] == 71
    assert len(body["pathways"]) == oncology.MAX_PATHWAYS
    assert body["interactors"][0]["score"] >= body["interactors"][-1]["score"]


@respx.mock
def test_one_source_down_leaves_the_rest(rec: dict) -> None:
    uid = register_6oim()
    mock_all(rec, down={"civic", "tcga"})

    body = client.get(ROUTE.format(uid=uid)).json()

    states = {s["name"]: s["state"] for s in body["sources"]}
    assert states["CIViC"] == "unavailable"
    assert states["cBioPortal TCGA PanCancer"] == "unavailable"
    assert states["ChEMBL"] == "ok"
    assert body["tcga"] is None and body["evidence"] == []
    assert body["hotspots"] and body["drugs"]
    assert any("CIViC could not be reached" in n for n in body["notes"])


@respx.mock
def test_uniprot_down_is_a_502(rec: dict) -> None:
    uid = register_6oim()
    mock_all(rec, down={"uniprot"})
    assert client.get(ROUTE.format(uid=uid)).status_code == 502


def test_upload_without_accession_is_explained() -> None:
    uid, path = storage.store_upload((FIXTURES / "6OIM.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="uploaded"))
    body = client.get(ROUTE.format(uid=uid)).json()
    assert body["accession_resolved"] is False
    assert body["hotspots"] == []


def test_fixture_is_a_recording_not_a_hand_edit(rec: dict) -> None:
    # Cheap provenance guard: the recorder writes compact JSON with these keys.
    raw = (FIXTURES / "oncology_P01116.json").read_text()
    assert "\n" not in raw
    assert set(json.loads(raw)) == {
        "uniprot", "hotspots", "cbio_studies", "cbio_mutations", "chembl_targets",
        "chembl_mechanisms", "chembl_molecules", "civic_pages", "reactome", "string",
    }  # fmt: skip
