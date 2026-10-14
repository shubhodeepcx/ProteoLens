"""Pydantic models for P16, the "Explain this structure" assistant."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Level = Literal["school", "undergraduate", "expert"]


class ExplainRequest(BaseModel):
    question: str | None = Field(
        None,
        max_length=1000,
        description="Optional question. Without one, the assistant gives an overview.",
    )
    selection: list[str] = Field(
        default_factory=list,
        max_length=50,
        description="Selected residue keys, '<chain>:<ordinal>', to focus the answer on.",
    )
    level: Level = "undergraduate"


class ExplainResponse(BaseModel):
    answer: str
    model: str
    facts: list[str] = Field(
        ..., description="The measured facts the answer was grounded in, as sent to the model."
    )
