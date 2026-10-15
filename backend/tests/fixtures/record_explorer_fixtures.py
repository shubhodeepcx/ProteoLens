"""Records the Central Dogma Explorer fixture from the live services. Output committed.

    cd backend && python tests/fixtures/record_explorer_fixtures.py

Provenance record for ``explorer_HBB.json``: the sickle cell scenario (HBB
codon 7, GAG to GTG). HBB is on the minus strand of chromosome 11, so it
exercises the reverse-complement arithmetic every scenario gene needs.

One file holds every raw body, keyed by the request it answers. Two trims,
nothing edited: the assembly keeps only the karyotype chromosomes (Ensembl
lists ~200 top-level regions, mostly scaffolds), and the gene lookup keeps
the canonical transcript plus one other so the canonical pick is tested.

``--fallback`` exists because Ensembl REST was returning HTTP 500 for every
endpoint on 2026-10-14. With it, the lookup and assembly bodies are read from
earlier live Ensembl responses given on the command line, the CDS comes from
NCBI's MANE Select RefSeq (NM_000518.5, which MANE pairs base for base with
ENST00000335295.4), and the coordinate map is derived from the lookup's
translation bounds. Re-run without the flag once Ensembl answers.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))
from app.services import explorer as ex

GENE, POSITION = "HBB", 7
MANE_REFSEQ = "NM_000518.5"
NCBI_CDS_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
HEADERS = {"Content-Type": "application/json", "Accept": "application/json"}


def trim_assembly(body: dict) -> dict:
    keep = set(body["karyotype"])
    return {
        "karyotype": body["karyotype"],
        "assembly_name": body.get("assembly_name"),
        "top_level_region": [r for r in body["top_level_region"] if r["name"] in keep],
    }


def trim_lookup(body: dict) -> dict:
    canonical = [t for t in body["Transcript"] if t.get("is_canonical")]
    others = [t for t in body["Transcript"] if not t.get("is_canonical") and t.get("Translation")]
    return {**body, "Transcript": others[:1] + canonical}


def derived_map(lookup: dict, position: int) -> dict:
    tl = ex.canonical_transcript(lookup)["Translation"]
    if lookup["strand"] == 1:
        start = int(tl["start"]) + (position - 1) * 3
    else:
        start = int(tl["end"]) - position * 3 + 1
    return {
        "mappings": [
            {
                "seq_region_name": lookup["seq_region_name"],
                "start": start,
                "end": start + 2,
                "strand": lookup["strand"],
                "coord_system": "chromosome",
                "assembly_name": "GRCh38",
            }
        ]
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fallback", nargs=2, metavar=("LOOKUP_JSON", "ASSEMBLY_JSON"))
    args = parser.parse_args()
    out: dict[str, object] = {}
    with httpx.Client(timeout=120, headers=HEADERS) as c:
        if args.fallback:
            lookup = json.loads(Path(args.fallback[0]).read_text())
            assembly = json.loads(Path(args.fallback[1]).read_text())
        else:
            lookup = (
                c.get(ex.LOOKUP_URL.format(symbol=GENE), params={"expand": "1"})
                .raise_for_status()
                .json()
            )
            assembly = c.get(ex.KARYOTYPE_URL, params={"bands": "1"}).raise_for_status().json()
        transcript = ex.canonical_transcript(lookup)
        if args.fallback:
            fasta = (
                c.get(
                    NCBI_CDS_URL,
                    params={
                        "db": "nuccore",
                        "id": MANE_REFSEQ,
                        "rettype": "fasta_cds_na",
                        "retmode": "text",
                    },
                )
                .raise_for_status()
                .text
            )
            seq = "".join(line.strip() for line in fasta.splitlines()[1:])
            cds = {"id": transcript["id"], "molecule": "dna", "seq": seq, "source": MANE_REFSEQ}
            codon_map = derived_map(lookup, POSITION)
        else:
            cds = (
                c.get(ex.CDS_URL.format(transcript=transcript["id"]), params={"type": "cds"})
                .raise_for_status()
                .json()
            )
            codon_map = (
                c.get(
                    ex.MAP_URL.format(
                        translation=transcript["Translation"]["id"], start=POSITION, end=POSITION
                    )
                )
                .raise_for_status()
                .json()
            )
        uniprot = (
            c.get(
                ex.UNIPROT_SEARCH_URL,
                params={
                    "query": f"gene_exact:{GENE} AND organism_id:9606 AND reviewed:true",
                    "fields": "accession,sequence",
                    "size": "1",
                },
            )
            .raise_for_status()
            .json()
        )
    out = {
        "lookup": trim_lookup(lookup),
        "assembly": trim_assembly(assembly),
        "cds": cds,
        "map": codon_map,
        "uniprot": uniprot,
    }
    (HERE / "explorer_HBB.json").write_text(json.dumps(out, indent=1) + "\n")
    print("wrote explorer_HBB.json")


if __name__ == "__main__":
    main()
