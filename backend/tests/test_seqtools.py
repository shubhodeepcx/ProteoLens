from __future__ import annotations

import random

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import seqtools as st

client = TestClient(app)


def _random(n: int, seed: int = 7) -> str:
    rng = random.Random(seed)
    return "".join(rng.choice("ACGT") for _ in range(n))


# A 60-codon ORF with no internal stops, flanked by random sequence.
ORF = "ATG" + "GCTAAAGAGCTGTTCCGC" * 10 + "TAA"
SEQ = _random(200) + ORF + _random(200, seed=8)


# ---------------------------------------------------------------- input


def test_clean_strips_fasta_whitespace_digits_and_reads_u_as_t():
    assert st.clean(">gene 1\n1 acgu acgt\n;comment\n61 nnaa") == "ACGTACGTNNAA"


@pytest.mark.parametrize(
    ("text", "message"),
    [("", "empty"), (">only a header", "empty"), ("MKVLAAGIW", "protein")],
)
def test_clean_rejects_bad_input(text, message):
    with pytest.raises(st.SequenceError, match=message):
        st.clean(text)


def test_clean_rejects_sequences_over_the_limit():
    with pytest.raises(st.SequenceError, match="limit"):
        st.clean("A" * (st.MAX_LENGTH + 1))


def test_revcomp_and_gc():
    assert st.revcomp("AACGTN") == "NACGTT"
    assert st.gc_percent("GGCCAT") == pytest.approx(66.7)
    assert st.gc_percent("NNNN") == 0.0


def test_stats_counts_and_weight():
    s = st.stats("ACGTACGT")
    assert s.length == 8
    assert s.counts == {"A": 2, "C": 2, "G": 2, "T": 2, "N": 0}
    assert s.reverse_complement == "ACGTACGT"
    assert s.molecular_weight_ds > 4000


# ---------------------------------------------------------------- ORFs


def test_finds_the_planted_orf_with_forward_coordinates():
    result = st.find_orfs(SEQ, min_codons=50)
    planted = next(o for o in result.orfs if o.strand == "+" and o.start == 201)
    assert planted.end == 200 + len(ORF)
    assert planted.length_aa == 61
    assert planted.protein.startswith("MAKELFR")
    assert planted.complete
    assert len(result.frames) == 6


def test_reverse_strand_orf_maps_back_to_forward_coordinates():
    seq = _random(150, seed=3) + st.revcomp(ORF) + _random(150, seed=4)
    result = st.find_orfs(seq, min_codons=50)
    orf = next(o for o in result.orfs if o.strand == "-" and o.length_aa == 61)
    assert (orf.start, orf.end) == (151, 150 + len(ORF))
    assert st.revcomp(seq[orf.start - 1 : orf.end]) == ORF


def test_orf_running_off_the_end_is_reported_incomplete():
    seq = "CC" + ORF[:-3] + "GC"
    orf = st.find_orfs(seq, min_codons=50).orfs[0]
    assert not orf.complete
    assert orf.start == 3


def test_stop_to_stop_mode_needs_no_atg():
    seq = "TAA" + "GCT" * 40 + "TAG"
    assert not st.find_orfs(seq, min_codons=30).orfs
    orfs = st.find_orfs(seq, min_codons=30, require_atg=False).orfs
    forward = next(o for o in orfs if o.frame == 1 and o.complete)
    assert forward.start == 4 and forward.length_aa == 40


# ---------------------------------------------------------------- restriction


def test_restriction_cut_positions_and_linear_fragments():
    seq = "AAAAAGAATTCAAAAAAAAAAGGATCCAAAAA"
    result = st.restriction_map(seq, enzymes=["EcoRI", "BamHI", "NotI"])
    by_name = {e.name: e for e in result.enzymes}
    assert by_name["EcoRI"].cuts == [7]  # G^AATTC at 6
    assert by_name["EcoRI"].overhang == "5'"
    assert by_name["EcoRI"].site == "G^AATT_C"
    assert by_name["BamHI"].cuts == [23]
    assert sorted(by_name["EcoRI"].fragments) == [6, len(seq) - 6]
    assert result.non_cutters == ["NotI"]
    assert result.unique_cutters == ["BamHI", "EcoRI"]


def test_circular_single_cut_leaves_one_full_length_fragment():
    seq = "GAATTC" + "A" * 100
    result = st.restriction_map(seq, circular=True, enzymes=["EcoRI"])
    assert result.enzymes[0].fragments == [len(seq)]


def test_circular_fragments_wrap_around_the_origin():
    assert st._fragments([10, 40], 100, circular=True) == [70, 30]
    assert st._fragments([10, 40], 100, circular=False) == [61, 30, 9]


def test_blunt_cutter_is_labelled_blunt():
    result = st.restriction_map("AAAGATATCAAA", enzymes=["EcoRV"])
    assert result.enzymes[0].overhang == "blunt"


