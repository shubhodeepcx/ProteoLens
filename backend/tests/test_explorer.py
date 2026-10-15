"""Central Dogma Explorer — `services/explorer.py` and `GET /api/explorer`.

Upstream bodies come from `fixtures/explorer_HBB.json` (sickle cell, HBB codon
7), written by `fixtures/record_explorer_fixtures.py`. HBB is on the minus
strand, so the genomic base is the complement of the coding base. The
plus-strand arithmetic is tested on a small synthetic gene. `@respx.mock`
fails any unmocked request.
"""

from __future__ import annotations

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.main import app
from app.services import explorer
from tests.helpers import load_json

client = TestClient(app)


@pytest.fixture(autouse=True)
def fresh_client(monkeypatch):
    monkeypatch.setattr(explorer, "_CLIENT", explorer.EnsemblClient())


@pytest.fixture(scope="module")
def rec() -> dict:
    return load_json("explorer_HBB.json")


def mock_all(rec: dict, *, ensembl_down: bool = False, uniprot_down: bool = False) -> None:
    def ens(body: object) -> httpx.Response:
        return httpx.Response(500) if ensembl_down else httpx.Response(200, json=body)

    respx.get(url__startswith=explorer.KARYOTYPE_URL).mock(return_value=ens(rec["assembly"]))
    respx.get(url__startswith=f"{explorer.ENSEMBL}/lookup/symbol/homo_sapiens/HBB").mock(
        return_value=ens(rec["lookup"])
    )
    respx.get(url__startswith=f"{explorer.ENSEMBL}/sequence/id/ENST00000335295").mock(
        return_value=ens(rec["cds"])
    )
    respx.get(url__startswith=f"{explorer.ENSEMBL}/map/translation/ENSP00000333994/").mock(
        return_value=ens(rec["map"])
    )
    respx.get(url__startswith=explorer.UNIPROT_SEARCH_URL).mock(
        return_value=httpx.Response(503)
        if uniprot_down
        else httpx.Response(200, json=rec["uniprot"])
    )


def view(rec: dict, change: str = "E7V", scenario: str | None = "sickle-cell", **kw):
    return explorer.build_view(
        symbol="HBB",
        change=change,
        scenario=explorer.SCENARIOS[scenario] if scenario else None,
        assembly=rec["assembly"],
        lookup=rec["lookup"],
        cds=rec["cds"],
        codon_map=rec["map"],
        uniprot=rec["uniprot"],
        **kw,
    )


# ---------------------------------------------------------------- parsing


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("E7V", ("E", 7, "V")),
        ("p.Glu7Val", ("E", 7, "V")),
        ("r175h", ("R", 175, "H")),
        ("R213*", ("R", 213, "*")),
        ("p.Arg213Ter", ("R", 213, "*")),
    ],
)
def test_parse_change(text, expected):
    assert explorer.parse_change(text) == expected


@pytest.mark.parametrize("text", ["", "7V", "E7", "Xyz7Val", "*7V", "E7VV"])
def test_parse_change_refuses(text):
    with pytest.raises(explorer.ExplorerError):
        explorer.parse_change(text)


def test_check_gene():
    assert explorer.check_gene("braf") == "BRAF"
    with pytest.raises(explorer.ExplorerError):
        explorer.check_gene("../etc")


def test_choose_alt_codon_prefers_single_base_transitions():
    # CGC (Arg) -> His: CAC is one transition away.
    assert explorer.choose_alt_codon("CGC", "H") == "CAC"
    # GGT (Gly) -> Cys: TGT is one base away (a transversion, the only option).
    assert explorer.choose_alt_codon("GGT", "C") == "TGT"
    assert explorer.choose_alt_codon("GAG", "V", "GTG") == "GTG"


# ------------------------------------------------------------- projection


def test_sickle_cell_codon_strand_and_hgvs(rec):
    v = view(rec)
    var = v.variant
    assert (var.ref_codon, var.alt_codon, var.changed_bases) == ("GAG", "GTG", [1])
    assert var.hgvs_p == "p.Glu7Val"
    assert var.hgvs_c == "c.20A>T"
    assert var.consequence == "missense"
    # Minus strand: coding A at the middle base is a T on the + strand at 5227002.
    assert var.genomic_position == 5227002
    assert (var.genomic_ref, var.genomic_alt) == ("T", "A")
    assert var.exon_number == 1


def test_gene_locus_exons_numbered_five_to_three(rec):
    g = view(rec).gene
    assert (g.symbol, g.chromosome, g.strand, g.transcript) == ("HBB", "11", -1, "ENST00000335295")
    assert g.cytoband is not None and g.cytoband.startswith("11p15")
    # On the minus strand exon 1 has the highest coordinates.
    assert [e.number for e in g.exons] == [1, 2, 3]
    assert g.exons[0].start > g.exons[1].start > g.exons[2].start
    assert g.description == "hemoglobin subunit beta"


def test_chromosomes_exclude_mitochondria_and_carry_bands(rec):
    chroms = view(rec).chromosomes
    names = [c.name for c in chroms]
    assert "MT" not in names and names[0] == "1" and "X" in names and len(names) == 24
    assert all(c.bands for c in chroms)


