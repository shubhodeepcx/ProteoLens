"""Records the neoantigen fixture from the live services. Output committed.

    cd backend && python tests/fixtures/record_neoantigen_fixtures.py

Provenance record for ``neoantigen_P01116_G12C.json``: KRAS G12C scored by
NetMHCpan 4.1 EL through IEDB for the four default alleles and lengths 8-11.
KRAS G12C is the case with a known answer: VVGACGVGK on HLA-A*11:01 and
HLA-A*03:01 is a published, T-cell-validated neoantigen.

The file holds the UniProt entry (gene, sequence), the exact form posted to
IEDB, and IEDB's tab-separated answer, unedited.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))
from app.services import neoantigen as neo
from app.services import oncology, oncology_sources

ACCESSION, CHANGE = "P01116", "G12C"


def main() -> None:
    with httpx.Client(
        timeout=neo.IEDB_TIMEOUT_SECONDS, headers={"Accept": "application/json"}
    ) as c:
        entry = (
            c.get(
                oncology_sources.UNIPROT_URL.format(accession=ACCESSION),
                params={"fields": "gene_primary,sequence,xref_geneid"},
            )
            .raise_for_status()
            .json()
        )
        _, _, sequence = oncology.gene_and_entrez(entry)
        ref, position, alt = neo.parse_missense(CHANGE)
        lengths = list(neo.ALLOWED_LENGTHS)
        mutant, wild_type, _ = neo.windows(sequence, position, ref, alt, max(lengths))
        pairs = [(a, n) for a in neo.DEFAULT_ALLELES for n in lengths]
        form = {
            "method": neo.IEDB_METHOD,
            "sequence_text": f">mt\n{mutant}\n>wt\n{wild_type}",
            "allele": ",".join(a for a, _ in pairs),
            "length": ",".join(str(n) for _, n in pairs),
        }
        # IEDB answers text/plain and refuses (406) a JSON-only Accept header.
        table = (
            c.post(neo.IEDB_MHCI_URL, data=form, headers={"Accept": "*/*"}).raise_for_status().text
        )
    out = {"uniprot": entry, "iedb_form": form, "iedb": table}
    (HERE / f"neoantigen_{ACCESSION}_{CHANGE}.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote neoantigen_{ACCESSION}_{CHANGE}.json")


if __name__ == "__main__":
    main()
