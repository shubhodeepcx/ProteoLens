"""A2 structural half — `services/variant.py` and `POST /api/proteins/{uid}/variant`.

Lysozyme (1HEW) carries every case the module must get right: UniProt P00698
numbers an 18-residue signal peptide, so clinical position 53 is Glu35 in the
file; Cys6 is disulfide-bonded to Cys127; Leu56 is buried; Trp62 touches the
bound NAG. Every upstream call is mocked; nothing reaches the network.
"""

from __future__ import annotations

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.api.proteins import parse_structure_for_analytics
from app.main import app
from app.services import registry, variant
from app.services.parser import parse
from app.storage import local as storage
from tests.helpers import FIXTURES, load_json

client = TestClient(app)

UNIPROT_ENTRY = "https://rest.uniprot.org/uniprotkb/"
ROUTE = "/api/proteins/{uid}/variant"
UID = "f" * 32


def lysozyme():
    path = FIXTURES / "1HEW.pdb"
    return parse(path, UID), parse_structure_for_analytics(path)


def analyse(notation: str, **kwargs):
    summary, structure = lysozyme()
    return variant.analyse(UID, summary, structure, notation, **kwargs)


def codes(site) -> set[str]:
    return {flag.code for flag in site.flags}


# ------------------------------------------------------------------ parsing


@pytest.mark.parametrize(
    ("notation", "ref", "position", "alt", "kind", "hgvs"),
    [
        ("R175H", "R", 175, "H", "missense", "p.Arg175His"),
        ("p.Arg175His", "R", 175, "H", "missense", "p.Arg175His"),
        ("TP53 R175H", "R", 175, "H", "missense", "p.Arg175His"),
        ("TP53:p.(Arg175His)", "R", 175, "H", "missense", "p.Arg175His"),
        ("W53*", "W", 53, "*", "nonsense", "p.Trp53Ter"),
        ("p.Trp53Ter", "W", 53, "*", "nonsense", "p.Trp53Ter"),
        ("F508del", "F", 508, None, "deletion", "p.Phe508del"),
        ("p.Leu10=", "L", 10, "L", "synonymous", "p.Leu10="),
        ("G12G", "G", 12, "G", "synonymous", "p.Gly12="),
    ],
)
def test_notation_forms(notation, ref, position, alt, kind, hgvs) -> None:
    parsed = variant.parse_notation(notation)
    assert (parsed.ref, parsed.position, parsed.alt, parsed.kind) == (ref, position, alt, kind)
    assert parsed.hgvs == hgvs


@pytest.mark.parametrize("notation", ["", "banana", "R0H", "B12A", "Xyz12Ala", "R12"])
def test_unreadable_notation_is_refused(notation) -> None:
    with pytest.raises(variant.VariantError):
        variant.parse_notation(notation)


def test_physicochemistry_of_a_buried_charge() -> None:
    chem = variant.physicochemistry(variant.parse_notation("L56R"))
    assert (chem.charge_ref, chem.charge_alt) == (0, 1)
    assert chem.volume_alt - chem.volume_ref == pytest.approx(6.7)
    assert chem.blosum62 == -2


# ----------------------------------------------------------------- locating


def test_uniprot_numbering_lands_on_the_mature_residue() -> None:
    """UniProt 53 is Glu35 in every lysozyme crystal structure."""
    impact = analyse(
        "p.Glu53Gln", entry=load_json("uniprot_functional_P00698.json"), accession="P00698"
    )
    (site,) = impact.sites
    assert impact.numbering == "uniprot"
    assert (site.residue.key, site.residue.residue, site.residue.auth_seq_id) == ("A:35", "E", 35)
    assert "curated-site" in codes(site)
    assert impact.concern == "high"


def test_uniprot_reference_mismatch_is_refused_not_moved() -> None:
    with pytest.raises(variant.VariantError, match="UniProt has Leu at position 35"):
        analyse("E35Q", entry=load_json("uniprot_functional_P00698.json"), accession="P00698")


def test_author_numbering_checks_the_reference_residue() -> None:
    impact = analyse("E35Q")
    assert impact.numbering == "author"
    assert impact.sites[0].residue.key == "A:35"
    with pytest.raises(variant.VariantError, match="is Glu"):
        analyse("A35Q")


