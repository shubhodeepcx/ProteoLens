from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

from app.main import app
from app.services import registry
from tests.helpers import pdb_1crn_bytes


def _upload(client: TestClient) -> dict:
    response = client.post(
        "/api/proteins/upload",
        files={"file": ("1crn.pdb", pdb_1crn_bytes(), "chemical/x-pdb")},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_summary_is_written_to_disk():
    """A restart loses process memory; the summary must be in the database file."""
    client = TestClient(app)
    summary = _upload(client)

    with sqlite3.connect(registry.DB_PATH) as conn:
        (stored,) = conn.execute(
            "SELECT summary FROM proteins WHERE uid = ?", (summary["id"],)
        ).fetchone()
    assert '"residue_count":46' in stored
    assert registry.get(summary["id"]).residue_count == 46


def test_put_replaces_an_existing_row():
    client = TestClient(app)
    summary = _upload(client)
    restored = registry.get(summary["id"])
    registry.put(summary["id"], restored.model_copy(update={"name": "renamed"}))
    assert registry.size() == 1
    assert registry.get(summary["id"]).name == "renamed"


def test_recent_lists_newest_first():
    client = TestClient(app)
    first = _upload(client)
    second = _upload(client)

    response = client.get("/api/proteins")
    assert response.status_code == 200
    ids = [p["id"] for p in response.json()]
    assert ids[:2] == [second["id"], first["id"]]


def test_recent_limit_is_clamped():
    client = TestClient(app)
    _upload(client)
    assert client.get("/api/proteins?limit=0").status_code == 200
    assert len(client.get("/api/proteins?limit=1").json()) == 1
