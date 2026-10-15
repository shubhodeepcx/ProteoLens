"""Ligand docking with AutoDock Vina 1.2.

The pipeline, all local:

1. **Receptor.** The protein residues of model 1 are written out as PDB and
   prepared with Meeko (residue templates add polar hydrogens and Gasteiger
   charges, and residues missing atoms are dropped and counted).
2. **Ligand.** The SMILES is parsed with RDKit, protonated as written,
   embedded (ETKDG, fixed seed) and minimised with MMFF, then prepared with
   Meeko (rotatable bonds, AutoDock atom types).
3. **Box.** Around a ligand already in the file, or around chosen residues,
   plus padding.
4. **Search.** The `vina` binary, with a fixed seed so a run is repeatable.
5. **Poses.** Back through Meeko to RDKit molecules with hydrogens; each pose's
   protein contacts within 4 Å, and when the box came from a crystal ligand of
   the same chemistry, its heavy-atom RMSD to that ligand (symmetry-aware, no
   superposition).

Vina is a binary, not a pip package: `pip install vina` needs Boost to build
and publishes no wheel for current Python. `scripts/install_vina.py` downloads
the official release for the platform into `backend/bin/`.
"""

from __future__ import annotations

import io
import os
import platform
import re
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING

import numpy as np

from app.models.docking import DockPose, DockRequest, DockResult
from app.services.compounds import _contacts, _heavy_atoms, _protein_index

if TYPE_CHECKING:
    from Bio.PDB.Atom import Atom
    from Bio.PDB.Model import Model
    from Bio.PDB.Residue import Residue
    from Bio.PDB.Structure import Structure
    from rdkit.Chem import Mol

    from app.services.functional import ChainResidues

VINA_ENV = "VINA_BINARY"
BIN_DIR = Path(__file__).resolve().parents[2] / "bin"
VINA_TIMEOUT_SECONDS = 900
CONTACT_CUTOFF = 4.0
MIN_BOX = 12.0
MAX_BOX = 40.0
MAX_HEAVY_ATOMS = 120
SEED = 1

_RESULT = re.compile(
    r"^REMARK VINA RESULT:\s+(-?\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)",
    re.MULTILINE,
)
_LOCK = threading.Lock()


class DockingError(ValueError):
    """The request cannot be docked as asked; the message says why."""


class VinaUnavailableError(RuntimeError):
    """No Vina binary was found or it could not run."""


# ------------------------------------------------------------------ binary


def find_vina() -> Path | None:
    """`$VINA_BINARY`, then `backend/bin/vina[.exe]`, then `vina` on PATH."""
    configured = os.environ.get(VINA_ENV)
    if configured:
        path = Path(configured)
        return path if path.is_file() else None
    local = BIN_DIR / ("vina.exe" if platform.system() == "Windows" else "vina")
    if local.is_file():
        return local
    found = shutil.which("vina")
    return Path(found) if found else None


def vina_version(binary: Path) -> str | None:
    try:
        out = subprocess.run(
            [str(binary), "--version"], capture_output=True, text=True, timeout=30, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r"v?(\d+\.\d+\.\d+)", out.stdout + out.stderr)
    return match.group(1) if match else None


def unavailable_note() -> str:
    return (
        "AutoDock Vina is not installed. Run `python scripts/install_vina.py` in `backend/`, "
        f"or set {VINA_ENV} to the path of a vina 1.2 binary."
    )


# ---------------------------------------------------------------- receptor


def receptor_pdb(structure: Structure) -> str:
    """Model 1's standard polymer residues as PDB text, first altloc only."""
    from Bio.PDB import PDBIO, Select

    class Protein(Select):
        def accept_model(self, model: Model) -> bool:
            return model.serial_num == next(structure.get_models()).serial_num

        def accept_residue(self, residue: Residue) -> bool:
            return residue.id[0] == " "

        def accept_atom(self, atom: Atom) -> bool:
            return not atom.is_disordered() or atom.get_altloc() in ("A", " ")

    io_ = PDBIO()
    io_.set_structure(structure)
    buffer = io.StringIO()
    io_.save(buffer, Protein())
    return buffer.getvalue()


