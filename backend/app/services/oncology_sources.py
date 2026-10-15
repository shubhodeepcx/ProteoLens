"""HTTP clients for the oncology layer. Raw JSON out; projection lives in
`services/oncology.py` so it stays a pure function over recorded payloads.

| Source | What it answers | Call |
|---|---|---|
| UniProt | gene symbol, Entrez id, reference sequence | GET, 1 |
| cancerhotspots.org | recurrent tumour mutation sites (Chang et al. 2016/2018) | GET, 1 |
| cBioPortal | somatic mutations across the 32 TCGA PanCancer Atlas studies | GET + POST, 2 |
| ChEMBL | drugs with a mechanism of action on this protein | GET, 3 |
| CIViC | accepted clinical evidence (sensitivity, resistance, prognosis) | GraphQL, <=3 |
| Reactome | pathways the protein takes part in | GET, 1 |
| STRING | highest-confidence interaction partners | GET, 1 |

Every method raises `SourceNotFoundError` or `SourceUnavailableError`, and the
route treats each source independently: one being down never hides another.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import quote

import httpx

from app.services.cache import TTLCache
from app.services.external import (
    Metadata,
    SourceNotFoundError,
    SourceUnavailableError,
    new_client,
)

UNIPROT_URL = "https://rest.uniprot.org/uniprotkb/{accession}.json"
HOTSPOTS_URL = "https://www.cancerhotspots.org/api/hotspots/single/byGene/{gene}"
CBIO_STUDIES_URL = "https://www.cbioportal.org/api/studies"
CBIO_MUTATIONS_URL = "https://www.cbioportal.org/api/mutations/fetch"
CHEMBL_TARGETS_URL = "https://www.ebi.ac.uk/chembl/api/data/target.json"
CHEMBL_MECHANISMS_URL = "https://www.ebi.ac.uk/chembl/api/data/mechanism.json"
CHEMBL_MOLECULES_URL = "https://www.ebi.ac.uk/chembl/api/data/molecule/set/{ids}.json"
CIVIC_URL = "https://civicdb.org/api/graphql"
REACTOME_URL = "https://reactome.org/ContentService/data/mapping/UniProt/{accession}/pathways"
STRING_URL = "https://string-db.org/api/json/interaction_partners"

PANCAN_SUFFIX = "_tcga_pan_can_atlas_2018"
CIVIC_PAGE = 100
CIVIC_MAX_PAGES = 3
STRING_PARTNERS = 10
MAX_MECHANISM_MOLECULES = 60

_GENE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,19}$")

CIVIC_QUERY = (
    """
