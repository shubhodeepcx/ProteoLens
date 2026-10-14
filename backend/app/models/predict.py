from __future__ import annotations

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    """Body for POST /api/proteins/predict."""

    sequence: str = Field(
        ...,
        min_length=1,
        max_length=20_000,
        description="Protein sequence, plain one-letter codes or FASTA.",
    )
    name: str | None = Field(
        None, max_length=80, description="Optional label for the predicted model."
    )
