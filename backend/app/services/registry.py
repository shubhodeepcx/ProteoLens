from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

from app.models.protein import ProteinSummary

# The single home for parsed protein summaries, shared by the upload path
# (`api/proteins.py`) and the import path (`api/import_.py`).
#
# Backed by SQLite so a backend restart keeps every loaded protein: the
# structure files already live on disk under `storage/proteins/`, and this
# table is what lets `/viewer/<uid>` find them again. Summaries are stored as
# the model's own JSON, so a new field on `ProteinSummary` needs no migration;
# a row written by an older model still validates because new fields default.
#
# It lives in `services/` rather than inside a router so neither router has to
# reach into the other's private module state.

DB_PATH = Path(
    os.getenv(
        "PROTEOLENS_DB",
        str(Path(__file__).resolve().parents[2] / "storage" / "proteolens.db"),
    )
)

# sqlite3 connections are cheap to open; one per call keeps this safe across
# FastAPI's threadpool without sharing a connection between threads. The lock
# serialises writers so two uploads never race on table creation.
_LOCK = threading.Lock()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS proteins (
    uid        TEXT PRIMARY KEY,
    summary    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(_SCHEMA)
    return conn


def put(uid: str, summary: ProteinSummary) -> None:
    """Register a parsed summary under its storage uid, replacing any earlier one."""
    with _LOCK, _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO proteins (uid, summary) VALUES (?, ?)",
            (uid, summary.model_dump_json()),
        )


def get(uid: str) -> ProteinSummary | None:
    """Return the summary for `uid`, or None when it is not registered."""
    with _connect() as conn:
        row = conn.execute("SELECT summary FROM proteins WHERE uid = ?", (uid,)).fetchone()
    if row is None:
        return None
    return ProteinSummary.model_validate_json(row[0])


def recent(limit: int = 20) -> list[tuple[str, ProteinSummary]]:
    """The most recently registered summaries, newest first."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT uid, summary FROM proteins ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [(uid, ProteinSummary.model_validate_json(s)) for uid, s in rows]


def clear() -> None:
    """Drop every registered summary. Used by tests."""
    with _LOCK, _connect() as conn:
        conn.execute("DELETE FROM proteins")


def size() -> int:
    """Number of currently registered summaries."""
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM proteins").fetchone()[0]