query($name: String!, $after: String) {
  evidenceItems(molecularProfileName: $name, status: ACCEPTED, first: PAGE, after: $after) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes {
      id evidenceType evidenceDirection significance evidenceLevel evidenceRating
      molecularProfile { name }
      therapies { name }
      disease { name }
    }
  }
}
"""
).replace("PAGE", str(CIVIC_PAGE))


def check_gene(gene: str) -> str:
    """Gene symbols are interpolated into URL paths and queries; check the shape."""
    symbol = gene.strip()
    if not _GENE_RE.match(symbol):
        raise SourceNotFoundError(f"{gene!r} is not a gene symbol")
    return symbol


class OncologyClient:
    """One client for the seven oncology sources, each cached by its key."""

    def __init__(self, cache: TTLCache[Any] | None = None) -> None:
        self._cache: TTLCache[Any] = cache if cache is not None else TTLCache(maxsize=128)

    async def _cached(self, key: str, fetch: Callable[[], Awaitable[Any]]) -> Any:
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        value = await fetch()
        self._cache.put(key, value)
        return value

    async def uniprot_gene(self, accession: str) -> Metadata:
        async def fetch() -> Metadata:
            return await _request(
                "GET",
                UNIPROT_URL.format(accession=quote(accession, safe="")),
                label=f"UniProt {accession}",
                params={"fields": "gene_primary,sequence,xref_geneid"},
            )

        return await self._cached(f"uniprot:{accession}", fetch)

    async def hotspots(self, gene: str) -> list[Metadata]:
        symbol = check_gene(gene)

        async def fetch() -> list[Metadata]:
            return await _request(
                "GET", HOTSPOTS_URL.format(gene=quote(symbol, safe="")), label="cancerhotspots.org"
            )

        return await self._cached(f"hotspots:{symbol}", fetch)

    async def tcga_mutations(self, entrez_id: int) -> tuple[list[Metadata], list[Metadata]]:
        """(PanCancer Atlas studies, this gene's mutations across all of them)."""

        async def studies() -> list[Metadata]:
            body = await _request(
                "GET",
                CBIO_STUDIES_URL,
                label="cBioPortal studies",
                params={"keyword": PANCAN_SUFFIX.strip("_"), "projection": "SUMMARY", "pageSize": "100"},
            )
            return [s for s in body if str(s.get("studyId", "")).endswith(PANCAN_SUFFIX)]

        study_list = await self._cached("cbio:studies", studies)

        async def mutations() -> list[Metadata]:
            return await _request(
                "POST",
                CBIO_MUTATIONS_URL,
                label="cBioPortal mutations",
                params={"projection": "SUMMARY", "pageSize": "100000"},
                json={
                    "entrezGeneIds": [entrez_id],
                    "molecularProfileIds": [f"{s['studyId']}_mutations" for s in study_list],
                },
            )

        return study_list, await self._cached(f"cbio:{entrez_id}", mutations)

    async def chembl_drugs(self, accession: str) -> tuple[list[Metadata], list[Metadata]]:
        """(mechanisms on this protein's single-protein targets, their molecules)."""

        async def fetch() -> tuple[list[Metadata], list[Metadata]]:
            targets = await _request(
                "GET",
                CHEMBL_TARGETS_URL,
                label="ChEMBL targets",
                params={
                    "target_components__accession": accession,
                    "only": "target_chembl_id,target_type,pref_name",
                    "limit": "50",
                },
            )
            target_ids = [
                t["target_chembl_id"]
                for t in targets.get("targets", [])
                if t.get("target_type") == "SINGLE PROTEIN"
            ]
            mechanisms: list[Metadata] = []
            for target_id in target_ids:
                body = await _request(
                    "GET",
                    CHEMBL_MECHANISMS_URL,
                    label="ChEMBL mechanisms",
                    params={"target_chembl_id": target_id, "limit": "1000"},
                )
                mechanisms.extend(body.get("mechanisms", []))
            ids = list(dict.fromkeys(m["molecule_chembl_id"] for m in mechanisms))
            ids = ids[:MAX_MECHANISM_MOLECULES]
            molecules: list[Metadata] = []
            if ids:
                body = await _request(
                    "GET",
                    CHEMBL_MOLECULES_URL.format(ids=";".join(ids)),
                    label="ChEMBL molecules",
                    params={
                        "only": "molecule_chembl_id,pref_name,max_phase,first_approval,molecule_type",
                        "limit": str(MAX_MECHANISM_MOLECULES),
                    },
                )
                molecules = body.get("molecules", [])
            return mechanisms, molecules

        return await self._cached(f"chembl:{accession}", fetch)

    async def civic_evidence(self, gene: str) -> tuple[int, list[Metadata]]:
        symbol = check_gene(gene)

        async def fetch() -> tuple[int, list[Metadata]]:
            nodes: list[Metadata] = []
            total, after = 0, None
            for _ in range(CIVIC_MAX_PAGES):
                body = await _request(
                    "POST",
                    CIVIC_URL,
                    label="CIViC",
                    json={"query": CIVIC_QUERY, "variables": {"name": symbol, "after": after}},
                )
                if body.get("errors"):
                    raise SourceUnavailableError(f"CIViC query failed: {body['errors'][0]}")
                page = body["data"]["evidenceItems"]
                total = int(page.get("totalCount") or 0)
                nodes.extend(page.get("nodes") or [])
                if not page["pageInfo"]["hasNextPage"]:
                    break
                after = page["pageInfo"]["endCursor"]
            return total, nodes

        return await self._cached(f"civic:{symbol}", fetch)

    async def reactome(self, accession: str) -> list[Metadata]:
        async def fetch() -> list[Metadata]:
            return await _request(
                "GET",
                REACTOME_URL.format(accession=quote(accession, safe="")),
                label="Reactome",
                params={"species": "9606"},
            )

        return await self._cached(f"reactome:{accession}", fetch)

    async def string_partners(self, gene: str) -> list[Metadata]:
        symbol = check_gene(gene)

        async def fetch() -> list[Metadata]:
            return await _request(
                "GET",
                STRING_URL,
                label="STRING",
                params={"identifiers": symbol, "species": "9606", "limit": str(STRING_PARTNERS)},
            )

        return await self._cached(f"string:{symbol}", fetch)


async def _request(
    method: str,
    url: str,
    *,
    label: str,
    params: dict[str, str] | None = None,
    json: object | None = None,
) -> Any:
    async with new_client(headers={"Accept": "application/json"}) as client:
        try:
            response = await client.request(method, url, params=params, json=json)
        except httpx.HTTPError as exc:
            raise SourceUnavailableError(f"{label} request failed: {exc}") from exc
    if response.status_code in (400, 404):
        raise SourceNotFoundError(f"{label}: HTTP {response.status_code}")
    if response.status_code >= 400:
        raise SourceUnavailableError(f"{label} returned HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise SourceUnavailableError(f"{label} returned a non-JSON body") from exc


_CLIENT = OncologyClient()


def get_oncology_client() -> OncologyClient:
    """Read through, so tests can swap it."""
    return _CLIENT
