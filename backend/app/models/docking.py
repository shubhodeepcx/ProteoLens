"""Ligand docking with AutoDock Vina: binding sites, the request, and the poses."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class DockingSite(BaseModel):
    """A ligand or cofactor bound in the file: a ready-made box to dock into."""

    id: str = Field(..., description="'<code>:<chain>:<number>', e.g. 'MK1:A:902'.")
    code: str
    name: str | None = None
    chain: str
    auth_seq_id: int | None = None
    atom_count: int
    center: list[float] = Field(..., description="Centre of the ligand's heavy atoms, in Å.")
    size: list[float] = Field(..., description="Extent of the ligand's heavy atoms, in Å.")
    smiles: str | None = Field(None, description="The component's SMILES from the RCSB, if known.")


class DockingSites(BaseModel):
    protein_id: str
    sites: list[DockingSite] = Field(default_factory=list)
    vina_available: bool = False
    vina_note: str | None = None


class DockRequest(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=500)
    site: str | None = Field(None, max_length=40, description="A DockingSite id.")
    residues: list[str] = Field(
        default_factory=list, max_length=200, description="Residue keys to box around."
    )
    exhaustiveness: int = Field(8, ge=1, le=32)
    num_modes: int = Field(9, ge=1, le=20)
    padding: float = Field(8.0, ge=4.0, le=15.0, description="Å added around the site.")

    @model_validator(mode="after")
    def _one_site(self) -> DockRequest:
        if bool(self.site) == bool(self.residues):
            raise ValueError("Give either a site or residues to dock into, not both.")
        return self


class DockPose(BaseModel):
    rank: int
    affinity: float = Field(..., description="Vina score, kcal/mol (more negative binds better).")
    rmsd_lb: float
    rmsd_ub: float
    rmsd_to_crystal: float | None = Field(
        None, description="Heavy-atom RMSD to the crystal ligand, when redocking it."
    )
    sdf: str = Field(..., description="The pose, with hydrogens, as an MDL molfile.")
    contacts: list[str] = Field(
        default_factory=list, description="Residue keys within 4 Å of the pose."
    )


class DockResult(BaseModel):
    protein_id: str
    smiles: str
    site_label: str
    center: list[float]
    size: list[float]
    exhaustiveness: int
    poses: list[DockPose] = Field(default_factory=list)
    vina_version: str | None = None
    elapsed_seconds: float
    receptor_residues_skipped: int = 0
    notes: list[str] = Field(default_factory=list)
