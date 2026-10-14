"""P14 sequence tools: ORF finder, restriction map, PCR primers, SpCas9 guides.

All of it is local computation on a submitted DNA string. Nothing here touches
storage or the network, so every function is a plain synchronous call and every
bad input is a `SequenceError` the router turns into a 422.

## Coordinates

Every position this module returns is 1-based and on the forward strand of the
sequence as submitted, even for features found on the reverse complement. A
reverse-strand feature occupying 0-based ``[a, b)`` of the reverse complement
occupies 0-based ``[L - b, L - a)`` of the forward strand.

## What the scores are and are not

The primer penalty and the CRISPR score are transparent rules of thumb, built
from the same criteria a bench scientist checks by eye (Tm, GC, 3' clamp, runs,
3' complementarity; GC window, poly-T, homopolymers, near-identical sites). They
are not Primer3 and not Rule Set 2 / Azimuth, and the responses say so.
"""

from __future__ import annotations

import re
from itertools import pairwise
from typing import TYPE_CHECKING

import numpy as np
from Bio import Restriction
from Bio.Restriction import Analysis, RestrictionBatch
from Bio.Seq import Seq
from Bio.SeqUtils import MeltingTemp, molecular_weight

from app.models.seqtools import (
    CrisprGuide,
    CrisprResponse,
    EnzymeCuts,
    FrameTranslation,
    Orf,
    OrfResponse,
    Primer,
    PrimerPair,
    PrimerResponse,
    RestrictionResponse,
    SequenceStats,
)

if TYPE_CHECKING:
    from Bio.Restriction.Restriction import RestrictionType

MAX_LENGTH = 100_000
STOPS = frozenset({"TAA", "TAG", "TGA"})

# Enzymes a molecular-biology teaching lab actually stocks: the classic MCS
# cutters, the rare 8-cutters, and the two Golden Gate type IIS enzymes.
DEFAULT_ENZYMES = (
    "EcoRI",
    "BamHI",
    "HindIII",
    "XhoI",
    "XbaI",
    "SalI",
    "PstI",
    "KpnI",
    "SacI",
    "SmaI",
    "EcoRV",
    "NcoI",
    "NdeI",
    "NheI",
    "SpeI",
    "BglII",
    "NotI",
    "AscI",
    "PacI",
    "SfiI",
    "ApaI",
    "ClaI",
    "MluI",
    "AgeI",
    "AvrII",
    "SphI",
    "PvuII",
    "ScaI",
    "HpaI",
    "BsaI",
    "BsmBI",
)

_DNA_ALPHABET = re.compile(r"^[ACGTN]*$")
_COMPLEMENT = str.maketrans("ACGTN", "TGCAN")


class SequenceError(ValueError):
    """The submitted sequence or parameters cannot be analysed."""


# ---------------------------------------------------------------- input


def clean(text: str) -> str:
    """Normalise plain or FASTA input to an uppercase ACGTN string.

    Header lines (``>``) and comment lines (``;``) are dropped, whitespace and
    digits (GenBank-style numbering) ignored, and U read as T so mRNA pastes
    work. Anything else left over is an error naming the offending characters.
    """
    body = "".join(line for line in text.splitlines() if not line.lstrip().startswith((">", ";")))
    seq = re.sub(r"[\s\d]", "", body).upper().replace("U", "T")
    if not seq:
        raise SequenceError("The sequence is empty.")
    if not _DNA_ALPHABET.match(seq):
        bad = sorted(set(re.sub(r"[ACGTN]", "", seq)))
        raise SequenceError(
            "Only A, C, G, T (or U) and N are accepted; found "
            + ", ".join(repr(c) for c in bad[:8])
            + ". Is this a protein sequence?"
        )
    if len(seq) > MAX_LENGTH:
        raise SequenceError(f"The sequence is {len(seq):,} nt; the limit is {MAX_LENGTH:,}.")
    return seq


def revcomp(seq: str) -> str:
    return seq.translate(_COMPLEMENT)[::-1]


