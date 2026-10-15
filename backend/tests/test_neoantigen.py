"""Neoantigen candidates — `services/neoantigen.py` and `GET /{uid}/neoantigens`.

Upstream bodies come from `fixtures/neoantigen_P01116_G12C.json`, recorded live
on 2026-10-14 by `fixtures/record_neoantigen_fixtures.py`: KRAS G12C scored by
NetMHCpan 4.1 EL through IEDB. The structure is 6OIM (KRAS G12C numbered from
Gly0, so UniProt 12 is ordinal 13). `@respx.mock` fails any unmocked request.
"""

from __future__ import annotations

from urllib.parse import parse_qs

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import neoantigen, oncology_sources, registry
from app.services.parser import parse
from app.storage import local as storage
from tests.helpers import FIXTURES, load_json

client = TestClient(app)
ROUTE = "/api/proteins/{uid}/neoantigens"


@pytest.fixture(autouse=True)
def fresh_clients(monkeypatch):
    monkeypatch.setattr(neoantigen, "_CLIENT", neoantigen.IedbClient())
    monkeypatch.setattr(oncology_sources, "_CLIENT", oncology_sources.OncologyClient())


@pytest.fixture(scope="module")
def rec() -> dict:
    return load_json("neoantigen_P01116_G12C.json")