def test_unknown_enzyme_is_an_error():
    with pytest.raises(st.SequenceError, match="Unknown"):
        st.restriction_map("ACGT", enzymes=["NotAnEnzyme"])


def test_default_panel_is_all_real_enzymes():
    result = st.restriction_map(_random(2000))
    assert len(result.enzymes) + len(result.non_cutters) == len(st.DEFAULT_ENZYMES)


# ---------------------------------------------------------------- primers


def test_tm_and_three_prime_complement():
    assert 55 < st.tm("AGCGGATAACAATTTCACACAGGA") < 62
    assert st.three_prime_complement("AAAAAGAATTC", "GAATTC") == 6  # palindrome
    assert st.three_prime_complement("AAAAAAAAG", "TTTTTTT") == 0


def test_primers_flank_the_target_and_read_off_the_sequence():
    seq = _random(1200, seed=11)
    result = st.design_primers(seq, 500, 600)
    assert result.pairs
    for pair in result.pairs:
        f, r = pair.forward, pair.reverse
        assert f.end < 500 and r.start > 600
        assert seq[f.start - 1 : f.end] == f.sequence
        assert st.revcomp(seq[r.start - 1 : r.end]) == r.sequence
        assert pair.product_size == r.end - f.start + 1
        assert pair.tm_difference <= 3
        assert 18 <= f.length <= 25
    penalties = [p.penalty for p in result.pairs]
    assert penalties == sorted(penalties)


def test_primers_without_target_span_the_sequence():
    seq = _random(800, seed=12)
    pair = st.design_primers(seq).pairs[0]
    assert pair.forward.start <= st.END_WINDOW
    assert pair.reverse.end > len(seq) - st.END_WINDOW


def test_primer_target_outside_sequence_is_an_error():
    with pytest.raises(st.SequenceError, match="outside"):
        st.design_primers("ACGT" * 50, 10, 500)


def test_unprimeable_sequence_says_so():
    result = st.design_primers("A" * 300)
    assert result.pairs == []
    assert "No pair" in result.notes[0]


# ---------------------------------------------------------------- CRISPR


def test_guides_match_sequence_and_cut_three_bp_from_pam():
    seq = _random(600, seed=21)
    result = st.design_guides(seq)
    assert result.guides
    for g in result.guides:
        if g.strand == "+":
            assert seq[g.start - 1 : g.end] == g.protospacer
            assert seq[g.end : g.end + 3] == g.pam
            assert g.cut_site == g.end - 3
        else:
            assert st.revcomp(seq[g.start - 1 : g.end]) == g.protospacer
            assert st.revcomp(seq[g.start - 4 : g.start - 1]) == g.pam
            assert g.cut_site == g.start + 2
        assert g.pam.endswith("GG")
        assert 0 <= g.score <= 100


def test_guides_are_limited_to_the_target():
    seq = _random(1000, seed=22)
    for g in st.design_guides(seq, 400, 450).guides:
        assert 400 <= g.cut_site <= 450


def test_poly_t_and_duplicate_sites_are_flagged_and_penalised():
    poly_t = "GACGTTTTCAGCATGCAGCA" + "TGG"
    flags, score = st._guide_flags(poly_t[:20])
    assert "TTTT ends U6 transcription" in flags
    assert score < 60

    unique = "GCATCGATGCAGTCAGCTAG"
    seq = _random(100, seed=1) + unique + "AGG" + _random(100, seed=2) + unique + "TGG"
    guide = next(g for g in st.design_guides(seq).guides if g.protospacer == unique)
    assert guide.off_targets_in_sequence == 1
    assert any("similar site" in f for f in guide.flags)


def test_no_sites_returns_an_empty_list():
    result = st.design_guides("ACACACACACACACACACACACACAC")
    assert result.guides == [] and result.total_sites == 0


# ---------------------------------------------------------------- API


def test_api_orfs():
    res = client.post("/api/tools/orfs", json={"sequence": ">x\n" + SEQ, "min_codons": 50})
    assert res.status_code == 200
    assert any(o["start"] == 201 for o in res.json()["orfs"])


def test_api_rejects_protein_with_422():
    res = client.post("/api/tools/crispr", json={"sequence": "MKVLAAGIWQ"})
    assert res.status_code == 422
    assert "protein" in res.json()["detail"]


def test_api_restriction_unknown_enzyme_is_422():
    res = client.post("/api/tools/restriction", json={"sequence": "ACGT", "enzymes": ["Nope"]})
    assert res.status_code == 422


def test_api_primers_and_crispr():
    seq = _random(900, seed=31)
    res = client.post(
        "/api/tools/primers", json={"sequence": seq, "target_start": 300, "target_end": 400}
    )
    assert res.status_code == 200 and res.json()["pairs"]
    res = client.post("/api/tools/crispr", json={"sequence": seq, "max_guides": 5})
    assert res.status_code == 200 and len(res.json()["guides"]) <= 5
