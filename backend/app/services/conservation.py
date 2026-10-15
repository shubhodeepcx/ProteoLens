"""Per-residue conservation from PDBe-KB, painted onto the structure.

PDBe-KB publishes, for every UniProt entry with a structure, an amino-acid
probability profile per position built from homologous sequences
(`/pdbe/graph-api/uniprot/sequence_conservation/{accession}`). Conservation is
read from that profile as information content: log2(20) minus the Shannon
entropy of the position's distribution, so 0 bits means any residue will do
and 4.32 bits means one residue in every homologue.

## What is checked

* **The sequence.** The payload's `seq_id` is the MD5 of the UniProt sequence
  it was computed on. If it does not match the current UniProt sequence the
  profile is for another sequence version and is refused, because every
  position after an indel would be shifted.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any
from urllib.parse import quote

import httpx

from app.models.conservation import ConservationProfile, ResidueConservation
from app.services.cache import TTLCache
from app.services.external import SourceNotFoundError, SourceUnavailableError, new_client

PDBE_CONSERVATION_URL = (
    "https://www.ebi.ac.uk/pdbe/graph-api/uniprot/sequence_conservation/{accession}"
)
AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY"
MAX_BITS = math.log2(20)
MOST_CONSERVED = 20


class ConservationError(ValueError):
    """The profile cannot be used for this sequence; the message says why."""


class ConservationClient:
    def __init__(self, cache: TTLCache[Any] | None = None) -> None:
        self._cache: TTLCache[Any] = cache if cache is not None else TTLCache(maxsize=128)

    async def profile(self, accession: str) -> dict[str, Any]:
        hit = self._cache.get(accession)
        if hit is not None:
            return hit
        url = PDBE_CONSERVATION_URL.format(accession=quote(accession, safe=""))
        async with new_client(headers={"Accept": "application/json"}) as c:
            try:
                response = await c.get(url)
            except httpx.HTTPError as exc:
                raise SourceUnavailableError(f"PDBe conservation request failed: {exc}") from exc
        if response.status_code == 404:
            raise SourceNotFoundError(f"PDBe has no conservation profile for {accession}")
        if response.status_code >= 400:
            raise SourceUnavailableError(f"PDBe conservation returned HTTP {response.status_code}")
        try:
            body = response.json()
        except ValueError as exc:
            raise SourceUnavailableError("PDBe conservation returned a non-JSON body") from exc
        if not isinstance(body, dict) or not isinstance(body.get("data"), dict):
            raise SourceNotFoundError(f"PDBe has no conservation profile for {accession}")
        self._cache.put(accession, body)
        return body


_CLIENT = ConservationClient()


def get_conservation_client() -> ConservationClient:
    return _CLIENT


def information_content(probabilities: list[float]) -> float:
    """log2(20) minus the Shannon entropy, after renormalising the profile."""
    total = sum(p for p in probabilities if p > 0)
    if total <= 0:
        return 0.0
    entropy = -sum(p / total * math.log2(p / total) for p in probabilities if p > 0)
    return max(0.0, MAX_BITS - entropy)


def build_profile(
    uid: str,
    *,
    accession: str,
    resolution_note: str,
    body: dict[str, Any],
    sequence: str,
    keys_for: dict[int, list[str]],
    notes: list[str] | None = None,
) -> ConservationProfile:
    seq_id = body.get("seq_id")
    if seq_id and sequence and seq_id != hashlib.md5(sequence.encode()).hexdigest():
        raise ConservationError(
            f"PDBe's conservation profile for {accession} was computed on a different "
            "sequence version than UniProt's current one, so its positions cannot be trusted."
        )
    data = body["data"]
    index = data.get("index") or []
    columns = [data.get(f"probability_{a}") or [] for a in AMINO_ACIDS]
    residues: list[ResidueConservation] = []
    for i, position in enumerate(index):
        if not isinstance(position, int) or not 0 < position <= len(sequence):
            continue
        probs = [float(col[i]) if i < len(col) and col[i] is not None else 0.0 for col in columns]
        best = max(range(len(AMINO_ACIDS)), key=lambda k: probs[k])
        total = sum(probs) or 1.0
        residues.append(
            ResidueConservation(
                position=position,
                residue=sequence[position - 1],
                information=round(information_content(probs), 3),
                dominant=AMINO_ACIDS[best],
                dominant_probability=round(probs[best] / total, 3),
                keys=keys_for.get(position, []),
            )
        )
    ranked = sorted(residues, key=lambda r: (-r.information, r.position))
    return ConservationProfile(
        protein_id=uid,
        accession=accession,
        accession_resolved=True,
        resolution_note=resolution_note,
        sequence_length=len(sequence),
        residues=residues,
        most_conserved=[r.position for r in ranked[:MOST_CONSERVED]],
        mean_information=round(sum(r.information for r in residues) / len(residues), 3)
        if residues
        else None,
        placed=sum(1 for r in residues if r.keys),
        notes=list(notes or []),
    )