def prepare_receptor(pdb_text: str) -> tuple[str, int]:
    """(rigid receptor PDBQT, residues Meeko could not template and dropped)."""
    from meeko import MoleculePreparation, PDBQTWriterLegacy, Polymer, ResidueChemTemplates

    templates = ResidueChemTemplates.create_from_defaults()
    polymer = Polymer.from_pdb_string(
        pdb_text, templates, MoleculePreparation(), allow_bad_res=True, default_altloc="A"
    )
    rigid, _ = PDBQTWriterLegacy.write_from_polymer(polymer)
    return rigid, len(polymer.get_ignored_monomers())


# ------------------------------------------------------------------ ligand


def ligand_from_smiles(smiles: str) -> Mol:
    """An embedded, minimised RDKit molecule with hydrogens, or a DockingError."""
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.MolFromSmiles(smiles.strip())
    if mol is None:
        raise DockingError("RDKit could not read that SMILES.")
    if len(Chem.GetMolFrags(mol)) > 1:
        raise DockingError("The SMILES holds more than one molecule; dock one at a time.")
    if mol.GetNumHeavyAtoms() > MAX_HEAVY_ATOMS:
        raise DockingError(f"Ligands above {MAX_HEAVY_ATOMS} heavy atoms are out of Vina's range.")
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    if AllChem.EmbedMolecule(mol, params) != 0:
        raise DockingError("RDKit could not build 3D coordinates for this molecule.")
    if AllChem.MMFFHasAllMoleculeParams(mol):
        AllChem.MMFFOptimizeMolecule(mol, maxIters=2000)
    return mol


def prepare_ligand(mol: Mol) -> str:
    from meeko import MoleculePreparation, PDBQTWriterLegacy

    setups = MoleculePreparation().prepare(mol)
    pdbqt, ok, error = PDBQTWriterLegacy.write_string(setups[0])
    if not ok:
        raise DockingError(f"Meeko could not prepare the ligand: {error}")
    return pdbqt


# --------------------------------------------------------------------- box


def box_around(coords: np.ndarray, padding: float) -> tuple[list[float], list[float]]:
    center = (coords.max(0) + coords.min(0)) / 2
    size = np.clip(coords.max(0) - coords.min(0) + padding, MIN_BOX, MAX_BOX)
    return [round(float(v), 3) for v in center], [round(float(v), 2) for v in size]


@dataclass
class Site:
    id: str
    code: str
    chain: str
    auth_seq_id: int | None
    coords: np.ndarray
    pdb_block: str


def ligand_sites(structure: Structure, codes: set[str]) -> list[Site]:
    """Hetero residues of model 1 whose component code is in `codes`."""
    model = next(structure.get_models())
    out: list[Site] = []
    for chain in model.get_chains():
        for residue in chain.get_residues():
            code = residue.get_resname().strip().upper()
            if residue.id[0] == " " or code not in codes:
                continue
            atoms = _heavy_atoms(residue)
            if not atoms:
                continue
            number = residue.id[1]
            lines = [
                "HETATM{:5d} {:<4s} {:>3s} {:1s}{:4d}    {:8.3f}{:8.3f}{:8.3f}  1.00  0.00          {:>2s}".format(
                    i + 1,
                    a.get_name() if len(a.get_name()) == 4 else f" {a.get_name()}",
                    code,
                    chain.id[:1],
                    int(number) % 10000,
                    *a.coord,
                    (a.element or "").strip().upper(),
                )
                for i, a in enumerate(atoms)
            ]
            out.append(
                Site(
                    id=f"{code}:{chain.id}:{number}",
                    code=code,
                    chain=chain.id,
                    auth_seq_id=int(number) if isinstance(number, int) else None,
                    coords=np.array([a.coord for a in atoms], dtype=float),
                    pdb_block="\n".join(lines) + "\nEND\n",
                )
            )
    return out


