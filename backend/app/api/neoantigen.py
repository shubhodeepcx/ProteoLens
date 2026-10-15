"""Neoantigen route: HLA class I candidates for one missense change."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from app.api.clinical import stored_protein
from app.models.neoantigen import NeoantigenReport
from app.services import annotations, functional, neoantigen, oncology
from app.services.external import SourceNotFoundError, SourceUnavailableError
from app.services.oncology_sources import get_oncology_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/proteins", tags=["clinical"])


@router.get("/{uid}/neoantigens", response_model=NeoantigenReport)
async def get_neoantigens(
    uid: str,
    change: str = Query(..., max_length=20, description="Missense change, e.g. G12C."),
    alleles: str = Query(
        ",".join(neoantigen.DEFAULT_ALLELES),
        max_length=200,
        description="Comma-separated HLA-I alleles.",
    ),
    lengths: str = Query(
        "8,9,10,11", max_length=20, description="Comma-separated peptide lengths."
    ),
) -> NeoantigenReport:
    """Mutant 8-11mers containing the change, scored by NetMHCpan 4.1 through IEDB.

    400 for a change that does not fit the protein or a malformed allele, 502
    when UniProt or IEDB cannot be reached. IEDB takes about a minute for
    eight alleles; answers are cached.
    """
    from app.api.search import get_rcsb_client, get_uniprot_client

    try:
        ref, position, alt = neoantigen.parse_missense(change)
        hla = neoantigen.check_alleles(alleles.split(","))
        sizes = neoantigen.check_lengths(int(n) for n in lengths.split(",") if n.strip().isdigit())
    except neoantigen.NeoantigenError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    summary, file_path = stored_protein(uid)
    accession, note = await annotations.resolve_accession(
        summary, uniprot=get_uniprot_client(), rcsb=get_rcsb_client()
    )
    if accession is None:
        return NeoantigenReport(protein_id=uid, resolution_note=note)
    base = accession.split("-", 1)[0]
    try:
        entry = await get_oncology_client().uniprot_gene(base)
    except SourceNotFoundError:
        return NeoantigenReport(
            protein_id=uid, accession=accession, resolution_note=f"UniProt has no entry for {base}."
        )
    except Exception as exc:
        logger.warning("UniProt lookup failed for %s: %s", base, exc)
        raise HTTPException(
            status_code=502, detail="Could not reach UniProt for this protein's sequence."
        ) from exc
    gene, _, sequence = oncology.gene_and_entrez(entry)

    try:
        mutant, wild_type, first = neoantigen.windows(sequence, position, ref, alt, max(sizes))
        table = await neoantigen.get_iedb_client().mhci(mutant, wild_type, hla, sizes)
    except neoantigen.NeoantigenError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SourceUnavailableError as exc:
        logger.warning("IEDB failed for %s %s: %s", base, change, exc)
        raise HTTPException(
            status_code=502, detail="IEDB's prediction service did not answer. Try again."
        ) from exc

    def build() -> NeoantigenReport:
        from app.api.proteins import parse_structure_for_analytics

        notes: list[str] = []
        keys_for: dict[int, list[str]] = {}
        try:
            chains = functional.read_chain_residues(
                parse_structure_for_analytics(file_path), summary
            )
            mapped = functional.map_uniprot_positions(sequence, chains).positions
            keys_for = {p: [r.key for r in refs] for p, refs in mapped.items()}
        except functional.ChainReadError as exc:
            notes.append(f"Peptides could not be placed on this structure: {exc}")
        scored, found = neoantigen.candidates(
            neoantigen.parse_table(table), position=position, first=first, keys_for=keys_for
        )
        if not keys_for.get(position):
            notes.append(f"Residue {position} is not resolved in this structure.")
        return NeoantigenReport(
            protein_id=uid,
            accession=accession,
            gene=gene,
            change=f"{ref}{position}{alt}",
            alleles=hla,
            lengths=sizes,
            peptides_scored=scored,
            candidates=found,
            variant_keys=keys_for.get(position, []),
            resolution_note=note,
            notes=notes,
        )

    return await run_in_threadpool(build)
