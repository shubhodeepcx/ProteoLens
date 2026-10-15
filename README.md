# ProteoLens: AI-Powered Protein Structure Visualization Platform

A web-based workspace for protein 3D visualization, structural analysis, annotation, and reporting. Combines a Mol*-based molecular viewer with bioinformatics pipelines, public-database integration (RCSB PDB, AlphaFold DB, UniProt), and AI-assisted annotation.

**Status:** every planned phase (P0-P24) is merged into `main`. ProteoLens ships the Mol* viewer, upload and parse, analytics, a linked sequence panel, RCSB/AlphaFold/UniProt search and import, UniProt annotations, structure comparison, BLAST and UniRef similarity, Complex Portal, pLDDT/PAE confidence, functional regions, bound compounds, structural variant impact, a printable report with export, DNA sequence tools, surface electrostatics, the Explain assistant, clinical evidence, an oncology layer, neoantigen prediction, conservation, AutoDock Vina docking, ESMFold structure prediction and the Central Dogma Explorer, all in a retro-futuristic theme with a Classic light theme behind a toggle. 778 backend and 565 frontend tests run in CI on every pull request. Loaded proteins are kept in a SQLite table, so they survive a restart. Follow-ups are tracked in [docs/PROJECT_TRACKER.md](docs/PROJECT_TRACKER.md).

**Smoke tests:** After setup, run [docs/smoke-tests.md](docs/smoke-tests.md) to verify each phase end-to-end.

---

## Project layout

```
.
├── frontend/   # Next.js 16 (App Router, TypeScript), Tailwind v4, shadcn/ui, Zustand, Mol* 5
├── backend/    # FastAPI 0.110+, Python 3.11+, BioPython, httpx
├── docs/
│   ├── spec.md                                  # Full 6-month product + technical spec
│   ├── sdlc.md                                  # 6-month phase plan
│   ├── project_report.md                        # Project report (background, motivation, scope)
│   ├── PROJECT_TRACKER.md                       # Living tracker — claim-before-code
│   ├── smoke-tests.md                           # Per-phase manual verification scripts
│   └── design/                                  # Slice designs
├── scripts/    # launch.ps1 (used by start.cmd), restart_servers.ps1
├── start.cmd   # One-click Windows launcher
├── docker-compose.yml
└── CONTRIBUTING.md   # Contributor guide
```

The full 6-month roadmap is in [docs/spec.md](docs/spec.md). The slice designs that shaped the build (P0-P5, then annotation and comparison P6-P10) are in [docs/design/](docs/design/).

---

## Quick start

**Double-click `start.cmd`** (or run it from a terminal).

That is the whole thing. It installs anything missing, builds the frontend, starts both
services, and opens the app in your browser. Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop both.

```powershell
.\start.cmd              # run it
.\start.cmd -Rebuild     # force a fresh frontend build after changing source
.\start.cmd -NoBrowser   # start the servers without opening a browser
```

The first run takes a few minutes (virtualenv + npm install + AutoDock Vina download +
production build). Every run after that starts in seconds.