def residue_coords(
    structure: Structure, keys: list[str], chains: list[ChainResidues]
) -> np.ndarray:
    """Heavy-atom coordinates of residues named by selection keys ('A:12' = 12th residue)."""
    model = next(structure.get_models())
    wanted: dict[str, set[int]] = {}
    for key in keys:
        label, _, ordinal = key.partition(":")
        if ordinal.isdigit():
            wanted.setdefault(label, set()).add(int(ordinal))
    labels = {c.label for c in chains}
    coords: list[np.ndarray] = []
    for chain in model.get_chains():
        if chain.id not in wanted or chain.id not in labels:
            continue
        ordinal = 0
        for residue in chain.get_residues():
            if residue.id[0] != " ":
                continue
            ordinal += 1
            if ordinal in wanted[chain.id]:
                coords.extend(a.coord for a in _heavy_atoms(residue))
    if not coords:
        raise DockingError("None of the selected residues are in this structure.")
    return np.array(coords, dtype=float)


# ------------------------------------------------------------------- poses


@dataclass
class RawPose:
    affinity: float
    rmsd_lb: float
    rmsd_ub: float
    mol: object  # RDKit Mol with one conformer


def parse_poses(out_pdbqt: str) -> list[RawPose]:
    """Vina's output PDBQT -> scored poses as RDKit molecules with hydrogens."""
    from meeko import PDBQTMolecule, RDKitMolCreate
    from rdkit import Chem

    scores = [(float(a), float(b), float(c)) for a, b, c in _RESULT.findall(out_pdbqt)]
    pdbqt_mol = PDBQTMolecule(out_pdbqt, is_dlg=False, skip_typing=True)
    mols = RDKitMolCreate.from_pdbqt_mol(pdbqt_mol)
    if not mols or mols[0] is None:
        raise DockingError("Vina's poses could not be read back.")
    combined = mols[0]
    poses: list[RawPose] = []
    for (affinity, lb, ub), conformer in zip(scores, combined.GetConformers(), strict=False):
        single = Chem.Mol(combined)
        single.RemoveAllConformers()
        single.AddConformer(Chem.Conformer(conformer), assignId=True)
        poses.append(RawPose(affinity, lb, ub, single))
    return poses


def pose_contacts(mol: Mol, structure: Structure, chains: list[ChainResidues]) -> list[str]:
    model = next(structure.get_models())
    index = _protein_index(model, chains)
    heavy = [
        SimpleNamespace(coord=np.array(mol.GetConformer().GetAtomPosition(a.GetIdx())))
        for a in mol.GetAtoms()
        if a.GetAtomicNum() > 1
    ]
    return [c.key for c in _contacts(heavy, index, CONTACT_CUTOFF)]


def crystal_rmsd(pose: Mol, smiles: str, pdb_block: str) -> float | None:
    """Symmetry-aware heavy-atom RMSD in place, or None if the chemistry differs."""
    from rdkit import Chem
    from rdkit.Chem import AllChem, rdMolAlign

    try:
        crystal = Chem.MolFromPDBBlock(pdb_block, removeHs=True, sanitize=False)
        template = Chem.MolFromSmiles(smiles)
        if crystal is None or template is None:
            return None
        crystal = AllChem.AssignBondOrdersFromTemplate(template, crystal)
        return round(float(rdMolAlign.CalcRMS(Chem.RemoveHs(pose), crystal)), 2)
    except (ValueError, RuntimeError):
        return None


def molblock(mol: Mol) -> str:
    from rdkit import Chem

    return Chem.MolToMolBlock(mol)


# ------------------------------------------------------------------- vina