def gc_percent(seq: str) -> float:
    acgt = sum(seq.count(b) for b in "ACGT")
    if not acgt:
        return 0.0
    return round(100 * (seq.count("G") + seq.count("C")) / acgt, 1)


def stats(seq: str) -> SequenceStats:
    counts = {b: seq.count(b) for b in "ACGTN"}
    if counts["N"]:
        mw = 0.0
    else:
        mw = round(molecular_weight(Seq(seq), "DNA", double_stranded=True), 1)
    return SequenceStats(
        length=len(seq),
        gc_percent=gc_percent(seq),
        counts=counts,
        reverse_complement=revcomp(seq),
        molecular_weight_ds=mw,
    )


def _forward_span(length: int, strand: str, a: int, b: int) -> tuple[int, int]:
    """0-based half-open ``[a, b)`` on `strand` -> 1-based inclusive forward span."""
    if strand == "+":
        return a + 1, b
    return length - b + 1, length - a


# ---------------------------------------------------------------- ORFs


def _translate(codons: str) -> str:
    usable = len(codons) - len(codons) % 3
    return str(Seq(codons[:usable]).translate(table=1))


def find_orfs(seq: str, min_codons: int = 30, require_atg: bool = True) -> OrfResponse:
    """Six-frame ORF scan.

    With `require_atg`, each ORF runs from the first ATG after the previous stop
    to the next in-frame stop, so nested ATGs do not produce nested ORFs. Without
    it, ORFs run stop to stop. An open frame running off the end of the sequence
    is reported with ``complete=False`` rather than dropped: in a partial clone
    that is often the gene of interest.
    """
    length = len(seq)
    orfs: list[Orf] = []
    frames: list[FrameTranslation] = []

    for strand, strand_seq in (("+", seq), ("-", revcomp(seq))):
        for offset in range(3):
            frame = (offset + 1) * (1 if strand == "+" else -1)
            frames.append(FrameTranslation(frame=frame, protein=_translate(strand_seq[offset:])))

            def emit(
                a: int,
                b: int,
                complete: bool,
                strand: str = strand,
                frame: int = frame,
                s: str = strand_seq,
            ) -> None:
                coding = b - a - (3 if complete else 0)
                if coding // 3 < min_codons:
                    return
                start, end = _forward_span(length, strand, a, b)
                protein = _translate(s[a:b]).rstrip("*")
                orfs.append(
                    Orf(
                        frame=frame,
                        strand=strand,
                        start=start,
                        end=end,
                        length_nt=b - a,
                        length_aa=len(protein),
                        complete=complete,
                        protein=protein,
                    )
                )

            open_at: int | None = None if require_atg else offset
            i = offset
            while i + 3 <= len(strand_seq):
                codon = strand_seq[i : i + 3]
                if open_at is None:
                    if codon == "ATG":
                        open_at = i
                elif codon in STOPS:
                    emit(open_at, i + 3, True)
                    open_at = None if require_atg else i + 3
                i += 3
            if open_at is not None:
                end = i  # last whole codon boundary
                if end > open_at:
                    emit(open_at, end, False)

    orfs.sort(key=lambda o: (-o.length_aa, o.start))
    return OrfResponse(stats=stats(seq), orfs=orfs, frames=frames)


# ---------------------------------------------------------------- restriction


def _enzyme(name: str) -> RestrictionType:
    enzyme = getattr(Restriction, name.strip(), None)
    if enzyme is None or not hasattr(enzyme, "search"):
        raise SequenceError(f"Unknown restriction enzyme {name!r}.")
    return enzyme


def _overhang(enzyme: RestrictionType) -> str:
    if enzyme.is_blunt():
        return "blunt"
    if enzyme.is_5overhang():
        return "5'"
    if enzyme.is_3overhang():
        return "3'"
    return "unknown"


def _fragments(cuts: list[int], length: int, circular: bool) -> list[int]:
    if not cuts:
        return [length]
    if circular:
        if len(cuts) == 1:
            return [length]
        sizes = [b - a for a, b in pairwise(cuts)]
        sizes.append(length - cuts[-1] + cuts[0])
    else:
        bounds = [1, *cuts, length + 1]
        sizes = [b - a for a, b in pairwise(bounds)]
    return sorted((s for s in sizes if s > 0), reverse=True)


