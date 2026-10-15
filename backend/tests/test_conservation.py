"""Conservation — `services/conservation.py` and `GET /{uid}/conservation`.

The PDBe-KB profile is `fixtures/pdbe_conservation_P01116.json`, recorded live
on 2026-10-14 by `fixtures/record_conservation_fixtures.py`; the UniProt entry
is the one in `neoantigen_P01116_G12C.json`. The structure is 6OIM (KRAS,
numbered from Gly0, so UniProt 12 is ordinal 13). `@respx.mock` fails any
unmocked request.
"""

from __future__ import annotations

import math

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import conservation, oncology_sources, registry
from app.services.parser import parse
from app.storage import local as storage
from tests.helpers import FIXTURES, load_json

client = TestClient(app)
ROUTE = "/api/proteins/{uid}/conservation"
PDBE_URL = conservation.PDBE_CONSERVATION_URL.format(accession="P01116")


@pytest.fixture(autouse=True)
def fresh_clients(monkeypatch):
    monkeypatch.setattr(conservation, "_CLIENT", conservation.ConservationClient())
    monkeypatch.setattr(oncology_sources, "_CLIENT", oncology_sources.OncologyClient())


@pytest.fixture(scope="module")
def profile() -> dict:
    return load_json("pdbe_conservation_P01116.json")


@pytest.fixture(scope="module")
def sequence() -> str:
    return load_json("neoantigen_P01116_G12C.json")["uniprot"]["sequence"]["value"]


def register_6oim() -> str:
    uid, path = storage.store_upload((FIXTURES / "6OIM.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="uniprot", source_id="P01116"))
    return uid


def mock_all(pdbe: httpx.Response) -> respx.Route:
    entry = load_json("neoantigen_P01116_G12C.json")["uniprot"]
    respx.get(url__startswith="https://rest.uniprot.org/uniprotkb/P01116.json").mock(
        return_value=httpx.Response(200, json=entry)
    )
    return respx.get(PDBE_URL).mock(return_value=pdbe)


# ------------------------------------------------------------------ pure


def test_information_content_bounds():
    assert conservation.information_content([0.05] * 20) == pytest.approx(0.0, abs=1e-9)
    assert conservation.information_content([1.0] + [0.0] * 19) == pytest.approx(math.log2(20))
    # Renormalised: a profile that does not sum to 1 is read as proportions.
    assert conservation.information_content([2.0, 2.0] + [0.0] * 18) == pytest.approx(
        math.log2(20) - 1
    )
    assert conservation.information_content([0.0] * 20) == 0.0


def test_kras_gtpase_motifs_are_the_most_conserved(profile, sequence):
    p = conservation.build_profile(
        "x", accession="P01116", resolution_note="", body=profile, sequence=sequence, keys_for={}
    )
    assert p.sequence_length == 189 and len(p.residues) == 189
    by_pos = {r.position: r for r in p.residues}
    g10, k16 = by_pos[10], by_pos[16]
    assert (g10.residue, g10.dominant) == ("G", "G")
    assert (k16.residue, k16.dominant) == ("K", "K")
    # The P-loop glycines and lysine, the DxxG Asp and the NKxD Asp lead the ranking.
    assert {10, 15, 16, 57, 119} <= set(p.most_conserved[:10])
    # G12, the cancer hotspot, is not itself a conserved position across homologues.
    assert by_pos[12].information < 1.0
    assert 0 < p.mean_information < g10.information
    assert p.placed == 0


def test_a_profile_for_another_sequence_version_is_refused(profile, sequence):
    shifted = "M" + sequence  # an insertion moves every later position
    with pytest.raises(conservation.ConservationError, match="different sequence version"):
        conservation.build_profile(
            "x", accession="P01116", resolution_note="", body=profile, sequence=shifted, keys_for={}
        )


# ----------------------------------------------------------------- route


@respx.mock
def test_route_places_conservation_on_6oim(profile):
    mock_all(httpx.Response(200, json=profile))
    uid = register_6oim()
    r = client.get(ROUTE.format(uid=uid))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accession_resolved"] is True
    by_pos = {r["position"]: r for r in body["residues"]}
    assert by_pos[12]["keys"] == ["A:13"]
    assert by_pos[16]["keys"] == ["A:17"]
    assert body["placed"] > 160


@respx.mock
def test_route_caches_pdbe(profile):
    pdbe = mock_all(httpx.Response(200, json=profile))
    uid = register_6oim()
    for _ in range(2):
        assert client.get(ROUTE.format(uid=uid)).status_code == 200
    assert pdbe.call_count == 1


@respx.mock
def test_route_without_a_profile_is_an_empty_answer():
    mock_all(httpx.Response(404))
    uid = register_6oim()
    body = client.get(ROUTE.format(uid=uid)).json()
    assert body["accession"] == "P01116"
    assert body["residues"] == []
    assert "no conservation profile" in body["resolution_note"]


@respx.mock
def test_route_pdbe_down_is_502():
    mock_all(httpx.Response(500))
    uid = register_6oim()
    assert client.get(ROUTE.format(uid=uid)).status_code == 502


def test_route_unknown_protein_is_404():
    assert client.get(ROUTE.format(uid="0" * 32)).status_code == 404
