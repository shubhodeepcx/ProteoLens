"""P15 surface electrostatics: a Coulombic potential per residue and charged patches.

## Model

Partial charges at pH ~7 go on the usual atoms: Lys NZ +1, Arg NH1/NH2 +0.5
each, His ND1/NE2 +0.05 each (about one in ten protonated), Asp OD1/OD2 and Glu
OE1/OE2 -0.5 each, the first residue's N +1 and the last residue's O/OXT -1.
The potential at an atom is

    phi = 332 / 4 * sum(q_j / r_j**2)     kcal/(mol·e)

the Coulomb law with a distance-dependent dielectric eps = 4r (Mehler and
Solmajer 1991), as ChimeraX's ``coulombic`` command uses. Distances are floored
at `MIN_DISTANCE` so an atom's own charge reads as it would one probe radius
off the surface, rather than diverging. A residue's value is the mean over its
side-chain atoms (backbone for glycine).

This is deliberately the fast, explainable model. It has no ionic screening,
no desolvation and no pKa shifts, and the response's notes say so: it shows
*where* a surface is basic or acidic, which is the question a student asks of
a DNA-binding groove or an acidic active site, not a binding free energy.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

import numpy as np
from Bio.SeqUtils.ProtParam import ProteinAnalysis

from app.models.electrostatics import ChainPotential, ChargedPatch, ElectrostaticsResponse
from app.models.protein import ProteinSummary
from app.services import functional
from app.services.functional import ChainResidues

if TYPE_CHECKING:
    from Bio.PDB.Atom import Atom
    from Bio.PDB.Model import Model
    from Bio.PDB.Residue import Residue
    from Bio.PDB.Structure import Structure

COULOMB = 332.0  # kcal·Å/(mol·e²)
DIELECTRIC_SLOPE = 4.0  # eps(r) = 4r
MIN_DISTANCE = 3.0  # Å
COLOR_RANGE = 10.0  # kcal/(mol·e), ChimeraX's default -10..+10
PATCH_THRESHOLD = 4.0  # |phi| a residue needs to join a patch
PATCH_LINK = 7.5  # Å between side-chain centroids
PATCH_MIN_SIZE = 3
MAX_PATCHES_PER_SIGN = 5
MAX_ATOMS = 100_000
DEBYE_PER_E_ANGSTROM = 4.803

SIDE_CHAIN_CHARGES: dict[str, dict[str, float]] = {
    "LYS": {"NZ": 1.0},
    "ARG": {"NH1": 0.5, "NH2": 0.5},
    "HIS": {"ND1": 0.05, "NE2": 0.05},
    "ASP": {"OD1": -0.5, "OD2": -0.5},
    "GLU": {"OE1": -0.5, "OE2": -0.5},
}
BACKBONE = frozenset({"N", "CA", "C", "O", "OXT"})

MODEL_NOTE = (
    "Coulombic potential with a distance-dependent dielectric (4r), as in ChimeraX's "
    "Coulombic surface colouring: blue is basic, red is acidic. It has no ionic "
    "screening, desolvation or pKa shifts, so read it as a map of where the surface "
    "is charged, not as a Poisson-Boltzmann result (use APBS for that)."
)
PATCH_NOTE = (
    "Patches are groups of three or more surface residues within 7.5 Å of each other "
    f"whose potential is beyond ±{PATCH_THRESHOLD:g}. Their suggested roles are "
    "hypotheses to check against the literature, not predictions."
)
TERMINI_NOTE = (
    "Termini are charged at the first and last residue present in the file; a chain "
    "whose real termini are disordered and missing gets its charges at the wrong place."
)


def _polymer_residues(model: Model, chain_label: str) -> list[Residue]:
    chain = model[chain_label]
    return [r for r in chain.get_residues() if r.id[0] == " "]


def _charges(residues: list) -> list[tuple[np.ndarray, float]]:
    out: list[tuple[np.ndarray, float]] = []
    for residue in residues:
        table = SIDE_CHAIN_CHARGES.get(residue.get_resname().strip().upper(), {})
        for name, q in table.items():
            if name in residue:
                out.append((residue[name].coord, q))
    if residues:
        first, last = residues[0], residues[-1]
        if "N" in first:
            out.append((first["N"].coord, 1.0))
        c_term = [name for name in ("O", "OXT") if name in last]
        for name in c_term:
            out.append((last[name].coord, -1.0 / len(c_term)))
    return out


def potential_at(points: np.ndarray, coords: np.ndarray, charges: np.ndarray) -> np.ndarray:
    """phi at each point from every charge, kcal/(mol·e). Chunked to bound memory."""
    if not len(points) or not len(charges):
        return np.zeros(len(points))
    out = np.empty(len(points))
    scale = COULOMB / DIELECTRIC_SLOPE
    for start in range(0, len(points), 2048):
        block = points[start : start + 2048]
        d2 = ((block[:, None, :] - coords[None, :, :]) ** 2).sum(axis=2)
        d2 = np.maximum(d2, MIN_DISTANCE**2)
        out[start : start + len(block)] = scale * (charges[None, :] / d2).sum(axis=1)
    return out


def _probe_atoms(residue: Residue) -> list[Atom]:
    atoms = [a for a in residue.get_atoms() if a.element != "H"]
    side = [a for a in atoms if a.get_name().strip() not in BACKBONE]
    return side or atoms


def _isoelectric_point(sequence: str) -> float | None:
    clean = "".join(c for c in sequence if c in "ACDEFGHIKLMNPQRSTVWY")
    if not clean:
        return None
    return round(ProteinAnalysis(clean).isoelectric_point(), 2)


def _components(points: np.ndarray, link: float) -> list[list[int]]:
    """Connected components of points closer than `link` (single linkage)."""
    n = len(points)
    if not n:
        return []
    close = ((points[:, None, :] - points[None, :, :]) ** 2).sum(axis=2) <= link**2
    seen = [False] * n
    groups: list[list[int]] = []
    for i in range(n):
        if seen[i]:
            continue
        stack, group = [i], []
        seen[i] = True
        while stack:
            j = stack.pop()
            group.append(j)
            for k in np.nonzero(close[j])[0]:
                if not seen[k]:
                    seen[k] = True
                    stack.append(int(k))
        groups.append(sorted(group))
    return groups


def _patch_label(sign: str) -> str:
    if sign == "positive":
        return "Basic patch: a candidate surface for DNA/RNA, heparin or acidic partners."
    return "Acidic patch: a candidate site for metal ions, basic partners or substrates."


def build_electrostatics(
    uid: str, summary: ProteinSummary, structure: Structure
) -> ElectrostaticsResponse:
    chains: list[ChainResidues] = functional.read_chain_residues(structure, summary)
    functional.strip_non_polymer(structure)
    notes = [MODEL_NOTE, PATCH_NOTE, TERMINI_NOTE]

    try:
        model = next(structure.get_models())
    except StopIteration:
        model = None
    if model is None or not chains:
        return ElectrostaticsResponse(
            protein_id=uid,
            color_range=COLOR_RANGE,
            chains=[],
            patches=[],
            net_charge=0.0,
            charged_atoms=0,
            notes=["This file has no protein chain to compute a potential for."],
        )

    residues = {c.label: _polymer_residues(model, c.label) for c in chains}
    atom_count = sum(len(list(r.get_atoms())) for rs in residues.values() for r in rs)
    if atom_count > MAX_ATOMS:
        return ElectrostaticsResponse(
            protein_id=uid,
            color_range=COLOR_RANGE,
            chains=[],
            patches=[],
            net_charge=0.0,
            charged_atoms=0,
            notes=[
                (
                    f"Electrostatics was not computed: {atom_count:,} atoms is past the "
                    f"{MAX_ATOMS:,}-atom limit."
                )
            ],
        )

    charge_by_chain = {c.label: _charges(residues[c.label]) for c in chains}
    charge_sites = [site for c in chains for site in charge_by_chain[c.label]]
    coords = np.array([s[0] for s in charge_sites], dtype=float).reshape(-1, 3)
    q = np.array([s[1] for s in charge_sites], dtype=float)

    # One flat pass over every probe atom, then fold back per residue.
    probe_coords: list[np.ndarray] = []
    owner: list[tuple[str, int]] = []
    centroids: dict[tuple[str, int], np.ndarray] = {}
    for c in chains:
        for i, residue in enumerate(residues[c.label]):
            atoms = _probe_atoms(residue)
            for atom in atoms:
                probe_coords.append(atom.coord)
                owner.append((c.label, i))
            if atoms:
                centroids[(c.label, i)] = np.mean([a.coord for a in atoms], axis=0)
    phi = potential_at(np.array(probe_coords, dtype=float).reshape(-1, 3), coords, q)

    sums: dict[tuple[str, int], list[float]] = {}
    for key, value in zip(owner, phi, strict=True):
        sums.setdefault(key, []).append(float(value))

    areas, _ = functional._residue_areas(structure, chains)
    chain_out: list[ChainPotential] = []
    candidates: list[tuple[str, int, float]] = []
    for c in chains:
        n = len(c.sequence)
        values = [round(float(np.mean(sums.get((c.label, i), [0.0]))), 2) for i in range(n)]
        profile = functional._profile_for(c, areas.get(c.label, []))
        exposed = list(profile.surface_exposed) if len(profile.surface_exposed) == n else None
        chain_q = sum(site[1] for site in charge_by_chain[c.label])
        chain_out.append(
            ChainPotential(
                chain=c.label,
                sequence=c.sequence,
                potential=values,
                exposed=exposed,
                net_charge=round(chain_q, 2),
                isoelectric_point=_isoelectric_point(c.sequence),
            )
        )
        for i, value in enumerate(values):
            if (
                (exposed is None or exposed[i])
                and abs(value) >= PATCH_THRESHOLD
                and (c.label, i) in centroids
            ):
                candidates.append((c.label, i, value))

    by_label = {c.label: c for c in chains}
    patches: list[ChargedPatch] = []
    for sign in ("positive", "negative"):
        group = [cand for cand in candidates if (cand[2] > 0) == (sign == "positive")]
        points = np.array([centroids[(lab, i)] for lab, i, _ in group]).reshape(-1, 3)
        found = []
        for members in _components(points, PATCH_LINK):
            if len(members) < PATCH_MIN_SIZE:
                continue
            picked = [group[m] for m in members]
            mean = sum(v for _, _, v in picked) / len(picked)
            refs = [
                by_label[lab].ref(i + 1) for lab, i, _ in sorted(picked, key=lambda p: (p[0], p[1]))
            ]
            found.append(
                ChargedPatch(
                    sign=sign,
                    residues=refs,
                    mean_potential=round(mean, 2),
                    label=_patch_label(sign),
                )
            )
        found.sort(key=lambda p: -(len(p.residues) * abs(p.mean_potential)))
        patches.extend(found[:MAX_PATCHES_PER_SIGN])
    patches.sort(key=lambda p: -(len(p.residues) * abs(p.mean_potential)))

    dipole = None
    if len(q):
        all_atoms = np.array(
            [a.coord for rs in residues.values() for r in rs for a in r.get_atoms()], dtype=float
        )
        centre = all_atoms.mean(axis=0)
        moment = ((coords - centre) * q[:, None]).sum(axis=0)
        dipole = round(float(math.sqrt((moment**2).sum())) * DEBYE_PER_E_ANGSTROM, 1)

    return ElectrostaticsResponse(
        protein_id=uid,
        color_range=COLOR_RANGE,
        chains=chain_out,
        patches=patches,
        net_charge=round(float(q.sum()), 2),
        dipole_debye=dipole,
        charged_atoms=len(q),
        notes=notes,
    )