def restriction_map(
    seq: str, circular: bool = False, enzymes: list[str] | None = None
) -> RestrictionResponse:
    names = list(dict.fromkeys(enzymes or DEFAULT_ENZYMES))
    if not names:
        raise SequenceError("Choose at least one enzyme.")
    batch = RestrictionBatch([_enzyme(n) for n in names])
    found = Analysis(batch, Seq(seq), linear=not circular).full()

    cutting: list[EnzymeCuts] = []
    non_cutters: list[str] = []
    for enzyme, cuts in found.items():
        if not cuts:
            non_cutters.append(str(enzyme))
            continue
        cuts = sorted(cuts)
        cutting.append(
            EnzymeCuts(
                name=str(enzyme),
                site=enzyme.elucidate(),
                overhang=_overhang(enzyme),
                cuts=cuts,
                fragments=_fragments(cuts, len(seq), circular),
            )
        )
    cutting.sort(key=lambda e: (len(e.cuts), e.name))
    return RestrictionResponse(
        length=len(seq),
        circular=circular,
        enzymes=cutting,
        unique_cutters=[e.name for e in cutting if len(e.cuts) == 1],
        non_cutters=sorted(non_cutters),
    )


# ---------------------------------------------------------------- primers

TM_NOTE = (
    "Tm is nearest-neighbour (SantaLucia 1998) at 50 mM Na+ and 250 nM primer; "
    "your polymerase's buffer may shift it by a few degrees."
)
PRIMER_RANK_NOTE = (
    "Ranking is a transparent penalty (Tm, GC, 3' clamp, runs, 3' dimers), not Primer3."
)
PRIMER_WINDOW = 200  # nt either side of a target the primers may sit in
END_WINDOW = 60  # with no target: primers start within this many nt of each end


def tm(primer: str) -> float:
    """Nearest-neighbour Tm (SantaLucia 1998), 50 mM Na+, 250 nM primer."""
    return round(MeltingTemp.Tm_NN(primer, Na=50, dnac1=250, dnac2=0), 1)


def longest_run(seq: str) -> int:
    return max((len(m.group(0)) for m in re.finditer(r"(.)\1*", seq)), default=0)


def three_prime_complement(primer: str, other: str) -> int:
    """Longest 3'-terminal stretch of `primer` that can base-pair inside `other`.

    This is the stretch polymerase would extend in a primer-dimer: the last k
    bases of `primer` whose reverse complement occurs in `other`. An
    approximation of Primer3's 3' complementarity, without gaps or mismatches.
    """
    best = 0
    for k in range(1, len(primer) + 1):
        if revcomp(primer[-k:]) in other:
            best = k
        else:
            break
    return best


def _primer(
    seq_on_strand: str, strand: str, a: int, b: int, length: int, target_tm: float
) -> Primer | None:
    p = seq_on_strand[a:b]
    if "N" in p:
        return None
    gc = gc_percent(p)
    if not 30 <= gc <= 70:
        return None
    run = longest_run(p)
    if run > 5:
        return None
    t = tm(p)
    if abs(t - target_tm) > 5:
        return None
    clamp = p[-1] in "GC" and sum(c in "GC" for c in p[-5:]) <= 3
    dimer = three_prime_complement(p, p)
    penalty = (
        abs(t - target_tm)
        + abs(gc - 50) / 10
        + (0 if clamp else 1.0)
        + max(0, run - 3)
        + max(0, dimer - 3)
    )
    start, end = _forward_span(length, strand, a, b)
    return Primer(
        sequence=p,
        strand=strand,
        start=start,
        end=end,
        length=len(p),
        tm=t,
        gc_percent=gc,
        gc_clamp=clamp,
        max_run=run,
        self_dimer_3prime=dimer,
        penalty=round(penalty, 2),
    )


