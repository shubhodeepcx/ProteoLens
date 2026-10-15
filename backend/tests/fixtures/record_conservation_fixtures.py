"""Records the conservation fixture from the live service. Output committed.

    cd backend && python tests/fixtures/record_conservation_fixtures.py

Provenance record for ``pdbe_conservation_P01116.json``: PDBe-KB's per-residue
amino-acid profile for KRAS, unedited. KRAS is the case with a textbook
answer: the P-loop (G10, G15, K16, S17), the DxxG motif (57-60) and the NKxD
motif (116-119) are the conserved GTPase signatures. The UniProt entry the
tests check it against is the one in ``neoantigen_P01116_G12C.json``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))
from app.services import conservation

ACCESSION = "P01116"


def main() -> None:
    with httpx.Client(timeout=120, headers={"Accept": "application/json"}) as c:
        body = (
            c.get(conservation.PDBE_CONSERVATION_URL.format(accession=ACCESSION))
            .raise_for_status()
            .json()
        )
    (HERE / f"pdbe_conservation_{ACCESSION}.json").write_text(json.dumps(body) + "\n")
    print(f"wrote pdbe_conservation_{ACCESSION}.json")


if __name__ == "__main__":
    main()
