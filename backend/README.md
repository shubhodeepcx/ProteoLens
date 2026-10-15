# ProteoLens Backend

FastAPI backend for the ProteoLens protein structure visualization platform. It parses
PDB/mmCIF files with BioPython, keeps loaded proteins in a SQLite table, and fans out to
public databases (RCSB, AlphaFold DB, UniProt, EBI, PDBe-KB, Ensembl, cBioPortal and others)
through one cached, rate-limited HTTP layer.

## Prerequisites

- Python 3.11+
- Internet access for the public-database features

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # PowerShell
# or: source .venv/bin/activate   # bash
pip install -e ".[dev]"
python scripts/install_vina.py    # optional: AutoDock Vina 1.2.7 for docking
```

`install_vina.py` downloads the official Vina release binary for your OS into `bin/`
(git-ignored). The docking service looks for `$VINA_BINARY`, then `bin/vina[.exe]`, then
`vina` on PATH.

## Run

```powershell
$env:CORS_ORIGINS = "http://localhost:3000"
python -m uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/health
- Swagger UI: http://localhost:8000/docs

## Tests and lint

```powershell
pytest          # 778 passed, 1 skipped; all external HTTP is mocked
ruff check .
```

## Environment variables

The API reads these from the environment. `.env.example` documents each one.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins. Unset denies every origin. |
| `BLAST_CONTACT_EMAIL` | For BLAST | Contact address EBI requires on every BLAST job. |
| `EXPLAIN_API_URL` | For Explain | Any chat-completions compatible endpoint. |
| `EXPLAIN_API_KEY` | For Explain | Bearer key for that endpoint. Stays on the server. |
| `EXPLAIN_MODEL` | For Explain | Model id from your provider. |
| `VINA_BINARY` | No | Path to a Vina 1.2 binary, if not installed under `bin/`. |
| `PROTEOLENS_DB` | No | SQLite file for the protein table. Default `storage/proteolens.db`. |

## Layout

```
app/
├── main.py       # App, CORS, router registration, /health
├── api/          # One router per feature, all under /api
├── models/       # Pydantic response models
├── services/     # Parsing, analytics and the external-database clients
└── static/       # Bundled demo structure (1CRN)
scripts/
└── install_vina.py
tests/            # pytest suite
```

## API

| Route | Feature |
| --- | --- |
| `POST /api/proteins/upload`, `GET /api/proteins`, `GET /api/proteins/{uid}`, `GET /api/proteins/{uid}/file` | Upload, list, summary, raw file |
| `GET /api/search`, `POST /api/proteins/import` | RCSB / AlphaFold / UniProt search and import |
| `POST /api/proteins/predict` | ESMFold structure prediction from a sequence |
| `GET /api/proteins/{uid}/analytics` | MW, composition, hydrophobicity, secondary structure |
| `GET /api/proteins/{uid}/annotations` | UniProt annotations |
| `GET /api/proteins/{uid}/confidence` | pLDDT and PAE |
| `GET /api/proteins/{uid}/functional-regions` | Curated sites, ligand pockets, surface profile |
| `GET /api/proteins/{uid}/compounds` | Ligands, cofactors, ions, nucleic acids |
| `GET /api/proteins/{uid}/complexes` | Complex Portal |
| `GET /api/proteins/{uid}/similar`, `POST /api/blast`, `GET /api/blast/{job_id}` | UniRef similarity and EBI BLAST |
| `POST /api/compare` | Alignment and superposition RMSD |
| `POST /api/proteins/{uid}/variant` | Structural variant impact |
| `GET /api/proteins/{uid}/electrostatics` | Surface electrostatics |
| `POST /api/proteins/{uid}/explain` | Explain assistant |
| `GET /api/proteins/{uid}/clinical-evidence` | ClinVar, gnomAD, AlphaMissense |
| `GET /api/proteins/{uid}/oncology` | Hotspots, TCGA, drugs, CIViC, pathways |
| `GET /api/proteins/{uid}/neoantigens` | HLA class I neoantigen candidates |
| `GET /api/proteins/{uid}/conservation` | Per-residue conservation |
| `GET /api/proteins/{uid}/docking/sites`, `POST /api/proteins/{uid}/dock` | AutoDock Vina docking |
| `GET /api/explorer`, `GET /api/explorer/scenarios` | Central Dogma Explorer |
| `POST /api/tools/{orfs,restriction,primers,crispr}` | DNA sequence tools |

## Design docs

See [../docs/design/](../docs/design/) and [../docs/PROJECT_TRACKER.md](../docs/PROJECT_TRACKER.md).