def design_primers(
    seq: str,
    target_start: int | None = None,
    target_end: int | None = None,
    min_length: int = 18,
    max_length: int = 25,
    target_tm: float = 60.0,
    max_pairs: int = 5,
) -> PrimerResponse:
    """PCR primer pairs that amplify a target, or as much of the sequence as fits.

    With a target, the forward primer sits entirely upstream of it and the
    reverse primer entirely downstream, each within `PRIMER_WINDOW` nt, so the
    product always contains the whole target. With no target, each primer
    starts within `END_WINDOW` nt of its end of the sequence.
    """
    length = len(seq)
    if min_length > max_length:
        raise SequenceError("Minimum primer length is greater than the maximum.")
    has_target = target_start is not None or target_end is not None
    t_start = target_start or 1
    t_end = target_end or length
    if t_end > length or t_start > t_end:
        raise SequenceError(f"The target {t_start}-{t_end} is outside the {length} nt sequence.")

    rc = revcomp(seq)
    forward: list[Primer] = []
    reverse: list[Primer] = []
    for n in range(min_length, max_length + 1):
        if has_target:
            # forward [a, a+n) with a+n <= t_start-1 (0-based end before target)
            f_starts = range(max(0, t_start - 1 - PRIMER_WINDOW - n), max(0, t_start - n))
            # reverse on forward coords [x, x+n) with x >= t_end; map to rc start
            r_fwd_starts = range(t_end, min(length - n, t_end + PRIMER_WINDOW) + 1)
        else:
            f_starts = range(min(END_WINDOW, length - n + 1))
            r_fwd_starts = range(max(0, length - n - END_WINDOW + 1), length - n + 1)
        for a in f_starts:
            if (p := _primer(seq, "+", a, a + n, length, target_tm)) is not None:
                forward.append(p)
        for x in r_fwd_starts:
            a = length - (x + n)
            if (p := _primer(rc, "-", a, a + n, length, target_tm)) is not None:
                reverse.append(p)

    notes = [TM_NOTE, PRIMER_RANK_NOTE]
    forward.sort(key=lambda p: p.penalty)
    reverse.sort(key=lambda p: p.penalty)
    pairs: list[PrimerPair] = []
    for f in forward[:40]:
        for r in reverse[:40]:
            size = r.end - f.start + 1
            if size < 40:
                continue
            diff = round(abs(f.tm - r.tm), 1)
            if diff > 3:
                continue
            cross = max(
                three_prime_complement(f.sequence, r.sequence),
                three_prime_complement(r.sequence, f.sequence),
            )
            pairs.append(
                PrimerPair(
                    forward=f,
                    reverse=r,
                    product_size=size,
                    tm_difference=diff,
                    pair_dimer_3prime=cross,
                    penalty=round(f.penalty + r.penalty + diff + max(0, cross - 3), 2),
                )
            )
    pairs.sort(key=lambda p: (p.penalty, p.product_size))
    if not pairs:
        notes.insert(
            0, "No pair met the criteria; try a wider length range or a different target Tm."
        )
    return PrimerResponse(
        target_start=t_start, target_end=t_end, pairs=pairs[:max_pairs], notes=notes
    )


# ---------------------------------------------------------------- CRISPR

PROTOSPACER = 20
OFF_TARGET_MISMATCHES = 3
GUIDE_SCORE_NOTE = (
    "Score is a 0-100 rule-of-thumb (GC window, poly-T, homopolymers, PAM-proximal G, "
    "similar sites), not Rule Set 2 or Azimuth."
)
U6_NOTE = "For U6-promoter expression, prepend a G to any guide that does not start with one."
OFF_TARGET_NOTE = (
    "Off-targets are counted only within the submitted sequence (up to 3 mismatches). "
    "Check genome-wide specificity with CRISPOR or Cas-OFFinder before ordering."
)
_ENCODE = np.zeros(256, dtype=np.uint8)
for _i, _b in enumerate("ACGTN"):
    _ENCODE[ord(_b)] = _i


