"""Records the clinical-evidence fixtures from the live services. Output committed.

    cd backend && python tests/fixtures/record_clinical_fixtures.py

Same provenance rule as ``record_functional_fixtures.py``: these are recordings,
not hand-written payloads, and this script is the record of how they were made.

* ``ebi_variation_P68871.json`` — human haemoglobin beta from the EBI Proteins API
  ``/variation`` endpoint. Carries the sickle-cell variant (p.Glu7Val in UniProt
  numbering, "E6V" in the legacy numbering that drops the initiator Met), ClinVar
  benign and pathogenic calls, gnomAD frequencies and SIFT/PolyPhen predictions.
* ``alphafold_am_P68871.json`` — AlphaFold DB ``/api/annotations`` with
  ``type=MUTAGEN``: the per-residue mean AlphaMissense pathogenicity.
* ``AF-P68871-F1.pdb`` — the AlphaFold model the two payloads are mapped onto.

The live ``/variation`` body for HBB is ~2 MB, almost all of it per-transcript
``locations``, link URLs, prose disease descriptions and long cross-reference
lists that ``services/clinical.py`` never reads. The recording keeps every feature and every key the service reads, drops
the rest, and keeps at most ``MAX_CLINVAR_XREFS`` ClinVar references per feature
(the service shows fewer than that). Nothing is edited, only removed.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

HERE = Path(__file__).parent
ACCESSION = "P68871"
MAX_CLINVAR_XREFS = 8
KEPT_FEATURE_KEYS = (
    "type", "ftId", "begin", "end", "wildType", "mutatedType", "alternativeSequence",
    "consequenceType", "somaticStatus", "sourceType", "clinicalSignificances",
    "populationFrequencies", "predictions", "association", "xrefs",
)  # fmt: skip
KEPT_XREFS = ("ClinVar", "dbSNP", "gnomAD")


def _trim_feature(feature: dict) -> dict:
    out = {k: feature[k] for k in KEPT_FEATURE_KEYS if k in feature}
    xrefs = [x for x in feature.get("xrefs", []) if x.get("name") in KEPT_XREFS]
    clinvar = [x for x in xrefs if x["name"] == "ClinVar"][:MAX_CLINVAR_XREFS]
    kept = clinvar + [x for x in xrefs if x["name"] != "ClinVar"]
    # Links are rebuilt from the id by the service, so only name + id are read.
    out["xrefs"] = [{"name": x["name"], "id": x["id"]} for x in kept]
    out["association"] = [
        {k: a[k] for k in ("name", "disease", "clinicalSignificances") if k in a}
        for a in feature.get("association", [])
    ]
    return out


def main() -> None:
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        variation = client.get(
            f"https://www.ebi.ac.uk/proteins/api/variation/{ACCESSION}",
            headers={"Accept": "application/json"},
        ).raise_for_status().json()
        variation["features"] = [_trim_feature(f) for f in variation["features"]]
        (HERE / f"ebi_variation_{ACCESSION}.json").write_text(
            json.dumps(variation, separators=(",", ":"))
        )

        am = client.get(
            f"https://alphafold.ebi.ac.uk/api/annotations/{ACCESSION}.json",
            params={"type": "MUTAGEN"},
        ).raise_for_status().json()
        (HERE / f"alphafold_am_{ACCESSION}.json").write_text(json.dumps(am, separators=(",", ":")))

        model = client.get(
            f"https://alphafold.ebi.ac.uk/files/AF-{ACCESSION}-F1-model_v6.pdb"
        ).raise_for_status().text
        (HERE / f"AF-{ACCESSION}-F1.pdb").write_text(model)


if __name__ == "__main__":
    main()
