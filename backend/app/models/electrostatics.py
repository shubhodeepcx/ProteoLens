"""Pydantic models for P15 surface electrostatics.

The potential is a Coulombic estimate with a distance-dependent dielectric, the
same model ChimeraX's "Coulombic surface coloring" uses, in kcal/(mol·e). It is
a fast qualitative map of where a surface is basic or acidic, not a
Poisson-Boltzmann solution, and the response says so in `notes`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.functional import ResidueRef


class ChainPotential(BaseModel):
    chain: str
    sequence: str
    potential: list[float] = Field(
        ..., description="Per residue, index i is ordinal i + 1, kcal/(mol·e)."
    )
    exposed: list[bool] | None = Field(
        None, description="Surface-exposed per residue; None when accessibility was not computed."
    )
    net_charge: float = Field(
        ..., description="Sum of the partial charges assigned to the chain, e."
    )
    isoelectric_point: float | None = Field(None, description="Sequence-based pI (Bjellqvist).")


class ChargedPatch(BaseModel):
    sign: Literal["positive", "negative"]
    residues: list[ResidueRef]
    mean_potential: float
    label: str


class ElectrostaticsResponse(BaseModel):
    protein_id: str
    units: str = "kcal/(mol·e)"
    color_range: float = Field(
        ..., description="Symmetric range for colouring: -range is red, +range is blue."
    )
    chains: list[ChainPotential]
    patches: list[ChargedPatch] = Field(..., description="Largest, strongest first.")
    net_charge: float
    dipole_debye: float | None = Field(
        None, description="Dipole about the centre of geometry, Debye."
    )
    charged_atoms: int
    notes: list[str]