def run_vina(
    binary: Path,
    receptor_pdbqt: str,
    ligand_pdbqt: str,
    center: list[float],
    size: list[float],
    *,
    exhaustiveness: int,
    num_modes: int,
) -> tuple[str, float]:
    """(output PDBQT, seconds). One run at a time: Vina already uses every core."""
    with _LOCK, tempfile.TemporaryDirectory(prefix="proteolens-vina-") as tmp:
        work = Path(tmp)
        (work / "receptor.pdbqt").write_text(receptor_pdbqt)
        (work / "ligand.pdbqt").write_text(ligand_pdbqt)
        args = [
            str(binary),
            "--receptor", "receptor.pdbqt",
            "--ligand", "ligand.pdbqt",
            "--center_x", str(center[0]), "--center_y", str(center[1]), "--center_z", str(center[2]),
            "--size_x", str(size[0]), "--size_y", str(size[1]), "--size_z", str(size[2]),
            "--exhaustiveness", str(exhaustiveness),
            "--num_modes", str(num_modes),
            "--seed", str(SEED),
            "--out", "out.pdbqt",
        ]  # fmt: skip
        started = time.monotonic()
        try:
            done = subprocess.run(
                args,
                cwd=work,
                capture_output=True,
                text=True,
                timeout=VINA_TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise DockingError(
                f"Vina did not finish within {VINA_TIMEOUT_SECONDS // 60} minutes; "
                "try a smaller box or a lower exhaustiveness."
            ) from exc
        except OSError as exc:
            raise VinaUnavailableError(f"Vina could not be started: {exc}") from exc
        elapsed = time.monotonic() - started
        out = work / "out.pdbqt"
        if done.returncode != 0 or not out.is_file():
            detail = (done.stderr or done.stdout).strip().splitlines()[-1:] or ["no output"]
            raise DockingError(f"Vina failed: {detail[0][:300]}")
        return out.read_text(), elapsed


# ---------------------------------------------------------------- pipeline


def site_extent(site: Site) -> tuple[list[float], list[float]]:
    """Centre and raw extent of a crystal ligand's heavy atoms (no padding, no clipping)."""
    lo, hi = site.coords.min(0), site.coords.max(0)
    return [round(float(v), 3) for v in (lo + hi) / 2], [round(float(v), 2) for v in hi - lo]


def dock(
    uid: str,
    structure: Structure,
    chains: list[ChainResidues],
    request: DockRequest,
    sites: list[Site],
    binary: Path,
) -> DockResult:
    """Prepare, search and score one ligand against model 1 of `structure`."""
    notes: list[str] = []
    crystal: Site | None = None
    if request.site:
        crystal = next((s for s in sites if s.id == request.site), None)
        if crystal is None:
            raise DockingError(f"There is no ligand {request.site} in this structure.")
        center, size = box_around(crystal.coords, request.padding)
        label = f"{crystal.code} site, chain {crystal.chain}"
    else:
        center, size = box_around(
            residue_coords(structure, request.residues, chains), request.padding
        )
        label = f"{len(request.residues)} selected residue{'s' if len(request.residues) != 1 else ''}"

    receptor, skipped = prepare_receptor(receptor_pdb(structure))
    if skipped:
        notes.append(
            f"{skipped} residue{'s' if skipped != 1 else ''} with missing or unusual atoms "
            "could not be typed and were left out of the receptor."
        )
    ligand = prepare_ligand(ligand_from_smiles(request.smiles))
    out, elapsed = run_vina(
        binary,
        receptor,
        ligand,
        center,
        size,
        exhaustiveness=request.exhaustiveness,
        num_modes=request.num_modes,
    )
    poses = [
        DockPose(
            rank=i + 1,
            affinity=raw.affinity,
            rmsd_lb=raw.rmsd_lb,
            rmsd_ub=raw.rmsd_ub,
            rmsd_to_crystal=crystal_rmsd(raw.mol, request.smiles, crystal.pdb_block)
            if crystal
            else None,
            sdf=molblock(raw.mol),
            contacts=pose_contacts(raw.mol, structure, chains),
        )
        for i, raw in enumerate(parse_poses(out))
    ]
    if crystal and poses and poses[0].rmsd_to_crystal is None:
        notes.append(
            f"The SMILES is not {crystal.code}, so poses are not compared with the crystal ligand."
        )
    return DockResult(
        protein_id=uid,
        smiles=request.smiles,
        site_label=label,
        center=center,
        size=size,
        exhaustiveness=request.exhaustiveness,
        poses=poses,
        vina_version=vina_version(binary),
        elapsed_seconds=round(elapsed, 1),
        receptor_residues_skipped=skipped,
        notes=notes,
    )