The launcher serves a **production build** rather than the dev server. That is deliberate:
`next dev` paints a floating dev-tools bubble over every page, and `next start` does not.
For active development with hot reload, use the two-terminal flow under [Run](#run) below.

### With Docker (any OS)

```bash
docker compose up --build
```

Then open http://localhost:3000. Uploaded structures and the protein table live in the `proteolens-data` volume, so they survive `docker compose down`. Set `BLAST_CONTACT_EMAIL` in your shell first if you want BLAST to work (see `backend/.env.example`).

---

## Prerequisites

- **Node.js** 20+ and **npm** 10+
- **Python** 3.11+
- A modern browser (Chrome/Edge/Firefox) for the Mol* viewer
- Internet access for the public databases (RCSB, AlphaFold DB, UniProt, EBI, Ensembl and others)

Docker is optional; both services run from your shell.

### Optional configuration

All settings are documented in `backend/.env.example`. The API reads them from the environment, so set them in the shell that starts it (`$env:NAME = "value"` in PowerShell, `export NAME=value` in bash).

| Variable | Needed for | Notes |
| --- | --- | --- |
| `CORS_ORIGINS` | Everything | Required. `http://localhost:3000` for local use. `start.cmd` sets it. |
| `BLAST_CONTACT_EMAIL` | BLAST | EBI rejects jobs without a real contact address. |
| `EXPLAIN_API_URL`, `EXPLAIN_API_KEY`, `EXPLAIN_MODEL` | Explain assistant | Any chat-completions compatible endpoint. Without all three the Explain panel says it is not configured. |
| `VINA_BINARY` | Docking | Path to an AutoDock Vina 1.2 binary. Not needed after `python scripts/install_vina.py`. |
| `PROTEOLENS_DB` | Persistence | SQLite file for the protein table; defaults to a file under `backend/storage/`. |

---

## Setup

Only needed if you are not using `start.cmd`, which does all of this for you.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # PowerShell
# or: source .venv/bin/activate   # bash
pip install -e ".[dev]"
python scripts/install_vina.py      # optional: AutoDock Vina for the Docking tab
```

### Frontend

```powershell
cd frontend
npm install
```

---

## Run

Two terminals — one for each service.

**Terminal 1 — backend** (`http://localhost:8000`):

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
$env:CORS_ORIGINS = "http://localhost:3000"   # required — see below
python -m uvicorn app.main:app --reload --port 8000
```

> **`CORS_ORIGINS` is required.** It has no default: when unset the API denies *every*
> origin, so the frontend loads but every request fails browser preflight and the health
> pill reads "Backend unreachable". That is deliberate — an unset value fails loudly at
> deploy time rather than silently allowing everything. See `backend/.env.example`.
> On bash: `export CORS_ORIGINS=http://localhost:3000`. (`start.cmd` sets it for you.)

- Swagger UI at `http://localhost:8000/docs`
- Health check at `http://localhost:8000/health`

**Terminal 2 — frontend** (`http://localhost:3000`):

```powershell
cd frontend
npm run dev
```

The landing page shows a "Backend OK" / "Backend unreachable" pill so you can confirm wiring at a glance.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Pill says **Backend unreachable** | The API is not running or `CORS_ORIGINS` is unset. Check the backend terminal for an error, open http://localhost:8000/health (it should return `"status": "ok"`), and start it with `python -m uvicorn` so a missing PATH entry does not matter. |
| **Docking needs AutoDock Vina** | Run `python scripts/install_vina.py` in `backend/`, or point `VINA_BINARY` at a Vina 1.2 binary. No restart needed. |
| BLAST fails straight away | Set `BLAST_CONTACT_EMAIL` to a mailbox you read. |
| Explain says it is not configured | Set `EXPLAIN_API_URL`, `EXPLAIN_API_KEY` and `EXPLAIN_MODEL`, then restart the API. |
| Explorer, Clinical or Oncology show a source error | Those tabs call public services live (Ensembl, EBI, cBioPortal and others). Check your connection; each source fails on its own without breaking the rest. |

---

## Testing

```powershell
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

---

## Working on the project

If you're contributing, read [CONTRIBUTING.md](CONTRIBUTING.md) first. It covers:

- Mandatory reading order
- Claim-before-code via [docs/PROJECT_TRACKER.md](docs/PROJECT_TRACKER.md)
- Branch / commit conventions (`feature/<phase>-<slug>`, commit authorship)
- Coding standards (TS strict on frontend, full type hints on backend)
- Definition of done (smoke test passes, tracker updated, decisions logged)
- Parallel-work etiquette and destructive-action gate

The slice designs live in [docs/design/](docs/design/): the MVP slice (P0-P5) and the annotation and comparison slice (P6-P10).

---

## Documentation index

- [Backend README](backend/README.md) and [Frontend README](frontend/README.md)
- [Spec](docs/spec.md)
- [SDLC plan](docs/sdlc.md)
- [Project report](docs/project_report.md)
- [MVP slice design](docs/design/2026-05-23-protein-mvp-slice-design.md)
- [Annotation and comparison slice design](docs/design/2026-08-22-annotation-comparison-slice-design.md)
- [Project tracker](docs/PROJECT_TRACKER.md)
- [Smoke tests](docs/smoke-tests.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
