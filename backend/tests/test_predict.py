from __future__ import annotations

from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import esmfold

client = TestClient(app)

FIXTURE = Path(__file__).parent / "fixtures" / "esmfold_crambin.pdb"
CRAMBIN = "TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN"


def _model() -> str:
    return FIXTURE.read_text()


# ------------------------------------------------------------ clean_sequence


def test_clean_sequence_accepts_fasta_whitespace_and_a_stop():
    raw = f">sp|P01542|CRAM_CRAAB Crambin\n{CRAMBIN[:20]}\n  {CRAMBIN[20:].lower()} *\n"
    assert esmfold.clean_sequence(raw) == CRAMBIN


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ("", "Paste a protein sequence"),
        (">only a header\n", "Paste a protein sequence"),
        ("ATGGCCATTGTAATGGGCCGC", "looks like DNA"),
        ("MKT1AYIAKQRQ", "'1'"),
        ("MKTAYIAKQ", "at least 10"),
        ("M" * 401, "at most 400"),
    ],
)
def test_clean_sequence_says_why_it_refuses(raw, message):
    with pytest.raises(esmfold.InvalidSequenceError, match=message):
        esmfold.clean_sequence(raw)


# ------------------------------------------------------------- normalise_pdb


def test_normalise_rescales_fractional_plddt_and_adds_a_title():
    out = esmfold.normalise_pdb(_model(), name="My crambin")
    lines = out.splitlines()
    assert lines[0].startswith("HEADER    PREDICTED STRUCTURE (ESMFOLD)")
    assert lines[1] == "TITLE     MY CRAMBIN"
    atoms = [ln for ln in lines if ln.startswith("ATOM")]
    values = [float(ln[60:66]) for ln in atoms]
    assert min(values) >= 50 and max(values) <= 100
    # Coordinates are untouched, column for column.
    original = [ln for ln in _model().splitlines() if ln.startswith("ATOM")]
    assert [ln[:60] for ln in atoms] == [ln[:60] for ln in original]


def test_normalise_leaves_a_0_to_100_column_alone():
    already = esmfold.normalise_pdb(_model(), name="x")
    again = esmfold.normalise_pdb(already, name="x")
    atoms = lambda t: [ln for ln in t.splitlines() if ln.startswith("ATOM")]
    assert atoms(again) == atoms(already)
    assert sum(ln.startswith("HEADER") for ln in again.splitlines()) == 1


# ------------------------------------------------------------------ endpoint


@respx.mock
def test_predict_folds_stores_and_registers_a_plddt_model():
    route = respx.post(esmfold.API_URL).mock(return_value=httpx.Response(200, text=_model()))
    res = client.post("/api/proteins/predict", json={"sequence": f">crambin\n{CRAMBIN}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["source"] == "predicted"
    assert body["has_plddt"] is True
    assert body["chains"][0]["sequence"] == CRAMBIN
    assert body["name"] == "ESMFold model, 46 residues"
    # The bare sequence is what ESM Atlas expects as the body.
    assert route.calls.last.request.content == CRAMBIN.encode()

    stored = client.get(f"/api/proteins/{body['id']}/file").text
    assert "PREDICTED STRUCTURE (ESMFOLD)" in stored
    confidence = client.get(f"/api/proteins/{body['id']}/confidence").json()
    assert confidence["has_plddt"] is True
    assert 50 <= confidence["mean_plddt"] <= 100
    assert confidence["residue_count"] == 46


@respx.mock
def test_predict_uses_the_given_name():
    respx.post(esmfold.API_URL).mock(return_value=httpx.Response(200, text=_model()))
    res = client.post("/api/proteins/predict", json={"sequence": CRAMBIN, "name": "Crambin fold"})
    # Exactly as typed: BioPython lower-cases the TITLE record it is also written to.
    assert res.json()["name"] == "Crambin fold"
    assert client.get(f"/api/proteins/{res.json()['id']}").json()["name"] == "Crambin fold"


def test_predict_rejects_a_bad_sequence_without_calling_out():
    res = client.post("/api/proteins/predict", json={"sequence": "ATGCATGCATGCATGC"})
    assert res.status_code == 422
    assert "DNA" in res.json()["detail"]


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500, text="Internal Server Error"),
        httpx.Response(200, text="<html>maintenance</html>"),
    ],
)
def test_predict_upstream_failures_are_502(response):
    respx.post(esmfold.API_URL).mock(return_value=response)
    res = client.post("/api/proteins/predict", json={"sequence": CRAMBIN})
    assert res.status_code == 502
    assert "ESMFold" in res.json()["detail"]


@respx.mock
def test_predict_network_error_is_502():
    respx.post(esmfold.API_URL).mock(side_effect=httpx.ConnectError("down"))
    res = client.post("/api/proteins/predict", json={"sequence": CRAMBIN})
    assert res.status_code == 502
