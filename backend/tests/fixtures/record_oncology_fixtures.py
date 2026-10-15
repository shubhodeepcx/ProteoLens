"""Records the oncology fixtures from the live services. Output committed.

    cd backend && python tests/fixtures/record_oncology_fixtures.py

Provenance record for ``oncology_P01116.json`` (KRAS) and ``6OIM.pdb`` (KRAS
G12C bound to sotorasib). KRAS is the case every source has something to say
about: G12/G13/Q61 hotspots, the most-mutated oncogene in TCGA pancreatic and
colorectal studies, an approved mutant-specific drug, and ~200 CIViC items.

One file holds every raw body, keyed by the request it answers, so the tests
can mock each URL with exactly what that URL returned. Two trims, nothing
edited: cBioPortal mutations keep only the keys ``services/oncology.py`` reads
(the full records are ~20 fields each), and Reactome pathways keep id, name
and the disease flag.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

HERE = Path(__file__).parent
ACCESSION, GENE, ENTREZ = "P01116", "KRAS", 3845
MUTATION_KEYS = ("studyId", "sampleId", "proteinChange", "mutationType", "proteinPosStart")

import sys

sys.path.insert(0, str(HERE.parents[1]))
from app.services import oncology_sources as src


def main() -> None:
    out: dict[str, object] = {}
    with httpx.Client(timeout=120, headers={"Accept": "application/json"}) as c:
        out["uniprot"] = c.get(
            src.UNIPROT_URL.format(accession=ACCESSION),
            params={"fields": "gene_primary,sequence,xref_geneid"},
        ).raise_for_status().json()
        out["hotspots"] = c.get(src.HOTSPOTS_URL.format(gene=GENE)).raise_for_status().json()
        studies = c.get(
            src.CBIO_STUDIES_URL,
            params={"keyword": "tcga_pan_can_atlas_2018", "projection": "SUMMARY", "pageSize": "100"},
        ).raise_for_status().json()
        out["cbio_studies"] = [
            {k: s[k] for k in ("studyId", "name", "cancerTypeId", "allSampleCount")} for s in studies
        ]
        pancan = [s for s in studies if s["studyId"].endswith(src.PANCAN_SUFFIX)]
        mutations = c.post(
            src.CBIO_MUTATIONS_URL,
            params={"projection": "SUMMARY", "pageSize": "100000"},
            json={
                "entrezGeneIds": [ENTREZ],
                "molecularProfileIds": [f"{s['studyId']}_mutations" for s in pancan],
            },
        ).raise_for_status().json()
        out["cbio_mutations"] = [{k: m.get(k) for k in MUTATION_KEYS} for m in mutations]
        targets = c.get(
            src.CHEMBL_TARGETS_URL,
            params={
                "target_components__accession": ACCESSION,
                "only": "target_chembl_id,target_type,pref_name",
                "limit": "50",
            },
        ).raise_for_status().json()
        out["chembl_targets"] = targets
        mechanisms = {}
        for t in targets["targets"]:
            if t["target_type"] == "SINGLE PROTEIN":
                tid = t["target_chembl_id"]
                mechanisms[tid] = c.get(
                    src.CHEMBL_MECHANISMS_URL, params={"target_chembl_id": tid, "limit": "1000"}
                ).raise_for_status().json()
        out["chembl_mechanisms"] = mechanisms
        ids = list(
            dict.fromkeys(m["molecule_chembl_id"] for b in mechanisms.values() for m in b["mechanisms"])
        )
        out["chembl_molecules"] = c.get(
            src.CHEMBL_MOLECULES_URL.format(ids=";".join(ids)),
            params={
                "only": "molecule_chembl_id,pref_name,max_phase,first_approval,molecule_type",
                "limit": str(src.MAX_MECHANISM_MOLECULES),
            },
        ).raise_for_status().json()
        pages, after = [], None
        for _ in range(src.CIVIC_MAX_PAGES):
            body = c.post(
                src.CIVIC_URL,
                json={"query": src.CIVIC_QUERY, "variables": {"name": GENE, "after": after}},
            ).raise_for_status().json()
            pages.append(body)
            info = body["data"]["evidenceItems"]["pageInfo"]
            if not info["hasNextPage"]:
                break
            after = info["endCursor"]
        out["civic_pages"] = pages
        reactome = c.get(
            src.REACTOME_URL.format(accession=ACCESSION), params={"species": "9606"}
        ).raise_for_status().json()
        out["reactome"] = [
            {k: p[k] for k in ("stId", "displayName", "isInDisease") if k in p} for p in reactome
        ]
        out["string"] = c.get(
            src.STRING_URL,
            params={"identifiers": GENE, "species": "9606", "limit": str(src.STRING_PARTNERS)},
        ).raise_for_status().json()
        (HERE / "6OIM.pdb").write_text(
            c.get("https://files.rcsb.org/download/6OIM.pdb").raise_for_status().text
        )
    (HERE / f"oncology_{ACCESSION}.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    main()
