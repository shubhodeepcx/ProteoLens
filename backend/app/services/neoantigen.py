"""Neoantigen candidates for one missense change.

Every mutant 8-11mer that contains the changed residue is scored for HLA class I
presentation by NetMHCpan 4.1 (eluted-ligand model) through IEDB's Analysis
Resource API, alongside the same window of the reference protein, so each
candidate carries its wild-type comparison.

The API answers one form POST with a tab-separated table. It is slow (about a
minute for eight alleles and four lengths), so answers are cached.

## What is checked

* **The reference residue.** The change must name the residue UniProt has at
  that position, or the request is refused. A wrong residue would score
  peptides from a protein that does not exist.
* **The peptide pairing.** Mutant and wild-type windows are cut at the same
  start, so `wild_type` is the exact reference peptide a T cell would have
  been tolerised to.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

import httpx

from app.models.neoantigen import NeoantigenCandidate
from app.services.cache import TTLCache
from app.services.external import SourceUnavailableError, new_client

IEDB_MHCI_URL = "https://tools-cluster-interface.iedb.org/tools_api/mhci/"
IEDB_METHOD = "netmhcpan_el"
IEDB_TIMEOUT_SECONDS = 300.0

COMMON_ALLELES = (
    "HLA-A*01:01",
    "HLA-A*02:01",
    "HLA-A*03:01",
    "HLA-A*11:01",
    "HLA-A*24:02",
    "HLA-B*07:02",
    "HLA-B*08:01",
    "HLA-B*44:02",
)
DEFAULT_ALLELES = ("HLA-A*02:01", "HLA-A*03:01", "HLA-A*11:01", "HLA-A*24:02")
ALLOWED_LENGTHS = (8, 9, 10, 11)
MAX_ALLELES = 8
STRONG_RANK = 0.5
WEAK_RANK = 2.0
MAX_CANDIDATES = 60

ONE_TO_THREE = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys", "Q": "Gln",
    "E": "Glu", "G": "Gly", "H": "His", "I": "Ile", "L": "Leu", "K": "Lys",
    "M": "Met", "F": "Phe", "P": "Pro", "S": "Ser", "T": "Thr", "W": "Trp",
    "Y": "Tyr", "V": "Val",
}  # fmt: skip
THREE_TO_ONE = {v.upper(): k for k, v in ONE_TO_THREE.items()}
_CHANGE = re.compile(r"^\s*(?:p\.)?([A-Za-z]{3}|[A-Za-z])(\d{1,5})([A-Za-z]{3}|[A-Za-z])\s*$")
_ALLELE = re.compile(r"^HLA-[ABC]\*\d{2}:\d{2,3}$")


class NeoantigenError(ValueError):
    """The request cannot be scored as asked; the message says why."""


def parse_missense(change: str) -> tuple[str, int, str]:
    """'G12C' or 'p.Gly12Cys' -> ('G', 12, 'C'). Only amino-acid substitutions."""
    m = _CHANGE.match(change or "")
    if not m:
        raise NeoantigenError(f"{change!r} is not a missense change like G12C or p.Gly12Cys.")

    def one(token: str) -> str:
        letter = THREE_TO_ONE.get(token.upper()) if len(token) == 3 else token.upper()
        if letter not in ONE_TO_THREE:
            raise NeoantigenError(f"{token!r} is not one of the 20 amino acids.")
        return letter

    ref, alt = one(m[1]), one(m[3])
    if ref == alt:
        raise NeoantigenError("A synonymous change makes no new peptide.")
    return ref, int(m[2]), alt


def check_alleles(alleles: Iterable[str]) -> list[str]:
    out = list(dict.fromkeys(a.strip() for a in alleles if a.strip()))
    if not out:
        raise NeoantigenError("Choose at least one HLA allele.")
    if len(out) > MAX_ALLELES:
        raise NeoantigenError(f"At most {MAX_ALLELES} alleles per request.")
    bad = [a for a in out if not _ALLELE.match(a)]
    if bad:
        raise NeoantigenError(f"{bad[0]!r} is not an HLA class I allele like HLA-A*02:01.")
    return out


def check_lengths(lengths: Iterable[int]) -> list[int]:
    out = sorted(set(lengths))
    if not out or any(n not in ALLOWED_LENGTHS for n in out):
        raise NeoantigenError("Peptide lengths must be between 8 and 11.")
    return out


def windows(sequence: str, position: int, ref: str, alt: str, longest: int) -> tuple[str, str, int]:
    """(mutant window, wild-type window, UniProt position of the window's first residue)."""
    if not 0 < position <= len(sequence):
        raise NeoantigenError(f"The protein has {len(sequence)} residues; there is no {position}.")
    actual = sequence[position - 1]
    if actual != ref:
        raise NeoantigenError(
            f"Residue {position} is {ONE_TO_THREE.get(actual, actual)} in UniProt, not "
            f"{ONE_TO_THREE[ref]}. Check the change and its numbering."
        )
    first = max(1, position - longest + 1)
    last = min(len(sequence), position + longest - 1)
    wt = sequence[first - 1 : last]
    k = position - first
    return wt[:k] + alt + wt[k + 1 :], wt, first


class IedbClient:
    def __init__(self, cache: TTLCache[str] | None = None) -> None:
        self._cache: TTLCache[str] = cache if cache is not None else TTLCache(maxsize=64)

    async def mhci(
        self, mutant: str, wild_type: str, alleles: list[str], lengths: list[int]
    ) -> str:
        pairs = [(a, n) for a in alleles for n in lengths]
        form = {
            "method": IEDB_METHOD,
            "sequence_text": f">mt\n{mutant}\n>wt\n{wild_type}",
            "allele": ",".join(a for a, _ in pairs),
            "length": ",".join(str(n) for _, n in pairs),
        }
        key = repr(sorted(form.items()))
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        async with new_client() as c:
            c.timeout = httpx.Timeout(IEDB_TIMEOUT_SECONDS)
            try:
                response = await c.post(IEDB_MHCI_URL, data=form)
            except httpx.HTTPError as exc:
                raise SourceUnavailableError(f"IEDB request failed: {exc}") from exc
        if response.status_code >= 400:
            raise SourceUnavailableError(f"IEDB returned HTTP {response.status_code}")
        text = response.text
        if not text.startswith("allele\t"):
            # IEDB reports a rejected form as an HTML error list with HTTP 200.
            detail = re.sub(r"<[^>]+>|\s+", " ", text).strip()[:200]
            raise SourceUnavailableError(f"IEDB refused the request: {detail}")
        self._cache.put(key, text)
        return text


_CLIENT = IedbClient()


def get_iedb_client() -> IedbClient:
    return _CLIENT


def parse_table(text: str) -> list[dict[str, str]]:
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"), strict=False)) for line in lines[1:]]


def candidates(
    rows: list[dict[str, str]],
    *,
    position: int,
    first: int,
    keys_for: dict[int, list[str]],
) -> tuple[int, list[NeoantigenCandidate]]:
    """(mutant peptides scored, binders that contain the mutated residue, best first)."""
    wild: dict[tuple[str, int, int], tuple[str, float]] = {}
    mutant: list[dict[str, str]] = []
    for r in rows:
        try:
            start, length = int(r["start"]), int(r["length"])
            rank = float(r["percentile_rank"])
        except (KeyError, ValueError):
            continue
        if r.get("seq_num") == "2":
            wild[(r["allele"], start, length)] = (r["peptide"], rank)
        elif r.get("seq_num") == "1":
            mutant.append(r)

    scored = 0
    out: list[NeoantigenCandidate] = []
    k = position - first + 1  # 1-based index of the change in the window
    for r in mutant:
        start, length = int(r["start"]), int(r["length"])
        if not start <= k < start + length:
            continue  # this peptide does not contain the change, so it is not new
        scored += 1
        rank = float(r["percentile_rank"])
        if rank >= WEAK_RANK:
            continue
        wt = wild.get((r["allele"], start, length))
        offset = k - start + 1
        begin = first + start - 1
        out.append(
            NeoantigenCandidate(
                peptide=r["peptide"],
                wild_type=wt[0] if wt else "",
                allele=r["allele"],
                length=length,
                start=begin,
                mutant_offset=offset,
                mutant_rank=rank,
                wild_type_rank=wt[1] if wt else None,
                mutant_score=float(r.get("score") or 0),
                binding="strong" if rank < STRONG_RANK else "weak",
                fold_change=round(wt[1] / rank, 2) if wt and rank > 0 else None,
                anchor=offset in (2, length),
                residue_keys=[
                    key for p in range(begin, begin + length) for key in keys_for.get(p, [])
                ],
            )
        )
    out.sort(key=lambda c: (c.mutant_rank, -(c.fold_change or 0), c.allele, c.length))
    return scored, out[:MAX_CANDIDATES]
