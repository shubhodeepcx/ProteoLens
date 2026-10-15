# ProteoLens — Frontend

Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui + Zustand + Mol* 5. This is the web UI for the ProteoLens protein structure platform. The API lives in [`../backend`](../backend) and is expected on `http://localhost:8000`.

## Quick start

```powershell
# from this directory
npm install
npm run dev
```

The dev server starts on `http://localhost:3000`. The landing page pings `GET /health` on the backend; the pill in the header reads "Backend OK" when it answers and "Backend unreachable" otherwise.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server on `:3000`. |
| `npm run build` | Production build (webpack; the Turbopack bundle breaks the Mol* route). |
| `npm run start` | Run the production build. |
| `npm run lint` | TypeScript-only check (`tsc --noEmit`). |
| `npm test` | Run the Vitest suite once (565 tests). |
| `npm run test:watch` | Vitest in watch mode. |

## Environment variables

Set these in `.env.local` if you need to change them.

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL for the FastAPI backend. |

## Pages

| Route | What it does |
| --- | --- |
| `/` | Landing page: upload, recent proteins, entry points, backend health. |
| `/search` | Search RCSB, AlphaFold DB and UniProt, then import a hit. |
| `/predict` | Fold a pasted sequence with ESMFold. |
| `/viewer/[id]` | The workspace: Mol* viewer, chain tree, sequence panel and the analysis rail (Overview, Sequence, Analytics, Annotations, Variants, Compounds, Similarity, Complexes, Clinical, Oncology, Neoantigens, Conservation, Docking), confidence, functional-region and electrostatics overlays, and the Explain sheet. |
| `/viewer/demo` | The bundled 1CRN demo structure. |
| `/compare` | Two structures side by side with alignment and RMSD. |
| `/report/[id]` | Printable A4 report with JSON and CSV export. |
| `/tools` | ORF finder, restriction map, PCR primers, CRISPR guides. |
| `/explore` | Central Dogma Explorer: one variant from chromosome to protein. |

## Code layout

- `app/` — routes, each with its page-local components.
- `components/` — shared components, one file per panel or section, each under 200 lines.
- `components/charts/` — Recharts charts that read their colours from theme variables.
- `lib/` — API client (`api.ts`), formatting helpers, types, and hooks such as `use-structure-load.ts` and `use-viewer-sync.ts`.
- `lib/molstar/` — Mol* actions and the viewer handle.
- `lib/store/` — Zustand slices: `protein-slice`, `selection-slice`, `viewer-slice` and `blast-slice`, composed in `index.ts`.

## Themes

The default theme is **Retro**: an indigo canvas with neon magenta and cyan, Orbitron headings, a synthwave grid and HUD-style cards. **Classic** is a light theme behind the toggle in the header. Both are CSS-variable token sets in `app/globals.css`; the report page always prints on white.

## Testing

Vitest + `@testing-library/react` + jsdom. Tests live in `__tests__/` folders next to the code. New modules ship with at least one spec.