def test_coding_window_in_frame(rec):
    w = view(rec).window
    assert w.first_codon == 1
    assert w.ref_protein.startswith("MVHLTPEEKSA")
    assert w.alt_protein.startswith("MVHLTPVEKSA")
    assert len(w.ref) == len(w.alt) == 3 * len(w.ref_protein)


def test_handoff_to_uniprot(rec):
    v = view(rec)
    assert (v.accession, v.protein_length, v.handoff_ok) == ("P68871", 147, True)
    assert v.notes == []


def test_handoff_without_uniprot_is_a_note(rec):
    v = explorer.build_view(
        symbol="HBB", change="E7V", scenario=None, assembly=rec["assembly"], lookup=rec["lookup"],
        cds=rec["cds"], codon_map=rec["map"], uniprot=None,
    )  # fmt: skip
    assert v.handoff_ok is False and v.accession is None
    assert "No reviewed UniProt entry" in v.notes[0]


def test_wrong_reference_residue_is_refused(rec):
    with pytest.raises(explorer.ExplorerError, match="GAG, which encodes Glu, not Lys"):
        view(rec, change="K7E", scenario=None)


def test_position_past_the_end_is_refused(rec):
    with pytest.raises(explorer.ExplorerError, match="there is no codon 400"):
        view(rec, change="E400V", scenario=None)


def test_free_change_picks_a_codon_and_nonsense(rec):
    v = view(rec, change="E7*", scenario=None)
    assert v.variant.alt_codon == "TAG"
    assert v.variant.consequence == "nonsense"
    assert v.window.alt_protein.startswith("MVHLTP*")


def test_two_base_change_is_noted(rec):
    v = view(rec, change="E7W", scenario=None)  # GAG -> TGG
    assert v.variant.changed_bases == [0, 1]
    assert v.variant.hgvs_c == "c.19_21delinsTGG"
    assert any("No single-base change" in n for n in v.notes)


def test_plus_strand_genomic_base_is_the_coding_base():
    lookup = {
        "id": "ENSGTEST", "display_name": "TST", "seq_region_name": "7", "start": 1000,
        "end": 1200, "strand": 1,
        "Transcript": [{
            "id": "ENSTTEST", "is_canonical": 1,
            "Translation": {"id": "ENSPTEST", "start": 1010, "end": 1027},
            "Exon": [{"start": 1000, "end": 1100}, {"start": 1150, "end": 1200}],
        }],
    }  # fmt: skip
    assembly = {
        "karyotype": ["7"],
        "top_level_region": [{"name": "7", "length": 5000, "bands": [{"id": "p22.1", "start": 1, "end": 5000, "stain": "gneg"}]}],
    }  # fmt: skip
    v = explorer.build_view(
        symbol="TST", change="R2H", scenario=None, assembly=assembly, lookup=lookup,
        cds={"seq": "ATGCGCAAA"}, codon_map={"mappings": [{"start": 1013, "end": 1015}]}, uniprot=None,
    )  # fmt: skip
    assert v.variant.alt_codon == "CAC"
    assert (v.variant.genomic_position, v.variant.genomic_ref, v.variant.genomic_alt) == (
        1014,
        "G",
        "A",
    )
    assert v.gene.cytoband == "7p22.1"
    assert [e.start for e in v.gene.exons] == [1000, 1150]


# -------------------------------------------------------------------- route


def test_scenarios_route():
    body = client.get("/api/explorer/scenarios").json()
    assert [s["id"] for s in body][:3] == ["sickle-cell", "tp53-r175h", "kras-g12c"]
    assert all(s["story"] for s in body)


@respx.mock
def test_route_by_scenario(rec):
    mock_all(rec)
    r = client.get("/api/explorer", params={"scenario": "sickle-cell"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["scenario"]["id"] == "sickle-cell"
    assert body["variant"]["hgvs_c"] == "c.20A>T"
    assert body["handoff_ok"] is True


@respx.mock
def test_route_by_gene_and_change(rec):
    mock_all(rec)
    r = client.get("/api/explorer", params={"gene": "hbb", "change": "p.Glu7Lys"})
    assert r.status_code == 200, r.text
    assert r.json()["variant"]["alt_codon"] == "AAG"  # HbC, one transition away


@respx.mock
def test_route_uniprot_down_still_answers(rec):
    mock_all(rec, uniprot_down=True)
    r = client.get("/api/explorer", params={"scenario": "sickle-cell"})
    assert r.status_code == 200
    assert r.json()["handoff_ok"] is False


@respx.mock
def test_route_ensembl_down_is_502(rec):
    mock_all(rec, ensembl_down=True)
    r = client.get("/api/explorer", params={"scenario": "sickle-cell"})
    assert r.status_code == 502


@respx.mock
def test_route_bad_change_is_400(rec):
    mock_all(rec)
    r = client.get("/api/explorer", params={"gene": "HBB", "change": "K7E"})
    assert r.status_code == 400
    assert "encodes Glu" in r.json()["detail"]


def test_route_needs_input():
    assert client.get("/api/explorer").status_code == 400
    assert client.get("/api/explorer", params={"scenario": "nope"}).status_code == 404
    assert (
        client.get("/api/explorer", params={"gene": "HBB", "change": "nonsense"}).status_code == 400
    )