def _encode(guides: list[str]) -> np.ndarray:
    raw = np.frombuffer("".join(guides).encode(), dtype=np.uint8)
    return _ENCODE[raw].reshape(len(guides), PROTOSPACER)


def _sites(seq: str) -> list[tuple[str, str, str, int, int, int]]:
    """Every SpCas9 site: (protospacer, pam, strand, start, end, cut_after)."""
    length = len(seq)
    found = []
    for strand, s in (("+", seq), ("-", revcomp(seq))):
        for i in range(len(s) - PROTOSPACER - 2):
            pam = s[i + PROTOSPACER : i + PROTOSPACER + 3]
            if pam[1:] != "GG":
                continue
            spacer = s[i : i + PROTOSPACER]
            if "N" in spacer or pam[0] == "N":
                continue
            start, end = _forward_span(length, strand, i, i + PROTOSPACER)
            # Cas9 cuts 3 bp 5' of the PAM: between spacer bases 17 and 18.
            cut_after = start + 16 if strand == "+" else end - 17
            found.append((spacer, pam, strand, start, end, cut_after))
    return found


def _guide_flags(spacer: str) -> tuple[list[str], float]:
    flags: list[str] = []
    score = 95.0  # an ideal guide reaches 100 only with the PAM-proximal G
    gc = gc_percent(spacer)
    if gc < 40:
        flags.append("low GC")
        score -= (40 - gc) * 1.5
    elif gc > 80:
        flags.append("high GC")
        score -= (gc - 80) * 1.5
    else:
        score -= abs(gc - 55) * 0.3
    if "TTTT" in spacer:
        flags.append("TTTT ends U6 transcription")
        score -= 40
    if longest_run(spacer) >= 5:
        flags.append("homopolymer run")
        score -= 15
    if spacer[-1] == "G":
        score += 5  # a G next to the PAM is enriched among active guides
    return flags, score


def design_guides(
    seq: str,
    target_start: int | None = None,
    target_end: int | None = None,
    max_guides: int = 20,
) -> CrisprResponse:
    """SpCas9 (NGG) guides whose cut site falls inside the target.

    Off-target counting is limited to the submitted sequence: a genome-wide
    search needs an indexed genome this tool does not ship, and the response
    says so rather than implying specificity.
    """
    length = len(seq)
    lo = target_start or 1
    hi = target_end or length
    if hi > length or lo > hi:
        raise SequenceError(f"The target {lo}-{hi} is outside the {length} nt sequence.")

    sites = _sites(seq)
    candidates = []
    for spacer, pam, strand, start, end, cut in sites:
        if not lo <= cut <= hi:
            continue
        flags, score = _guide_flags(spacer)
        candidates.append([spacer, pam, strand, start, end, cut, flags, score])

    # Off-targets are the expensive part; count them only for the guides that
    # could still make the list.
    candidates.sort(key=lambda c: -c[7])
    shortlist = candidates[: max(max_guides * 3, 60)]
    if shortlist and sites:
        every = _encode([s[0] for s in sites])
        for c in shortlist:
            mismatches = (every != _encode([c[0]])).sum(axis=1)
            near = int((mismatches <= OFF_TARGET_MISMATCHES).sum()) - 1  # itself
            c.append(near)
            if near:
                c[6] = [*c[6], f"{near} similar site(s) in this sequence"]
                c[7] -= 15 * near
    guides = [
        CrisprGuide(
            protospacer=c[0],
            pam=c[1],
            strand=c[2],
            start=c[3],
            end=c[4],
            cut_site=c[5],
            gc_percent=gc_percent(c[0]),
            flags=c[6],
            off_targets_in_sequence=c[8],
            score=round(min(100.0, max(0.0, c[7])), 1),
        )
        for c in shortlist
    ]
    guides.sort(key=lambda g: (-g.score, g.cut_site))
    return CrisprResponse(
        nuclease="SpCas9 (NGG)",
        guides=guides[:max_guides],
        total_sites=len(candidates),
        notes=[GUIDE_SCORE_NOTE, OFF_TARGET_NOTE, U6_NOTE],
    )
