from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import electrostatics as es
from tests.test_functional_api import register_lysozyme

client = TestClient(app)


def test_potential_follows_coulomb_with_distance_dependent_dielectric():
    charges = np.array([1.0])
    coords = np.zeros((1, 3))
    points = np.array([[10.0, 0, 0], [0, 20.0, 0], [0.5, 0, 0]])
    phi = es.potential_at(points, coords, charges)
    assert phi[0] == pytest.approx(332 / 4 / 100)
    assert phi[1] == pytest.approx(phi[0] / 4)  # 1/r^2
    # Floored at MIN_DISTANCE so a point on top of a charge stays finite.
    assert phi[2] == pytest.approx(332 / 4 / es.MIN_DISTANCE**2)


def test_potential_sums_charges_and_chunks_consistently():
    rng = np.random.default_rng(0)
    coords = rng.normal(size=(50, 3)) * 10
    charges = rng.choice([-1.0, 1.0], size=50)
    points = rng.normal(size=(5000, 3)) * 10
    chunked = es.potential_at(points, coords, charges)
    d2 = np.maximum(((points[:, None] - coords[None]) ** 2).sum(axis=2), es.MIN_DISTANCE**2)
    assert np.allclose(chunked, 83.0 * (charges / d2).sum(axis=1))


def test_empty_inputs_give_zero_potential():
    assert es.potential_at(np.zeros((3, 3)), np.zeros((0, 3)), np.zeros(0)).tolist() == [0, 0, 0]


def test_components_link_close_points_only():
    points = np.array([[0, 0, 0], [5, 0, 0], [10, 0, 0], [40, 0, 0]], dtype=float)
    assert es._components(points, 7.5) == [[0, 1, 2], [3]]


def test_lysozyme_is_basic_with_positive_patches():
    uid = register_lysozyme()
    res = client.get(f"/api/proteins/{uid}/electrostatics")
    assert res.status_code == 200
    body = res.json()
    # Hen lysozyme: 6 Lys + 11 Arg against 7 Asp + 2 Glu, plus the termini.
    assert body["net_charge"] == pytest.approx(8.1, abs=0.2)
    chain = body["chains"][0]
    assert chain["isoelectric_point"] > 9
    assert len(chain["potential"]) == len(chain["sequence"]) == 129
    assert chain["exposed"] is not None and len(chain["exposed"]) == 129
    assert body["dipole_debye"] > 0
    assert body["color_range"] == es.COLOR_RANGE
    # Every lysine side chain sits in positive potential.
    lys = [v for v, aa in zip(chain["potential"], chain["sequence"], strict=True) if aa == "K"]
    assert min(lys) > 0
    positive = [p for p in body["patches"] if p["sign"] == "positive"]
    assert positive
    for patch in body["patches"]:
        assert len(patch["residues"]) >= es.PATCH_MIN_SIZE
        assert patch["mean_potential"] >= es.PATCH_THRESHOLD
        assert all(r["key"] == f"A:{r['ordinal']}" for r in patch["residues"])
    assert any("Poisson-Boltzmann" in n for n in body["notes"])


def test_unknown_protein_is_404():
    assert client.get("/api/proteins/nope/electrostatics").status_code == 404
