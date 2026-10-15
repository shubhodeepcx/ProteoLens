"""A2 clinical half — `services/clinical.py` and `GET /{uid}/clinical-evidence`.

Fixtures were recorded live on 2026-10-14 by `fixtures/record_clinical_fixtures.py`
(human haemoglobin beta, P68871). `@respx.mock` fails any test that reaches
the network.
"""

from __future__ import annotations

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import clinical, registry
from app.services.parser import parse
from app.storage import local as storage
from tests.helpers import FIXTURES, load_json

client = TestClient(app)

ROUTE = "/api/proteins/{uid}/clinical-evidence"
VARIATION = "https://www.ebi.ac.uk/proteins/api/variation/P68871"
AM = "https://alphafold.ebi.ac.uk/api/annotations/P68871.json"


@pytest.fixture(autouse=True)
def fresh_clinical_client(monkeypatch):
    monkeypatch.setattr(clinical, "_CLIENT", clinical.ClinicalClient())


def register_hbb() -> str:
    uid, path = storage.store_upload((FIXTURES / "AF-P68871-F1.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="alphafold", source_id="P68871"))
    return uid


def variation_ok() -> respx.Route:
    return respx.get(VARIATION).mock(
        return_value=httpx.Response(200, json=load_json("ebi_variation_P68871.json"))
    )


def am_ok() -> respx.Route:
    return respx.get(url__startswith=AM).mock(
        return_value=httpx.Response(200, json=load_json("alphafold_am_P68871.json"))
    )


# ------------------------------------------------------------------ pure parts


@pytest.mark.parametrize(
    ("labels", "expected"),
    [
        ([], None),
        (["Pathogenic"], "pathogenic"),
        (["Likely pathogenic", "Variant of uncertain significance"], "likely_pathogenic"),
        (["Pathogenic", "Benign"], "conflicting"),
        (["Conflicting interpretations of pathogenicity"], "conflicting"),
        (["Likely benign", "Benign"], "likely_benign"),
        (["Variant of uncertain significance"], "uncertain"),
        (["Drug response"], "other"),
    ],
)
def test_classify(labels: list[str], expected: str | None) -> None:
    assert clinical.classify(labels) == expected


def test_am_scores_reads_the_per_residue_regions() -> None:
    scores = clinical.am_scores(load_json("alphafold_am_P68871.json"))
    assert len(scores) == 147
    assert all(0.0 <= s <= 1.0 for s in scores.values())


def test_isoform_suffix_is_dropped() -> None:
    assert clinical.base_accession(" p04637-2 ") == "P04637"


def test_builder_without_alignment_still_rolls_up() -> None:
    body = clinical.build_clinical_evidence(
        "u",
        accession="P68871",
        resolution_note="",
        variation=load_json("ebi_variation_P68871.json"),
        alphamissense=None,
        positions=None,
    )
    assert body.gene == "HBB"
    assert body.mapped_positions == 0
    assert body.alphamissense_available is False
    assert sum(body.class_counts.values()) == len(body.variants) + body.variants_truncated


def test_mismatched_alphamissense_sequence_is_refused() -> None:
    am = load_json("alphafold_am_P68871.json")
    am["sequence"] = "M" + am["sequence"]
    body = clinical.build_clinical_evidence(
        "u",
        accession="P68871",
        resolution_note="",
        variation=load_json("ebi_variation_P68871.json"),
        alphamissense=am,
        positions=None,
    )
    assert body.alphamissense_available is False
    assert any("different sequence version" in n for n in body.notes)


# -------------------------------------------------------------------- the route


@respx.mock
def test_sickle_cell_variant_is_pathogenic_and_lands_on_glu7() -> None:
    uid = register_hbb()
    variation_ok()
    am_ok()

    body = client.get(ROUTE.format(uid=uid)).json()

    assert body["accession"] == "P68871"
    assert body["alphamissense_available"] is True
    sickle = next(v for v in body["variants"] if v["short"] == "E7V")
    assert sickle["hgvs"] == "p.Glu7Val"
    assert sickle["clinical_class"] in ("pathogenic", "conflicting")
    assert sickle["clinvar_ids"] and sickle["clinvar_ids"][0].startswith("RCV")
    assert [r["key"] for r in sickle["residues"]] == ["A:7"]
    assert sickle["residues"][0]["residue"] == "E"
    assert sickle["alphamissense"] is not None


@respx.mock
def test_variants_are_sorted_most_severe_first_and_rolled_up() -> None:
    uid = register_hbb()
    variation_ok()
    am_ok()

    body = client.get(ROUTE.format(uid=uid)).json()

    order = list(clinical.CLASS_ORDER)
    ranks = [order.index(v["clinical_class"]) for v in body["variants"]]
    assert ranks == sorted(ranks)
    assert body["mapped_positions"] > 100
    residue7 = next(r for r in body["residues"] if r["position"] == 7)
    assert residue7["pathogenic"] >= 1
    assert residue7["keys"] == ["A:7"]
    assert body["top_diseases"], "HBB's pathogenic variants name diseases"


@respx.mock
def test_alphamissense_outage_is_a_note_not_a_failure() -> None:
    uid = register_hbb()
    variation_ok()
    respx.get(url__startswith=AM).mock(return_value=httpx.Response(503))

    response = client.get(ROUTE.format(uid=uid))

    assert response.status_code == 200
    body = response.json()
    assert body["alphamissense_available"] is False
    assert body["variants"]
    assert any("AlphaMissense is missing" in n for n in body["notes"])


@respx.mock
def test_variation_outage_is_a_502() -> None:
    uid = register_hbb()
    respx.get(VARIATION).mock(return_value=httpx.Response(500))
    am_ok()

    assert client.get(ROUTE.format(uid=uid)).status_code == 502


@respx.mock
def test_no_variants_is_an_empty_200() -> None:
    uid = register_hbb()
    respx.get(VARIATION).mock(return_value=httpx.Response(404))
    respx.get(url__startswith=AM).mock(return_value=httpx.Response(404))

    body = client.get(ROUTE.format(uid=uid)).json()

    assert body["variants"] == []
    assert body["accession_resolved"] is True
    assert len(body["notes"]) == 2


def test_upload_without_accession_is_explained() -> None:
    uid, path = storage.store_upload((FIXTURES / "AF-P68871-F1.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source="uploaded"))

    body = client.get(ROUTE.format(uid=uid)).json()

    assert body["accession_resolved"] is False
    assert body["variants"] == []


def test_unknown_protein_is_404() -> None:
    assert client.get(ROUTE.format(uid="0" * 32)).status_code == 404
