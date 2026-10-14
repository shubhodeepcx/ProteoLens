"""P19 -- fold a protein sequence with ESMFold through the ESM Atlas API.

ProteoLens does not host a folding model. ESMFold (Lin et al., Science 2023)
predicts a structure from a single sequence with no multiple-sequence
alignment, which is what makes it fast enough to answer while the user waits.
Meta's ESM Atlas serves it at one endpoint: POST the bare sequence, get a PDB
file back.

Two things the API does that the rest of ProteoLens does not expect, and that
this module corrects before the file is stored:

* The B-factor column holds pLDDT as a 0-1 fraction. AlphaFold files, and every
  colour scale and band in this codebase, use 0-100. A fraction is rescaled;
  a file already on 0-100 is left alone.
* There is no HEADER or TITLE, so the parser would name the model `None`. A
  HEADER/TITLE pair is prepended that says what produced it.
"""

from __future__ import annotations

import logging
import re

import httpx

from app.services.external import SourceUnavailableError, new_client

logger = logging.getLogger(__name__)

API_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"

# ESM Atlas refuses longer sequences; checking first gives a clear 422 instead
# of an opaque upstream error.
MIN_LENGTH = 10
MAX_LENGTH = 400

# Folding is the upstream doing real work, not a lookup: a 400-residue chain
# can take tens of seconds. The project's 10 s default would cut it off.
FOLD_TIMEOUT_SECONDS = 120.0

AMINO_ACIDS = frozenset("ACDEFGHIKLMNPQRSTVWY")

_WHITESPACE_RE = re.compile(r"\s+")


class InvalidSequenceError(ValueError):
    """The input is not a foldable protein sequence; the message says why."""


def clean_sequence(raw: str) -> str:
    """Accept plain text or FASTA; return upper-case one-letter residues.

    Raises `InvalidSequenceError` naming the first problem: empty input, a
    character that is not one of the 20 standard amino acids (with a hint when
    it looks like DNA), or a length ESM Atlas will not fold.
    """
    lines = [ln for ln in raw.strip().splitlines() if not ln.lstrip().startswith(">")]
    seq = _WHITESPACE_RE.sub("", "".join(lines)).upper().rstrip("*")
    if not seq:
        raise InvalidSequenceError("Paste a protein sequence (one-letter codes, plain or FASTA).")

    # A, C, G and T are also amino-acid letters, so a nucleotide string passes
    # the alphabet check below; no real protein is made of only these four.
    if set(seq) <= set("ACGTUN"):
        raise InvalidSequenceError(
            "This looks like DNA or RNA. Translate it first (the DNA tools ORF tab "
            "shows the protein), then paste the protein sequence here."
        )
    bad = sorted({c for c in seq if c not in AMINO_ACIDS})
    if bad:
        shown = ", ".join(repr(c) for c in bad[:5])
        raise InvalidSequenceError(
            f"Only the 20 standard amino-acid letters can be folded; found {shown}."
        )

    if len(seq) < MIN_LENGTH:
        raise InvalidSequenceError(
            f"The sequence has {len(seq)} residues; ESMFold needs at least {MIN_LENGTH}."
        )
    if len(seq) > MAX_LENGTH:
        raise InvalidSequenceError(
            f"The sequence has {len(seq)} residues; the ESM Atlas service folds at most "
            f"{MAX_LENGTH}. Fold one domain at a time."
        )
    return seq


def _bfactor(line: str) -> float | None:
    try:
        return float(line[60:66])
    except ValueError:
        return None


def normalise_pdb(pdb_text: str, *, name: str) -> str:
    """Rescale a 0-1 pLDDT column to 0-100 and prepend HEADER/TITLE records.

    Only ATOM/HETATM lines are touched, and only columns 61-66, so coordinates
    and everything else round-trip byte for byte.
    """
    lines = pdb_text.splitlines()
    atoms = [ln for ln in lines if ln.startswith(("ATOM", "HETATM"))]
    if not atoms:
        raise SourceUnavailableError("ESMFold returned a file with no atoms.")

    values = [v for v in (_bfactor(ln) for ln in atoms) if v is not None]
    fractional = bool(values) and max(values) <= 1.0

    out: list[str] = [
        "HEADER    PREDICTED STRUCTURE (ESMFOLD)",
        f"TITLE     {name[:60].upper()}",
    ]
    for ln in lines:
        if ln.startswith(("HEADER", "TITLE")):
            continue
        if fractional and ln.startswith(("ATOM", "HETATM")):
            value = _bfactor(ln)
            if value is not None:
                ln = f"{ln[:60].ljust(60)}{value * 100:6.2f}{ln[66:]}"
        out.append(ln)
    return "\n".join(out) + "\n"


async def fold(sequence: str, *, client: httpx.AsyncClient | None = None) -> str:
    """POST `sequence` to ESM Atlas and return the raw PDB text.

    Any transport failure, non-200 status or a body that is not a PDB file is a
    `SourceUnavailableError`, which the router turns into a 502.
    """
    owns = client is None
    http = client or new_client(timeout=FOLD_TIMEOUT_SECONDS)
    try:
        response = await http.post(
            API_URL, content=sequence.encode(), headers={"Content-Type": "text/plain"}
        )
    except httpx.HTTPError as exc:
        logger.warning("ESMFold request failed: %r", exc)
        raise SourceUnavailableError("Could not reach the ESMFold service.") from exc
    finally:
        if owns:
            await http.aclose()

    if response.status_code != 200:
        logger.warning("ESMFold returned %s: %s", response.status_code, response.text[:200])
        raise SourceUnavailableError(
            f"The ESMFold service answered with HTTP {response.status_code}."
        )
    text = response.text
    if "ATOM" not in text:
        raise SourceUnavailableError("The ESMFold service did not return a structure.")
    return text
