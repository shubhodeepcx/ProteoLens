"""SMILES for a chemical component code, from the RCSB chemical component dictionary."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.services.cache import TTLCache
from app.services.external import new_client

logger = logging.getLogger(__name__)

RCSB_CHEMCOMP_URL = "https://data.rcsb.org/rest/v1/core/chemcomp/{code}"
_CODE = re.compile(r"^[A-Z0-9]{1,5}$")


def smiles_from(body: dict[str, Any]) -> str | None:
    """The stereo SMILES (CACTVS, then OpenEye), else the plain one."""
    descriptor = body.get("rcsb_chem_comp_descriptor") or {}
    for field in ("SMILES_stereo", "SMILES"):
        value = descriptor.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


class ChemCompClient:
    def __init__(self, cache: TTLCache[str] | None = None) -> None:
        self._cache: TTLCache[str] = cache if cache is not None else TTLCache(maxsize=512)

    async def smiles(self, code: str) -> str | None:
        """None when the code is unknown or the RCSB cannot be reached; never raises."""
        code = code.strip().upper()
        if not _CODE.match(code):
            return None
        hit = self._cache.get(code)
        if hit is not None:
            return hit or None
        async with new_client(headers={"Accept": "application/json"}) as c:
            try:
                response = await c.get(RCSB_CHEMCOMP_URL.format(code=code))
            except httpx.HTTPError as exc:
                logger.warning("RCSB chemcomp %s failed: %s", code, exc)
                return None
        if response.status_code == 404:
            self._cache.put(code, "")
            return None
        if response.status_code >= 400:
            logger.warning("RCSB chemcomp %s returned HTTP %s", code, response.status_code)
            return None
        try:
            body = response.json()
        except ValueError:
            return None
        smiles = smiles_from(body) if isinstance(body, dict) else None
        self._cache.put(code, smiles or "")
        return smiles


_CLIENT = ChemCompClient()


def get_chemcomp_client() -> ChemCompClient:
    return _CLIENT
