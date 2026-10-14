from __future__ import annotations

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import explain as ex
from tests.test_functional_api import register_lysozyme

client = TestClient(app)


def _reply(text: str = "Lysozyme is a small enzyme.", model: str = "test-model") -> httpx.Response:
    return httpx.Response(
        200, json={"model": model, "content": [{"type": "text", "text": text}], "role": "assistant"}
    )


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("EXPLAIN_API_KEY", "sk-test")
    monkeypatch.setenv("EXPLAIN_MODEL", "test-model")


def test_without_settings_the_endpoint_says_which_variables_to_set(monkeypatch):
    monkeypatch.delenv("EXPLAIN_API_KEY", raising=False)
    monkeypatch.delenv("EXPLAIN_MODEL", raising=False)
    uid = register_lysozyme()
    res = client.post(f"/api/proteins/{uid}/explain", json={})
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert "EXPLAIN_API_KEY" in detail and "EXPLAIN_MODEL" in detail


def test_a_key_without_a_model_is_still_unavailable(with_key, monkeypatch):
    monkeypatch.delenv("EXPLAIN_MODEL")
    uid = register_lysozyme()
    res = client.post(f"/api/proteins/{uid}/explain", json={})
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert "EXPLAIN_MODEL" in detail and "EXPLAIN_API_KEY" not in detail


@respx.mock
def test_explains_with_measured_facts_and_selected_residues(with_key):
    route = respx.post(ex.API_URL).mock(return_value=_reply())
    uid = register_lysozyme()
    res = client.post(
        f"/api/proteins/{uid}/explain",
        json={
            "question": "Why is E35 important?",
            "selection": ["A:35", "A:999", "Z:1"],
            "level": "school",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "Lysozyme is a small enzyme."
    assert body["model"] == "test-model"
    assert any("129 residues" in f for f in body["facts"])
    # Ordinal 35 of 1HEW chain A is Glu35; out-of-range and unknown chains are dropped.
    selected = next(f for f in body["facts"] if f.startswith("The user has selected"))
    assert "E35 (chain A)" in selected and "1 residue(s)" in selected

    request = route.calls.last.request
    assert request.headers["x-api-key"] == "sk-test"
    assert request.headers["api-version"] == ex.API_VERSION
    sent = json.loads(request.content)
    assert sent["model"] == "test-model"
    assert "secondary-school" in sent["system"]
    assert "Why is E35 important?" in sent["messages"][0]["content"]
    assert "E35 (chain A)" in sent["messages"][0]["content"]


@respx.mock
def test_configured_model_and_default_overview_question(with_key, monkeypatch):
    monkeypatch.setenv("EXPLAIN_MODEL", "other-model")
    route = respx.post(ex.API_URL).mock(return_value=_reply(model="other-model"))
    uid = register_lysozyme()
    assert client.post(f"/api/proteins/{uid}/explain", json={}).status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["model"] == "other-model"
    assert "overview" in sent["messages"][0]["content"]


@respx.mock
def test_upstream_error_is_a_502_with_the_reason(with_key):
    respx.post(ex.API_URL).mock(
        return_value=httpx.Response(
            401, json={"error": {"type": "authentication_error", "message": "invalid x-api-key"}}
        )
    )
    uid = register_lysozyme()
    res = client.post(f"/api/proteins/{uid}/explain", json={})
    assert res.status_code == 502
    assert "invalid x-api-key" in res.json()["detail"]


@respx.mock
def test_network_failure_and_empty_answer_are_502(with_key):
    uid = register_lysozyme()
    respx.post(ex.API_URL).mock(side_effect=httpx.ConnectError("down"))
    assert client.post(f"/api/proteins/{uid}/explain", json={}).status_code == 502
    respx.post(ex.API_URL).mock(return_value=_reply(text="  "))
    res = client.post(f"/api/proteins/{uid}/explain", json={})
    assert res.status_code == 502 and "empty" in res.json()["detail"]


def test_request_validation(with_key):
    uid = register_lysozyme()
    assert client.post(f"/api/proteins/{uid}/explain", json={"level": "phd"}).status_code == 422
    assert client.post("/api/proteins/nope/explain", json={}).status_code == 404