def test_missing_position_and_chain_are_refused() -> None:
    with pytest.raises(variant.VariantError, match="No residue numbered 999"):
        analyse("A999G")
    with pytest.raises(variant.VariantError, match="no protein chain 'Z'"):
        analyse("E35Q", chain="Z")


# ---------------------------------------------------------------- measuring


def test_disulfide_partner_is_found() -> None:
    (site,) = analyse("C6S").sites
    assert site.disulfide_partner is not None
    assert site.disulfide_partner.key == "A:127"
    assert "disulfide" in codes(site)


def test_buried_charge_and_ligand_contact() -> None:
    (site,) = analyse("L56R").sites
    assert site.burial == "buried"
    assert site.relative_accessibility is not None and site.relative_accessibility < 0.05
    assert site.ligand_contacts == ["NAG"]
    assert {"buried-charge", "ligand-contact"} <= codes(site)


def test_stop_reports_what_is_lost() -> None:
    impact = analyse("W62*")
    assert impact.kind == "nonsense"
    assert impact.truncated_residues == 129 - 62 + 1
    assert "truncation" in codes(impact.sites[0])


def test_synonymous_raises_nothing() -> None:
    impact = analyse("E35=")
    assert impact.concern == "low"
    assert codes(impact.sites[0]) == {"synonymous"}


def test_neighbours_are_selection_keys() -> None:
    (site,) = analyse("L56R").sites
    assert site.neighbours
    assert all(n.key == f"{n.chain}:{n.ordinal}" for n in site.neighbours)
    assert all(n.key != "A:56" for n in site.neighbours)


def test_modified_residue_in_chain_is_not_a_ligand() -> None:
    path = FIXTURES / "compounds_complex.pdb"
    summary = parse(path, UID)
    structure = parse_structure_for_analytics(path)
    impact = variant.analyse(UID, summary, structure, "R10A")
    assert "SEP" not in impact.sites[0].ligand_contacts


def test_not_a_prediction_note_is_always_present() -> None:
    assert variant.NOT_A_PREDICTION_NOTE in analyse("E35Q").notes


# ----------------------------------------------------------------- endpoint


def register_lysozyme(source: str = "uploaded", source_id: str | None = None) -> str:
    uid, path = storage.store_upload((FIXTURES / "1HEW.pdb").read_bytes(), "pdb")
    registry.put(uid, parse(path, uid, source=source, source_id=source_id))  # type: ignore[arg-type]
    return uid


@respx.mock
def test_endpoint_maps_through_uniprot() -> None:
    uid = register_lysozyme(source="uniprot", source_id="P00698")
    respx.get(url__startswith=UNIPROT_ENTRY).mock(
        return_value=httpx.Response(200, json=load_json("uniprot_functional_P00698.json"))
    )
    response = client.post(ROUTE.format(uid=uid), json={"notation": "p.Glu53Gln"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["numbering"] == "uniprot"
    assert body["sites"][0]["residue"]["key"] == "A:35"


@respx.mock
def test_endpoint_falls_back_to_file_numbering_when_uniprot_is_down() -> None:
    uid = register_lysozyme(source="uniprot", source_id="P00698")
    respx.get(url__startswith=UNIPROT_ENTRY).mock(return_value=httpx.Response(503))
    body = client.post(ROUTE.format(uid=uid), json={"notation": "E35Q"}).json()
    assert body["numbering"] == "author"
    assert any("could not be reached" in note for note in body["notes"])


def test_endpoint_refuses_with_a_reason() -> None:
    uid = register_lysozyme()
    response = client.post(ROUTE.format(uid=uid), json={"notation": "banana"})
    assert response.status_code == 422
    assert "Could not read" in response.json()["detail"]
    response = client.post(ROUTE.format(uid=uid), json={"notation": "A35Q"})
    assert response.status_code == 422


def test_endpoint_404s_for_an_unknown_protein() -> None:
    assert client.post(ROUTE.format(uid="0" * 32), json={"notation": "R1A"}).status_code == 404