def register_6oim() -> str:
    uid, path = storage.store_upload((FIXTURES / "6OIM.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="uniprot", source_id="P01116"))
    return uid


def mock_all(rec: dict, *, iedb: httpx.Response | None = None) -> respx.Route:
    respx.get(url__startswith="https://rest.uniprot.org/uniprotkb/P01116.json").mock(
        return_value=httpx.Response(200, json=rec["uniprot"])
    )
    return respx.post(neoantigen.IEDB_MHCI_URL).mock(
        return_value=iedb or httpx.Response(200, text=rec["iedb"])
    )


# ------------------------------------------------------------------ pure


@pytest.mark.parametrize(
    ("text", "expected"),
    [("G12C", ("G", 12, "C")), ("p.Gly12Cys", ("G", 12, "C")), ("r175h", ("R", 175, "H"))],
)
def test_parse_missense(text, expected):
    assert neoantigen.parse_missense(text) == expected


@pytest.mark.parametrize("text", ["", "G12", "G12*", "G12G", "Xyz12Cys", "12C"])
def test_parse_missense_refuses(text):
    with pytest.raises(neoantigen.NeoantigenError):
        neoantigen.parse_missense(text)


def test_alleles_and_lengths_are_checked():
    assert neoantigen.check_alleles(["HLA-A*02:01", " HLA-A*02:01", "HLA-B*07:02"]) == [
        "HLA-A*02:01",
        "HLA-B*07:02",
    ]
    for bad in (
        [],
        ["A2"],
        ["HLA-DRB1*01:01"],
        ["HLA-A*02:01;rm"],
        [f"HLA-A*0{i}:01" for i in range(9)],
    ):
        with pytest.raises(neoantigen.NeoantigenError):
            neoantigen.check_alleles(bad)
    assert neoantigen.check_lengths([11, 9, 9]) == [9, 11]
    with pytest.raises(neoantigen.NeoantigenError):
        neoantigen.check_lengths([7, 9])


def test_windows_pair_mutant_and_wild_type(rec):
    seq = rec["uniprot"]["sequence"]["value"]
    mt, wt, first = neoantigen.windows(seq, 12, "G", "C", 11)
    assert first == 2
    assert wt == "TEYKLVVVGAGGVGKSALTIQ"
    assert mt == "TEYKLVVVGACGVGKSALTIQ"
    # Near the N terminus the window is clipped, not padded.
    mt1, wt1, first1 = neoantigen.windows(seq, 1, "M", "V", 9)
    assert (first1, wt1[0], mt1[0]) == (1, "M", "V")


def test_windows_refuse_a_wrong_reference(rec):
    seq = rec["uniprot"]["sequence"]["value"]
    with pytest.raises(neoantigen.NeoantigenError, match="Residue 12 is Gly in UniProt, not Ala"):
        neoantigen.windows(seq, 12, "A", "C", 11)
    with pytest.raises(neoantigen.NeoantigenError, match="no 900"):
        neoantigen.windows(seq, 900, "A", "C", 11)


def test_candidates_find_the_known_kras_g12c_epitope(rec):
    rows = neoantigen.parse_table(rec["iedb"])
    scored, found = neoantigen.candidates(rows, position=12, first=2, keys_for={})
    # 4 alleles x (8 + 9 + 10 + 11) peptides that contain residue 12.
    assert scored == 152
    best = found[0]
    assert (best.peptide, best.wild_type, best.allele) == ("VVGACGVGK", "VVGAGGVGK", "HLA-A*11:01")
    assert best.start == 8 and best.mutant_offset == 5 and best.anchor is False
    assert best.wild_type_rank is not None and best.fold_change is not None
    assert all(c.mutant_rank < neoantigen.WEAK_RANK for c in found)
    assert all(c.peptide[c.mutant_offset - 1] == "C" for c in found)
    assert [c.mutant_rank for c in found] == sorted(c.mutant_rank for c in found)


def test_candidates_skip_peptides_without_the_change():
    rows = [
        {"allele": "HLA-A*02:01", "seq_num": "1", "start": "1", "length": "9",
         "peptide": "AAAAAAAAA", "score": "0.9", "percentile_rank": "0.1"},
    ]  # fmt: skip
    scored, found = neoantigen.candidates(rows, position=20, first=5, keys_for={})
    assert (scored, found) == (0, [])


# ----------------------------------------------------------------- route


@respx.mock
def test_route_scores_and_places_on_6oim(rec):
    iedb = mock_all(rec)
    uid = register_6oim()
    r = client.get(ROUTE.format(uid=uid), params={"change": "G12C"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["gene"], body["change"], body["peptides_scored"]) == ("KRAS", "G12C", 152)
    assert body["variant_keys"] == ["A:13"]
    best = body["candidates"][0]
    assert best["peptide"] == "VVGACGVGK"
    # UniProt 8..16 is 6OIM ordinals 9..17.
    assert best["residue_keys"] == [f"A:{n}" for n in range(9, 18)]
    form = parse_qs(iedb.calls[0].request.content.decode())
    assert form["method"] == ["netmhcpan_el"]
    assert form["allele"][0].count(",") == 15


@respx.mock
def test_route_caches_iedb(rec):
    iedb = mock_all(rec)
    uid = register_6oim()
    for _ in range(2):
        assert client.get(ROUTE.format(uid=uid), params={"change": "G12C"}).status_code == 200
    assert iedb.call_count == 1


@respx.mock
def test_route_wrong_reference_is_400(rec):
    mock_all(rec)
    uid = register_6oim()
    r = client.get(ROUTE.format(uid=uid), params={"change": "A12C"})
    assert r.status_code == 400
    assert "Gly in UniProt" in r.json()["detail"]


def test_route_bad_input_is_400_before_any_request():
    uid = register_6oim()
    assert client.get(ROUTE.format(uid=uid), params={"change": "G12*"}).status_code == 400
    r = client.get(ROUTE.format(uid=uid), params={"change": "G12C", "alleles": "HLA-DRB1*01:01"})
    assert r.status_code == 400
    r = client.get(ROUTE.format(uid=uid), params={"change": "G12C", "lengths": "15"})
    assert r.status_code == 400


@respx.mock
def test_route_iedb_down_is_502(rec):
    mock_all(rec, iedb=httpx.Response(500))
    uid = register_6oim()
    assert client.get(ROUTE.format(uid=uid), params={"change": "G12C"}).status_code == 502


@respx.mock
def test_route_iedb_form_error_is_502(rec):
    mock_all(rec, iedb=httpx.Response(200, text="__all__: <ul class='errorlist'><li>bad</li></ul>"))
    uid = register_6oim()
    assert client.get(ROUTE.format(uid=uid), params={"change": "G12C"}).status_code == 502


def test_route_unknown_protein_is_404():
    assert client.get(ROUTE.format(uid="0" * 32), params={"change": "G12C"}).status_code == 404
