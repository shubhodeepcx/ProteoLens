# Smoke Tests

Per-phase manual checks. A phase is marked "Done" in `PROJECT_TRACKER.md` only when the corresponding smoke test passes — type-check and unit tests alone are not enough.

Run from the repo root (`g:\protein`) unless noted.

---

## Verification status

Not every section below has been run by hand in a browser. Where each one stands:

| Sections | Status |
|---|---|
| P0–P5.5 | Executed end-to-end on **2026-08-21**, record below. |
| P6–P10, A5, Compounds, P19, Clinical, Oncology, Neoantigens, Conservation, Docking, Central Dogma Explorer | Written as each phase landed, with that phase's test run. No dated hand-run record is kept for them here. |
| P11, P12, P13, P14, P15, P16, P21 / P24 (theme) | Written on **2026-10-15** from the code and its automated tests. Not yet walked through by hand; the Docker step in P11 and the live-endpoint steps in P16 need a Docker daemon and a configured model endpoint. |

**Current test totals (2026-10-15):** backend `pytest` 778 passed, 1 skipped (the real-Vina docking
test, which skips without a Vina binary); frontend `npm test` 565 passed. The full-suite counts quoted
inside each phase are the totals when that phase landed, so they are lower than these.

## Last verified run — 2026-08-21

P0–P5.5 executed end-to-end in a real Chromium (driven by Playwright) against both servers running
locally and against the **live** public APIs. Results:

| Check | Result |
|---|---|
| Landing page, `Backend OK` pill, Databases link, Upload enabled | pass |
| Mol\* WebGL renders 1CRN at `/viewer/demo` | pass — cartoon, helices and sheets resolved |
| Upload `1CRN.pdb` → `/viewer/{uuid}` | pass |
| Overview metrics | pass — chains 1, residues 46, atoms 327, MW 4736 Da |
| Sequence panel | pass — 46 cells, `TTCCPSIVARSN`, labels A:1–A:46, legend + ruler |
| Sequence → 3D click sync | pass — A:23 boxed as `E`, highlight visible in the viewport |
| Residue search | pass — `a:7` → `I`; `A:999` → "No residue A:999 — chain A has 46 residues" |
| `has_plddt` gating | pass — pLDDT option **absent** on uploaded PDB, **present** on AlphaFold import |
| Live search `insulin` | pass — 75 results, 25 each from RCSB / AlphaFold / UniProt, `failed_sources` empty |
| Import 4INS (multi-chain **mmCIF**) from live RCSB | pass — A21/B30/C21/D30, organism `Sus scrofa` |
| **Residue seam on imported mmCIF** | pass — ordinals restart per chain; B:25 boxed as `F` with 3D highlight |
| Import AlphaFold P01308 | pass — `has_plddt: true`, 110 residues |
| **pLDDT coloring direction** | pass — confident helix renders **blue**, disordered loop pink (correct convention) |
| AlphaFold 404 path | pass — `Q0Q0Q0` → 404 "AlphaFold DB has no model for accession 'Q0Q0Q0'." |

**Human-confirmed the same day** (the three checks that need a mouse on a 3D canvas, which the
automated pass could not aim at):

| Check | Result |
|---|---|
| 3D → sequence direction: clicking the ribbon boxes a letter, and a different click boxes a different letter | pass |
| 1HHO cofactor: selection **survives** a click on a HEM group; a background click **clears** it | pass |
| Mouse rotate + scroll zoom | pass |

That completes both directions of the P4 click-sync and the ligand-vs-background distinction, which
were the last behaviours resting only on static review.

Still not covered: the offline-source degradation banner in P5 step 9 — it needs a host blocked at
the firewall/hosts level. The equivalent path is covered by an automated backend test (a raising
source returns 200 with that source in `failed_sources`), so this is UI confirmation only.

---

## P0 — Scaffold

**Goal:** both servers start and the frontend successfully calls the backend.

1. Backend: open a terminal, run
   ```
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1        # PowerShell  (or source .venv/bin/activate on bash)
   pip install -e ".[dev]"
   $env:CORS_ORIGINS="http://localhost:3000"   # PowerShell  (bash: export CORS_ORIGINS=http://localhost:3000)
   uvicorn app.main:app --reload --port 8000
   ```
   - `CORS_ORIGINS` is required — see `backend/.env.example`. Without it the frontend will fail browser preflight.
   - Expect: server reports `Uvicorn running on http://127.0.0.1:8000`.
   - Visit `http://localhost:8000/health` → JSON `{"status": "ok", "service": "protein-backend", "version": "0.1.0"}`.
   - Visit `http://localhost:8000/docs` → Swagger UI loads.
2. Frontend: open a second terminal, run
   ```
   cd frontend
   npm install
   npm run dev
   ```
   - Expect: Next.js reports `Ready in …` on port 3000.
   - Visit `http://localhost:3000/` → page loads with header, 3-column layout shell, and a green "Backend OK" pill (because the page fetched `/health`).
3. Stop the backend; reload the frontend page.
   - Expect: the pill flips to red "Backend unreachable" with no crash.
4. Backend tests:
   ```
   cd backend
   pytest
   ```
   - Expect: `test_health` passes.
5. Frontend tests:
   ```
   cd frontend
   npm test
   ```
   - Expect: the selection-slice smoke test passes.

**Pass criteria:** all of the above without errors.

---

## P1 — Static viewer

**Goal:** open `/viewer/demo` and rotate a real 3D crambin structure.

1. Start backend (if not running):
   ```
   cd backend
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --port 8000
   ```
   - Visit `http://localhost:8000/api/proteins/demo/file` → browser downloads `1CRN.pdb` (~49 KB).

2. Start frontend (if not running):
   ```
   cd frontend
   npm run dev
   ```
   - Visit `http://localhost:3000/viewer/demo` → page loads with dark toolbar (ProteoLens / 1CRN — Crambin / P1 badge).
   - Loading spinner appears briefly, then the Mol\* canvas renders crambin in cartoon representation.
   - Drag to rotate, scroll to zoom — structure moves responsively.
   - Click **surface**, **stick**, **ball-stick**, **spacefill** → active button highlights.
   - Click the reset-camera (↺) button → structure re-centers.

3. Stop the backend; reload `/viewer/demo`.
   - Expect: "Could not load demo structure. Is the backend running?" overlay — no crash.

4. Backend tests:
   ```
   cd backend
   pytest
   ```
   - Expect: `test_demo_file` (3 tests) + `test_health` = 4 passed.

5. Frontend tests:
   ```
   cd frontend
   npm test
   ```
   - Expect: 7/7 pass (Mol\* itself is exercised only in the browser).

**Pass criteria:** crambin renders and rotates in the browser; all automated tests pass.

---

## P2 — Upload + parse

**Goal:** drag a `.pdb` file onto the landing page → see it render with chain/residue counts.

1. Start backend (if not running):
   ```
   cd backend
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --port 8000
   ```

2. Start frontend (if not running):
   ```
   cd frontend
   npm run dev
   ```

3. Visit `http://localhost:3000/` → landing page shows the **DropZone** card with "Drop a .pdb or .cif file here" in the center column (no more placeholder).

4. Drag `backend/app/static/1CRN.pdb` onto the DropZone (or click "Choose file" and pick it).
   - Expect: card flips to "Uploading 1CRN.pdb…" with a spinner.
   - After 1–3 seconds, the browser navigates to `/viewer/{uuid}` and crambin renders in the Mol\* canvas.

5. On the viewer page, click "metadata" in the toolbar.
   - Expect: panel shows `chains: 1 (A)`, `residues: 46`, `atoms: 327`, `MW: ~4737`, `format: pdb`.

6. Negative cases on the landing page:
   - Drop a `.txt` file → inline red error: "Unsupported extension '.txt'. Allowed: .pdb, .cif, .mmcif".
   - Drop an empty file (e.g., `New-Item empty.pdb`) → inline error: "File is empty."

7. 404 path: visit `http://localhost:3000/viewer/does-not-exist`.
   - Expect: red "Protein does-not-exist not found" with "Upload a new protein" link back to `/`.

8. Backend tests:
   ```
   cd backend
   pytest
   ```
   - Expect: 14 passed (demo file × 3, health × 1, parser × 4, upload × 6).

9. Frontend tests:
   ```
   cd frontend
   npm test
   ```
   - Expect: 13 passed (selection-slice × 7, drop-zone × 6).

**Pass criteria:** real PDB uploaded → parsed → rendered in 3D; metadata panel shows correct chain/residue/atom/MW counts; validation errors fire; all automated tests pass.

---

## P3 — Dashboard

**Goal:** uploaded protein shows MW, residue count, atom count, composition bar chart, secondary-structure donut, hydrophobicity line, chain-length bar chart in the right panel.

1. Start backend (P0 instructions). Set `CORS_ORIGINS` first:
   ```
   cd backend
   $env:CORS_ORIGINS = "http://localhost:3000"
   uvicorn app.main:app --reload --port 8000
   ```
2. Start frontend:
   ```
   cd frontend
   npm run dev
   ```
3. Visit `http://localhost:3000` → drop `backend/app/static/1CRN.pdb` onto the DropZone → page navigates to `/viewer/{id}`.
4. Verify the right-side panel (visible at ≥1280px viewport; stacks below viewer at narrower widths):
   - **Metric cards**: MW ~4736 Da, Residues 46, Atoms 327, Chains 1.
   - **Amino-acid composition**: 20 blue bars; hovering Cys shows "6 (13.04%)".
   - **Secondary structure**: donut with three slices (helix ~46%, sheet ~17%, coil ~37% for 1CRN); legend below.
   - **Hydrophobicity**: green line spanning residue positions ~5–42 (window 9 on 46-residue chain → 38 points); horizontal reference line at y=0; range stays within −4.5 to 4.5.
   - **Chain lengths**: single purple bar labeled "A" at length 46.
5. Resize browser to <1024px: analytics panel moves below the viewer and remains fully scrollable.
6. Probe the API directly:
   ```
   curl http://localhost:8000/api/proteins/<uid>/analytics | jq .
   ```
   - Expect: `molecular_weight` in [4700, 4770], `composition` array of length 20, `hydrophobicity.values` length 38, `secondary_structure` sums to ~1.0.
7. Backend tests:
   ```
   cd backend
   pytest
   ```
   - Expect: 31 passed (17 analytics + 14 prior).
8. Frontend tests:
   ```
   cd frontend
   npm test
   ```
   - Expect: 13/13 pass (charts are exercised only in the browser).

**Pass criteria:** all four charts render with the expected shapes for 1CRN; metric cards show MW/Residues/Atoms/Chains accurately; automated tests pass.

---

## P4 — Sequence panel

**Goal:** clicking a residue in the sequence panel highlights it in 3D, and clicking a residue in 3D scrolls + highlights it in the sequence panel.

1. Start both servers as in P0 (backend on `:8000` with `CORS_ORIGINS` set, frontend on `:3000`).
2. Visit `http://localhost:3000` → drop `backend/app/static/1CRN.pdb` → land on `/viewer/{id}`.
3. Open the **Sequence** tab in the right rail. Verify:
   - One block for chain **A**, labelled with its residue count (**46**).
   - 46 monospace residue cells, colored by residue class, with a legend and a position ruler every 10.
   - Crambin's sequence starts `TTCCPSIVAR` — cell 1 is `T`, cell 3 is `C`.
4. **Sequence → 3D:** click residue `A:23`. The cell takes the selected style, and the corresponding
   residue highlights in the Mol\* viewport. Click it again to deselect; the 3D highlight clears.
5. **3D → sequence:** rotate the model, click a residue in the viewport. The matching sequence cell
   becomes selected **and scrolls into view**. Confirm the residue identity matches — click a
   cysteine in 3D and verify a `C` cell lights up (crambin has 6: positions 3, 4, 16, 26, 32, 40).
   This is the step that catches residue-numbering drift between Mol\* `auth_seq_id` and the panel's
   1-based index — if the wrong cell highlights, P4 is not done.
6. **Non-protein geometry must not clear the selection.** Import or upload a structure with a
   cofactor — `1HHO` (haemoglobin, HEM groups) is the reference case. Select any chain A residue,
   then click the **HEM cofactor** in the viewport: the selection must **survive**, because a
   ligand is real geometry that simply has no sequence cell. Then click empty background: *now*
   the selection clears. These two must behave differently.
   This step exists because the fix separating "no locus at all" from "locus not in the residue
   index" has no unit-testable path — Mol\* is a trusted library and is not unit-tested, so this
   is the only place that distinction is verified.
7. **Navigation after a failed load.** Open a viewer URL whose structure fails to load (e.g. a
   uuid whose file was deleted from `backend/storage/proteins/`), then navigate to a working
   protein. The new viewer must mount and render — no stale error overlay, no stuck spinner.
8. **Residue search:** type `A:23` in the search box → that residue becomes the sole selection and
   scrolls into view. Type `A:999` → inline error naming chain A's real length (46). Type `Z:1` →
   inline error for the unknown chain. Lowercase `a:23` must work.
9. **Viewer controls:** change representation (cartoon → surface → spacefill) and coloring scheme
   from the toolbar; the viewport updates each time. The selection survives a representation change.
10. Tests:
    ```
    cd frontend
    npm run lint     # tsc --noEmit, clean
    npm test
    npm run build
    ```
    - Expect: all pre-existing tests still pass, plus the `parseResidueQuery`, `SequencePanel`, and
      residue-map tests. The residue-map suite is the one that pins the ordinal convention against a
      non-1-based, gapped, multi-chain fixture — if someone swaps ordinal for `auth_seq_id`, it fails.

**Pass criteria:** selection round-trips in both directions with the *same* residue, a cofactor click
preserves the selection while a background click clears it, navigation recovers from a failed load,
the search box resolves and rejects correctly, and lint/test/build are all green.

---

## P5 — DB search + import

**Goal:** searching "insulin" returns merged results from RCSB + AlphaFold + UniProt; clicking import lands the user in the viewer with that structure rendered.

> This is the only phase that touches the public internet. The automated tests are fully mocked
> (respx / pytest-httpx); the manual steps below deliberately hit the real APIs.

1. Start both servers as in P0.
2. Visit `http://localhost:3000/search` (or follow the "Search databases" link from the landing page).
3. Search `insulin`. Verify:
   - Results appear from more than one source, each card carrying a source badge (RCSB / AlphaFold /
     UniProt), a source id, a title, and an organism.
   - No duplicate `(source, source_id)` pairs in the list.
4. Use the source filter: selecting **RCSB** narrows results to RCSB only; **All** restores the merge.
5. **Import an RCSB entry** (e.g. `4INS`). The card shows a spinner, then the app routes to
   `/viewer/{id}` with the structure rendered in Mol\*, and the Analytics tab populates.
6. **Import an AlphaFold entry** (e.g. UniProt `P01308`). Verify the viewer loads it and the summary
   reports `has_plddt: true` — AlphaFold models carry pLDDT in the B-factor column.
7. **Graceful degradation:** stop the machine's network (or block `files.rcsb.org`) and search again.
   The request must still return **200** with whatever sources worked, and a non-blocking banner must
   name the sources in `failed_sources`. A single dead source must never fail the whole search.
8. **Import 404:** import an accession with no model (e.g. a UniProt entry AlphaFold has not
   predicted). Expect a 404 with a source-specific message surfaced inline on the card — not a crash.
9. Probe the API directly:
   ```
   curl "http://localhost:8000/api/search?q=insulin&source=all" | jq '.results | length, .failed_sources'
   curl -X POST http://localhost:8000/api/proteins/import \
        -H "Content-Type: application/json" -d '{"source":"rcsb","source_id":"4INS"}' | jq .
   ```
   - The import response must be the same `ProteinSummary` shape the upload endpoint returns, and the
     returned `id` must resolve on `GET /api/proteins/{id}` and `GET /api/proteins/{id}/file`.
10. Tests:
    ```
    cd backend && pytest
    cd frontend && npm run lint && npm test && npm run build
    ```
    - Expect: all pre-existing backend tests still pass alongside the new client / search / import
      tests, and the frontend suite stays green.

**Pass criteria:** a real search merges and dedupes across sources, a failing source degrades to a
banner instead of an error, import round-trips into a working viewer, and all tests pass offline.

---

## P5.5 — Final-review fixes

**Goal:** the three things the whole-branch review found that only a browser can confirm — pLDDT
renders the right way round, an imported RCSB **mmCIF** round-trips its organism *and* its residue
clicks, and the pLDDT coloring option only appears where pLDDT exists.

> P5 is already at the 10-step cap, and every step here needs a real import, so these live in their
> own section rather than growing that one.

1. Start both servers as in P0, then visit `http://localhost:3000/search`.

2. **Organism survives an mmCIF import.** Search `crambin`, note the organism printed on the RCSB
   card (`Crambe hispanica subsp. abyssinica` for `1CRN`), then import that card. On `/viewer/{id}`
   open the **Overview** tab: **Organism** must show that same value.
   Before the fix it read `Unknown` on every RCSB import — RCSB serves mmCIF, and BioPython's mmCIF
   header carries no source category at all, so the parser had nothing to read. Any RCSB entry works;
   what matters is that the viewer agrees with the search card that produced it.

3. **Residue click on an imported mmCIF.** Staying on that imported structure, repeat P4 steps 4 and
   5 — sequence cell → 3D, and 3D → sequence cell — and confirm the *same* residue lights up in both
   directions.
   This is the step P4 could not cover: it only ever exercised an **uploaded** `1CRN.pdb`. mmCIF
   reaches Mol\* through a different parser and carries `label_seq_id` alongside `auth_seq_id`, so
   the ordinal ↔ residue-index seam is genuinely a different code path here. Pick a residue well
   into the chain (not position 1) — an off-by-one seam looks correct at the start of a chain.
   For a multi-chain entry (`4INS` has chains A–D), click a residue on chain **C** or **D**: a seam
   that indexes across chains instead of within one only shows up past the first chain.

4. **pLDDT is not inverted.** Import an AlphaFold model — UniProt `P69905` (haemoglobin α) is the
   reference case — and pick **pLDDT confidence** from the coloring select.
   The confident core must render **blue** and the disordered tails **orange/red**. If the core is
   red, the domain inversion has been lost and the viewer is showing users the exact inverse of the
   AlphaFold convention. Cross-check one residue against the AlphaFold DB entry page for `P69905`,
   which uses the same blue-to-orange banding.

5. **pLDDT is offered only where it exists.** On that same AlphaFold structure the coloring select
   lists **pLDDT confidence**, and the Overview tab's **B-factors** field reads
   `pLDDT confidence (0–100)`. Now open the imported RCSB entry from step 2: the select must **not**
   list pLDDT at all, and **B-factors** must read `Temperature factors`.

6. **A stale pLDDT selection cannot survive the trip.** With the AlphaFold structure still on pLDDT
   coloring, navigate straight to the RCSB entry (browser Back, or the search page and re-import).
   The select must land on **Chain** and the viewport must repaint accordingly — never a select
   showing one scheme while Mol\* renders another.

7. Probe the import directly, to separate a parser problem from a UI one:
   ```
   curl -X POST http://localhost:8000/api/proteins/import \
        -H "Content-Type: application/json" -d '{"source":"rcsb","source_id":"1CRN"}' \
     | jq '{organism, has_plddt, file_format}'
   ```
   - Expect: `organism` non-null, `has_plddt: false`, `file_format: "mmcif"`.

8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm run lint && npm test && npm run build
   ```
   - Expect: every test passes, lint and build clean (90 backend and 103 frontend when this phase landed; current totals are in the header).

**Pass criteria:** an imported mmCIF shows its organism and round-trips residue clicks in both
directions; high pLDDT reads blue; the pLDDT option and the Overview B-factors field both follow
`has_plddt`; and a stale pLDDT selection falls back rather than desynchronising.

---

## P6 — Annotation panel

Goal: open a protein imported from UniProt, RCSB or AlphaFold and read real biological
annotation in the rail; open an uploaded file and be told plainly why there is none.

1. Start both servers (`start.cmd`, or the two dev commands).
2. Go to `/search`, search `insulin`, import the **UniProt P01308** card.
3. In the viewer rail, click the **Annotations** tab.
   - Expect: sections **Names & Origin**, **Function**, **Gene Ontology**, **Keywords**,
     **Subcellular Location**, **Disease**, **PTM / Processing**, **Cross-references**.
   - Expect **no** Catalytic Activity and **no** Transmembrane heading — insulin is neither an
     enzyme nor a membrane protein, and an empty section is the bug this phase fixes.
   - Names & Origin reads `Insulin` / `INS` / `Homo sapiens` / `INS_HUMAN`.
   - Gene Ontology is split under *Molecular function*, *Biological process*,
     *Cellular component*.
   - A Reactome id links out to `reactome.org/content/detail/...` in a new tab.
4. Import an enzyme with a membrane span — search `EGFR`, import the UniProt **P00533** card.
   - Expect: **Catalytic Activity** showing the reaction text with `EC 2.7.10.1` and a
     `RHEA:` link, and **Transmembrane** listing the 646–668 helical span between two
     topological domains.
5. Import an **RCSB** entry (e.g. `4INS`) and open Annotations.
   - Expect: annotations resolved, with the footer note naming how — "via its polymer entity"
     or "via UniProt's index".
6. Upload a plain local PDB (e.g. `backend/app/static/1CRN.pdb`) and open Annotations.
   - Expect: HTTP 200, no red error, and the message
     *"Uploaded structures carry no database identifier to map from."*
   - Negative case: this must never be a 500 or an error state.
7. Collapse and re-expand any section header — sections start expanded.
8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm run lint && npm test && npm run build
   ```
   - Expect: every test passes, lint and build clean (166 backend and 155 frontend when this phase landed; current totals are in the header).

**Pass criteria:** an entry with rich annotation fills the rail from UniProt; an entry without a
given category shows no heading for it; an upload explains itself instead of erroring.

---

## P7 — Comparison view (spec A3)

Goal: put an experimental structure and a predicted model of the same protein side by side, and
have every number on the page be either a measurement or an explicit statement that it is not.

1. Start both servers (`start.cmd`, or the two dev commands).
2. Go to `/search` and search `insulin`. One query returns both an **RCSB** experimental entry
   (e.g. `4INS`) and an **AlphaFold** prediction (`P01308`) — this is A3's headline case.
   Import **both**; note each viewer URL's id.
3. From either viewer, click **Compare** in the header.
   - Expect: `/compare?a=<that id>`, and a form asking for the second id with A pre-filled.
   - Paste the other id and submit.
4. Two Mol\* canvases render side by side, each labelled **A** / **B** with its source.
   - Rotate one. Expect: the other does not move — they are independent viewers.
   - Negative case: neither canvas may be blank, and the browser console must show **no**
     "createRoot() on a container that has already been passed to createRoot()" error. That
     duplicate-root error is what two viewers on one page used to cause.
5. Change **Representation** to `Surface`. Expect: both panes change together.
   - Open **Coloring**. Expect **neither** `pLDDT confidence` nor `B-factor` in the list —
     the two structures disagree about what their B-factor column holds, so one shared
     select cannot label it truthfully for both. Import two AlphaFold models instead and the
     option reappears.
6. Read the **Sequence alignment** section.
   - Expect four figures: Identity, Similarity, Alignment length, and Identity over the
     overlap. For 4INS vs P01308 the last is far higher than the first — the crystal form is a
     mature two-chain construct and the model is the full precursor, so the overhang is real.
   - The alignment prints in numbered 60-column blocks with a `|` / `+` / blank match line.
7. Read the **Structural superposition** section.
   - Expect an RMSD in Å with its alpha-carbon pair count, over the chains named in the note.
   - Negative case: if a caveat appears (twilight-zone identity, or a thin fit), it must be
     shown in amber beside the number, never omitted.
8. Read the diff tables. Expect Δ columns of the form `+23` / `−16` / `0`, never an unsigned
   difference, and the composition table sorted by largest difference with a "show all 20" toggle.
   - Expect an amber line under Secondary structure saying structure **B** declares none —
     an AlphaFold model has no assigned secondary structure, so its all-coil split is a
     placeholder rather than a measurement.
9. Negative case: open `/compare?a=<real id>&b=deadbeef`.
   - Expect: `Comparison failed (404): Protein B not found` — naming **which** side — plus the
     id form pre-filled so the bad id can be fixed in place. Not a blank page, not a 500.

**Pass criteria:** two independent viewers render together without a duplicate-root error; the
alignment and RMSD agree about which chains they used; and every absent result — no alignment,
no RMSD, an unmatched chain, an unannotated secondary structure — states its reason on screen.

---

## P8 — Similarity & BLAST

Goal: get homologs instantly from UniRef, run a real BLAST search at EBI, watch it for the
minutes it takes without the UI looking hung, and open a hit in the viewer.

**Requires outbound network** to `rest.uniprot.org` and `www.ebi.ac.uk`. Set
`BLAST_CONTACT_EMAIL` in `backend/.env` first — unset, the backend submits with a fallback
address and logs a warning on every job.

1. Start both servers (`start.cmd`, or the two dev commands).
2. Go to `/search`, search `insulin`, import the **UniProt P01308** card.
3. Click the **Similarity** tab.
   - Expect **Homologs (UniRef)** populated within a second or two: a list of accessions with
     protein name, organism and length, headed by a line reading
     *"Cluster: Insulin · UniRef50, meaning members share at least 50% sequence identity.
     Showing N of 35 cluster members"*.
   - Expect **P01308 itself is not in the list** — a protein is not its own homolog.
   - Expect **no BLAST job started**: the BLAST section shows a form, not a spinner. Opening
     the tab must never spend EBI compute.
4. Click **Open** on any homolog.
   - Expect: navigation to `/viewer/{new-uid}` with that protein loaded.
   - Negative case: a homolog with no AlphaFold model shows an inline red message on the
     section and leaves the rest of the list working. It must not blank the panel.
5. Go back, reopen Similarity, and click **Run blastp at EBI**.
   - Expect within ~2 s: the form is replaced by a progress card reading *Queued* or
     *Running*, with a ticking elapsed timer, EBI's own status sentence, and the job id.
   - Expect the elapsed time to keep advancing. This is the phase's core UI claim: a
     multi-minute wait must never look hung.
6. **While the search is running**, switch to the Analytics tab and back, then reload the page
   outright (F5).
   - Expect: the same job id is still shown and still ticking. A second job must **not** be
     submitted — check the backend log for exactly one `Submitted blastp job` line.
7. Wait for completion (30 s to several minutes).
   - Expect: *Search complete*, the elapsed timer gone, and a results table with columns
     Hit / Description / Identity / E-value / Score.
   - Expect the top hit to be insulin at ~100% identity with E-value `0.0`, and lower hits
     showing values like `5.5e-58` rendered in full, never rounded to `0.00`.
   - Expect a **New search** button.
8. Click **Open** on a BLAST hit.
   - Expect: import and navigation, as in step 4.
   - Expect any hit with no UniProt accession to read *"no structure"* instead of offering a
     button that could only fail.
9. Upload a plain local PDB (`backend/app/static/1CRN.pdb`) and open Similarity.
   - Expect: HTTP 200, no red error, and
     *"Uploaded structures carry no database identifier to map from."*
   - The BLAST form is still offered — an upload has a sequence even with no accession — and
     running it returns real hits for crambin.
10. Tests:
    ```
    cd backend && pytest
    cd frontend && npm ci && npm run lint && npm test && npm run build
    ```
    - Expect: every test passes, lint and build clean (200 backend and 213 frontend when this phase landed; current totals are in the header).

**Pass criteria:** homologs appear without a wait; a BLAST search reports real elapsed progress
and survives a reload without duplicating itself; both result lists open a hit in the viewer.

---

## P9 — Complex viewer

Goal: open a protein that belongs to curated complexes and read the complex's function plus a
participant table with stoichiometry; open one that belongs to none and be told plainly.

1. Start both servers (`start.cmd`, or the two dev commands).
2. Go to `/search`, search `hemoglobin`, import the **UniProt P69905** card (HBA1).
3. In the viewer rail, click the **Complexes** tab.
   - Expect a **Complex** selector reading `1/9`, opening on **Hemoglobin HbA2 complex**
     (`CPX-2419`) — a *curated* complex, not a predicted one.
   - **Function** shows the curated description ("Adult hemoglobin A2 (HbA2) is expressed in
     erythrocytes…").
   - **Participants (3)** table lists `HBD` (2 copies), `heme` — type *small molecule*,
     4 copies — and `HBA1`, which carries the blue **This protein** marker.
   - The accession `CPX-2419` links out to `ebi.ac.uk/complexportal/complex/CPX-2419`.
4. Move the selector to the last entry.
   - Expect a complex flagged **Evidence: Predicted, not curated**, with **no Function
     heading** — predicted complexes carry no curated function text.
   - Expect its participants' Copies column to read `n/a`: Complex Portal curates no
     stoichiometry for these, and the table must not invent one.
5. Import **UniProt P01308** (insulin) and open Complexes.
   - Expect **7** complexes, and the footer line *"2 further record(s) name this accession in
     their description without containing the protein, and are not listed."*
   - Negative case: `CPX-26675` / `CPX-16536` (the insulin *receptor* complexes) must **not**
     appear. They name "Insulin (P01308)" in their description but contain no insulin.
6. Import **UniProt P06213** (INSR) and open Complexes.
   - Expect `CPX-16536` present and curated, with the **This protein** marker on the
     `P06213-PRO_…` mature-chain rows — the protein participates as PRO chains, not under its
     bare accession.
7. Upload a plain local PDB (e.g. `backend/app/static/1CRN.pdb`) and open Complexes.
   - Expect: HTTP 200, no red error, and *"Uploaded structures carry no database identifier to
     map from."*
   - Negative case: this must never be a 500 or an error state.
8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm run lint && npm test && npm run build
   ```
   - Expect: every test passes, lint and build clean (241 backend and 236 frontend when this phase landed; current totals are in the header).

**Pass criteria:** a protein in curated complexes shows the complex's function and a participant
table with stoichiometry; complexes that merely mention the accession are excluded and accounted
for; predicted complexes are labelled as predicted; a protein in none explains itself instead of
erroring.

---

## P10 — Interface density and the left rail

Goal: the left rail is a working chain tree that highlights into the 3D view, the analytics donut
stops reporting "100% coil" for structures that declare no secondary structure, and the landing
page describes the app that exists.

Run at a window width of at least 1280px (`xl`) — the left rail is xl-only.

1. Start both servers (`start.cmd`, or the two dev commands).
2. Open `/` and read the left rail.
   - Expect the badge to read **no structure**, not `empty`.
   - Expect three working entry points: **Open the demo structure** (`/viewer/demo`),
     **Search the databases** (`/search`), **Drop a PDB or mmCIF file** (`#upload`).
   - Expect the right rail to preview **five** tabs — Overview, Sequence, Analytics,
     Annotations, Complexes — matching the viewer's rail exactly.
   - Expect a **Wired to** strip under the drop zone naming RCSB PDB, AlphaFold DB, UniProtKB
     and Complex Portal.
3. Go to `/search`, search `insulin`, import the **RCSB 4INS** card (4 chains).
4. Read the left rail in the viewer.
   - Expect four rows — `A 21 aa 21%`, `B 30 aa 29%`, `C 21 aa 21%`, `D 30 aa 29%` — each
     with a residue-class composition bar, and a header reading `4 chains · 102 aa`.
   - Expect the rows to be **open** (four chains is at or under the collapse threshold), showing
     per-class counts and ordinal-range chips.
5. Click the **B** row.
   - Expect the header to read `30 selected`, the B row to show `30 sel`, and chain B to
     highlight in the 3D view.
6. Click chain B's `26–30` chip.
   - Expect `5 selected`, and exactly five residues highlighted in 3D.
   - Open the **Sequence** tab: expect exactly those five B-chain cells to read as selected.
     This is the check that the rail uses the one shared selection and not a second mechanism.
7. Open the **Analytics** tab on 4INS.
   - Expect a helix/sheet/coil donut and **no** amber warning — 4INS declares real secondary
     structure (54.9% helix / 5.9% sheet).
8. Import **AlphaFold P01308** and open its **Analytics** tab.
   - Expect a single neutral ring legended **Not annotated**, carrying no percentage.
   - Expect the amber note *"This structure declares no secondary structure, so the ring above is
     an all-coil placeholder and not a measurement."*
   - Negative case: the legend must **not** read `Coil (100%)`. That was the shipped bug — the
     API had been reporting `available: false` and the donut ignored it.
9. Check the other four tabs on the same protein still render (Overview, Sequence, Annotations,
   Complexes) and that the page does not scroll horizontally at 900px wide.
10. Tests:
    ```
    cd backend && pytest
    cd frontend && npm ci && npm run lint && npm test && npm run build
    ```
    - Expect: every test passes, lint and build clean (241 backend and 285 frontend when this phase landed; current totals are in the header).

**Pass criteria:** clicking a chain or a residue range in the left rail highlights those residues
in Mol\* and in the sequence panel; a structure with no secondary-structure assignment says so
instead of reporting an all-coil measurement; the landing page's rail preview matches the viewer's
actual tabs.

---

## A5 — Functional regions and binding pockets

Goal: curated active and binding sites land on the residues the file really contains, bound
ligands report the residues they touch, and everything that cannot be placed says so instead of
being placed anyway. Runs in the **Annotations** tab — A5 has no rail tab of its own.

1. Start both servers (`start.cmd`, or the two dev commands).
2. Go to `/search`, search `EGFR`, import the **AlphaFold P00533** card, and open **Annotations**.
   - Under **Active sites**, expect one entry labelled `UniProt 837`, chip **`DA:837`**, badged
     `inferred` (ECO:0000255 is a PROSITE rule, not an observation).
   - Under **Ligand-binding sites**, expect four ATP entries badged `experimental`:
     `UniProt 718-726` (nine chips, `A:718`-`A:726`), `745`, `790-791`, `855`.
     Those are the GxGxxG P-loop, the catalytic lysine K745, the gatekeeper T790 and the DFG
     aspartate D855.
   - Expect **no Bound ligands section**, and the note *"No non-water ligand is present in this
     file, so no binding pocket is observed here."*
   - Negative case: the tab must **never** show a "predicted pocket". The notes must contain
     *"ProteoLens does not predict pockets in a structure that has no bound ligand."*
3. Click chip `A:790` and check the 3D view.
   - Expect exactly that residue highlighted in Mol\*, and the Sequence tab's residue 790
     highlighted too — the chip drives the same `setSelection` everything else does.
4. Import **RCSB 1HVR** (HIV-1 protease with a cyclic-urea inhibitor) and open Annotations.
   - This is the offset case: UniProt P04585 is a 1435-residue polyprotein.
   - Under **UniProt position mapping**, expect both chains mapped, each reading
     *"UniProt 489-587 covers chain A residues 1-98 (numbered 1-99 in the file)"*.
   - Under **Active sites**, expect `UniProt 513` placed on **`DA:25`** and **`DB:25`** — the
     catalytic Asp25/Asp25' dyad. Not residue 513, and not residue 25 by luck.
   - Under **Bound ligands**, expect `XK2 263 (chain A)` with ~23 contacts, `A:25` closest at
     2.86 Å, including the `I50`/`I50'` flap tips.
   - Under **High-priority residues**, expect `A:25` and `B:25` at the top with
     *"1 residue is both curated…"*-style convergence text and both a curated and a contact
     reason.
   - Expect the footer note *"27 curated site(s) exist for this protein but could not be placed
     in this structure."* — the Mg(2+) sites belong to the RT and integrase domains.
5. Import **RCSB 4INS** (insulin) and open Annotations.
   - Expect **two different offsets in one file**: chain A mapped to UniProt 88-108, chain B to
     25-54.
   - Expect two `ZN` ligands, each contacting a single **`HB:10`** / **`HD:10`** at ~2.1 Å.
   - Expect no curated sites at all, and none invented: P01315 carries no site features.
6. Open **Surface hydrophobicity and charge** on any of the above.
   - Expect one row per chain with Net charge, Surface charge, Mean KD and Surface KD, and the
     note naming Shrake-Rupley over the polymer alone.
7. Upload a plain local PDB (`backend/app/static/1CRN.pdb`) and open Annotations.
   - Expect HTTP 200, no red error, the notice *"No UniProt annotations for this structure…
     What follows is measured from the coordinate file itself"*, and the surface table below it.
   - Negative case: this must not be an empty dead end and must not be a 500.
8. Stop the backend and reload the tab.
   - Expect the panel to report the failure, not to render half a payload.
9. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm run lint && npm test && npm run build
   ```
   - Expect: every test passes, lint and build clean (475 backend and 387 frontend when this phase landed; current totals are in the header).

**Pass criteria:** every curated position is placed on the residue the literature names, or is
refused in words; every ligand contact is measured from the file; nothing anywhere is labelled a
predicted pocket.

---

## Compounds — non-protein components bound to the protein

Goal: DNA/RNA, ligands, cofactors, ions, glycans, free amino acids, modified residues and
crystallisation additives are each reported in the **Compounds** tab with the protein residues they
touch, and a nucleic-acid strand is never analysed as protein.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Import **RCSB 1TSR** (p53 core domain bound to DNA), or upload its mmCIF.
   - Overview: expect *Protein chains 3*, a *Nucleic acids: Chain E, F · see Compounds* row, and the
     parser warning *"Nucleic-acid chains reported as compounds, not protein: E, F"*.
   - Negative case: there must be **no** *"Non-standard residues replaced with 'X': DA, DC, DG, DT"*
     warning, and the chain tree must list A, B and C only (585 aa in total).
3. Open **Compounds**.
   - Under **Nucleic acids**, expect two `DNA` strands, `E` = `TTTCCTAGACTTGCCCAATTA` and
     `F` = `ATAATTGGGCAAGTCTAGGAA`, each *21 nt · GC 38%*, with 13 and 9 protein contacts.
   - Under **Ions**, expect `ZN ZINC ION ×3`, each with 4 contacts: H179, C176, C238 and C242 (the p53
     zinc site; chips read `HA:86`, `CA:83`, `CA:145`, `CA:149` for chain A in ordinals).
   - Click chip `RB:178`: it turns blue (selected) and the selection count in the header reads 1.
4. Import **RCSB 4HHB** (haemoglobin): expect **Cofactors & nucleotides** with
   `HEM PROTOPORPHYRIN IX CONTAINING FE ×4`, 616.5 Da, each with 14-16 contacts, and **Additives**
   (collapsed by default) with `PO4`.
5. Import **RCSB 1HSG** (HIV protease + indinavir): expect **Ligands** with `MK1` and 26 contacts.
6. Upload `backend/app/static/1CRN.pdb`: expect the note *"This structure contains no non-protein
   components other than water…"* and no sections.
7. Upload a PDB file containing only a DNA strand: expect HTTP 400 with *"The structure contains
   nucleic-acid chains (B) but no protein chain…"*, not the generic parse error.
8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm run lint && npm test && npm run build
   ```
   - Expect: every test passes, lint and build clean (578 backend and 447 frontend when this phase landed; current totals are in the header).

**Pass criteria:** every non-water hetero group and every nucleic-acid strand appears exactly once in
the right category; every contact is a measured distance in this file and selects in 3D; protein
analytics no longer see DNA.

---

## P11 — CI, Docker and SQLite persistence

Goal: loaded proteins survive a backend restart, the landing page lists them, both services run
under `docker compose`, and every pull request runs the same checks a contributor runs locally.

1. Start both servers. Upload `backend/app/static/1CRN.pdb` and note the `/viewer/<id>` URL.
2. Go back to `/`. Expect a **Recent structures** list in the landing rail with the upload at the
   top, its second line reading `46 residues · 1 chain · uploaded`. Clicking it opens
   `/viewer/<id>`.
3. `curl "http://localhost:8000/api/proteins?limit=5"`: HTTP 200, a JSON list, newest first, whose
   first entry has the same `id`. The table lives at `backend/storage/proteolens.db` unless
   `PROTEOLENS_DB` points elsewhere.
4. Stop the backend and start it again. Reload `/viewer/<id>`: the structure loads with the same
   overview metrics, and `GET /api/proteins/<id>` is a 200, not a 404.
5. Start the backend with `PROTEOLENS_DB` set to a new, empty path. `GET /api/proteins` returns
   `[]` and the landing rail shows no **Recent structures** heading at all (an empty list renders
   nothing). Unset it again afterwards.
6. Negative case: stop the backend and reload `/`. The pill reads **Backend unreachable** and the
   recent list is simply absent; the page does not error.
7. Docker (needs a running Docker daemon):
   ```
   docker compose up --build
   ```
   - Expect the backend on port 8000 and the frontend on port 3000. Open `http://localhost:3000`:
     **Backend OK**, upload works.
   - `docker compose down` then `docker compose up` again: the upload is still listed, because
     structures and the protein table live in the `proteolens-data` volume.
     `docker compose down -v` removes the volume and the list starts empty.
8. CI: open a pull request. Expect the **CI** workflow with two jobs: `backend` (`ruff check app
   tests`, then `pytest -q`, on Python 3.12) and `frontend` (`npm ci`, `npm run lint`, `npm test`,
   `npm run build`, on Node 20). Both must be green.
9. Tests:
   ```
   cd backend && ruff check app tests && pytest tests/test_registry.py
   cd frontend && npx vitest run components/__tests__/recent-proteins.test.tsx
   ```
   - Expect: 4 backend and 2 frontend tests pass.

**Pass criteria:** a restart loses nothing that was loaded; the landing page lists recent
structures and hides the list when there are none; `docker compose` keeps data across a restart;
CI runs lint, tests and build for both halves.

---

## P12 — Structural variant impact

Goal: type a protein change and see where it sits in the structure, what it touches and which
structural rules of thumb it trips, with the position mapped through UniProt when an entry exists.
No pathogenicity score is ever shown.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Upload `backend/tests/fixtures/1HEW.pdb` (hen lysozyme with bound NAG) and open the **Variants**
   tab. Expect a **Protein variant** box, an **Analyse** button that stays disabled while the box is
   empty, and **Try:** chips for `R175H`, `p.Gly12Cys`, `W53*` and `F508del`.
3. Enter `L56R` and click **Analyse**. Expect:
   - the heading `p.Leu56Arg`, `missense`, and a `high concern` badge;
   - a site card for `A:56` marked `buried` with its accessible percentage, the flags *"Places a
     charged side chain in the buried core, which is usually destabilising."* and *"Touches bound
     NAG; binding or catalysis may be affected."*, and a **Neighbours within 4.5 Å** chip list;
   - Volume, Hydropathy and Charge rows (charge `0 → +1`);
   - A:56 selected and highlighted in 3D.
   - Because an upload carries no UniProt accession, the notes say the position was read as this
     file's own residue number, and always include *"These are structural rules of thumb measured
     from this file, not a pathogenicity prediction."*
4. More notations on the same upload:
   - `C6S`: flag *"Breaks the disulfide bond to A:127."*
   - `W62*`: kind `nonsense` and *"68 residues of this chain are never made."*
   - `E35=`: `low concern`, flag *"No amino-acid change; the protein is unchanged."*
5. Negative cases (each a 422 with the reason shown in red, never a blank panel):
   - `banana` → *"Could not read 'banana'. Use a protein change such as R175H, p.Arg175His, W53* or
     F508del."*
   - `A35Q` → *"Residue 35 in this file is Glu (A:35), not Ala…"*
   - `A999G` → *"No residue numbered 999 in this file."*
6. UniProt numbering: from `/search`, import **RCSB 1HEW** and open **Variants**. Enter
   `p.Glu53Gln`. Expect the site to land on `A:35` (UniProt P00698 counts an 18-residue signal
   peptide), the note *"Position mapped through a global alignment of the UniProt sequence to each
   chain…"*, a UniProt curated-site flag and `high concern`. Now enter `E35Q`: a 422, *"UniProt has
   Leu at position 35, not Glu. Check the position and the isoform."* The residue is never silently
   moved.
7. With UniProt unreachable, the same import falls back to the file's numbering and adds
   *"UniProt could not be reached; the file's own numbering was used."* to the notes.
8. API check: `POST /api/proteins/<id>/variant` with `{"notation": "E35Q", "chain": "Z"}` on the
   upload is a 422 naming chain `'Z'`; an unknown protein id is a 404.
9. Tests:
   ```
   cd backend && pytest tests/test_variant.py
   cd frontend && npx vitest run components/__tests__/variant-panel.test.tsx
   ```
   - Expect: 31 backend and 2 frontend tests pass.

**Pass criteria:** the variant lands on the right residue under either numbering and is selected in
3D; a wrong reference residue is refused with the reason; every flag is a measured, plain-language
statement and no response carries a pathogenicity score.

---

## P13 — Report and export

Goal: one click in the viewer gives a printable A4 report of the structure, with a snapshot of the
3D view, plus JSON and CSV downloads of the same data.

1. Start both servers. Upload `backend/app/static/1CRN.pdb` and wait for the structure to render.
   Rotate it to a view you will recognise.
2. Click **Report** in the viewer header (disabled until the viewer is ready). Expect
   `/report/<id>`, *Building report…* briefly, then a white A4 page headed **ProteoLens structure
   report** with the protein's name and a *generated* timestamp, whatever theme the app is in.
3. **Structure** section: the snapshot shows the view you left, beside facts that include
   `Residues 46`, `Atoms 327`, `Molecular weight 4736 Da`, `File format PDB` and `B-factor column
   Temperature factors`.
4. **Analytics** shows amino-acid composition and secondary-structure charts. **Sequences** shows
   `Chain A · 46 residues` and the sequence in numbered blocks of ten starting `TTCCPSIVAR`.
   No **Biology (UniProt)** section for an upload, since nothing resolves.
5. Downloads in the toolbar above the page:
   - **JSON** saves `<id>-proteolens.json`.
   - **Composition CSV** saves `<id>-composition.csv` with header `amino_acid,name,count,percent`.
   - **Hydropathy CSV** saves `<id>-hydropathy.csv` with header
     `chain,position,kyte_doolittle,window`.
   For an imported entry the file stem is the source id instead (for example `P68871-…`).
6. Click **Print or save as PDF** and print to PDF. The PDF holds only the paper: no toolbar, no
   theme toggle, no background grid or scanlines, and white page margins.
7. Import **AlphaFold P68871** and open its report: a **Biology (UniProt)** section appears, the
   facts list `UniProt P68871`, and `B-factor column` reads `pLDDT confidence`.
8. Negative cases:
   - Open `/report/<id>` directly in a new tab: the page still renders, with the note *"Open this
     report from the viewer's Report button to include a snapshot of the 3D view."* in place of the
     picture.
   - If analytics fail, the report still shows structure facts and sequences, and the two CSV
     buttons are not offered.
   - `/report/<unknown id>`: a red *Protein not found* and a **Back to ProteoLens** link.
9. **Back to viewer** returns to `/viewer/<id>`.
10. Tests:
    ```
    cd frontend && npx vitest run app/__tests__/report.test.tsx lib/__tests__/report.test.ts
    ```
    - Expect: 8 tests pass.

**Pass criteria:** the report shows the view the user was looking at; it prints as clean paper in
any theme; the downloads open in a spreadsheet with the headers above; a missing snapshot or failed
analytics degrades the page instead of breaking it.

---

## P14 — Sequence tools

Goal: `/tools` takes one DNA sequence and runs an ORF finder, a restriction map, PCR primer design
and SpCas9 guide design on it, all offline on the backend.

1. Start both servers. On the landing page click **DNA tools**: expect `/tools` headed **Sequence
   tools** with a **DNA sequence (plain or FASTA)** box, **Target start** / **Target end**, **Min ORF
   (codons)** set to 30, a **Circular (plasmid)** checkbox, **Load example** and **Analyse**.
2. Click **Analyse** with the box empty: *"Paste a DNA sequence or load the example first."* and no
   request is sent.
3. Click **Load example** (an 843 nt synthetic construct: an ORF at 181-426 followed by a pUC-style
   cloning site). Set Target start `200` and Target end `300`, then **Analyse**. All four tabs fill.
4. **ORFs (3)**: frame `+1` at `181..426` (81 aa, starting `MWTFDKLD`), frame `+2` at `203..661`
   (152 aa), and frame `+2` at `749..841` marked *(no stop)*. A **Six-frame translation** disclosure
   sits under the table.
5. **Restriction (9 unique)**: the 31-enzyme panel finds single cuts for BamHI, EcoRI, KpnI, PstI,
   SacI, SalI, SmaI, SphI and XbaI, all inside the cloning site; EcoRI's site reads `G^AATT_C` with
   fragments `547 + 296`; HindIII cuts twice. Tick **Circular (plasmid)** and analyse again: EcoRI
   now gives a single `843` fragment.
6. **Primers (5)**: every forward primer ends before 200 and every reverse primer starts after 300,
   each with Tm, GC and product size; the notes say Tm is nearest-neighbour (SantaLucia 1998) and
   the ranking is not Primer3.
7. **CRISPR (14)**: SpCas9 (NGG) guides whose cut sites all fall within 200-300, each with a
   20 nt protospacer, its PAM, strand, GC and flags. The notes say off-targets are only counted
   within the submitted sequence.
8. Negative cases (each a 422 from the backend, shown as the backend's reason):
   - Paste `MKVLAAGIW`: *"Only A, C, G, T (or U) and N are accepted; found … Is this a protein
     sequence?"*
   - A target past the end, e.g. 900-1000 on the example: *"The target 900-1000 is outside the 843
     nt sequence."*
   - `POST /api/tools/restriction` with `"enzymes": ["Nope"]`: *"Unknown restriction enzyme
     'Nope'."*
   - FASTA headers, spaces, line numbers and `U` are accepted (U is read as T).
9. Tests:
   ```
   cd backend && pytest tests/test_seqtools.py
   cd frontend && npx vitest run app/tools/__tests__/tools-view.test.tsx lib/__tests__/seqtools.test.ts
   ```
   - Expect: 30 backend and 8 frontend tests pass.

**Pass criteria:** one paste drives all four tools; coordinates are 1-based on the forward strand;
primers flank and guides cut inside the target; bad input gets a plain reason, never a 500.

---

## P15 — Surface electrostatics

Goal: the Analytics tab shows a Coulombic estimate of each residue's surface potential, net charge,
pI, dipole and charged surface patches, and the structure can be coloured red-white-blue by it.

1. Start both servers. Upload `backend/tests/fixtures/1HEW.pdb` (hen lysozyme, a basic protein)
   and open **Analytics**.
2. Scroll to **Surface electrostatics**. After *Computing surface potential…*, expect
   **Net charge** `+8.1 e`, **pI** about `9.32` and a **Dipole** in debye, then a red-to-blue
   legend in kcal/(mol·e) and a per-residue profile for chain A.
3. **Charged surface patches**: four entries, each blue and labelled `Basic · N residues · +x`,
   with the residues listed and *"Basic patch: a candidate surface for DNA/RNA, heparin or acidic
   partners."* No acidic patch on lysozyme. Clicking a patch selects those residues in 3D.
4. Click a bar in the profile: that one residue is selected.
5. Click **Colour structure by potential**. The button turns to **Showing on structure**, the
   viewer's *Coloring* select reads **Electrostatic potential**, and the structure is painted
   red-white-blue on the same scale as the legend (lysozyme shows far more blue than red).
   Click it again to go back to chain colouring.
6. With **Electrostatic potential** chosen, switch *Representation* to **Surface** and back to
   cartoon: the colouring stays on the potential instead of resetting.
7. Read the notes: the first says this is a Coulombic estimate with a distance-dependent dielectric
   (4r) and *not* a Poisson-Boltzmann result.
8. Negative cases: `GET /api/proteins/nope/electrostatics` is a 404. The endpoint needs nothing
   external, so it works with the network unplugged.
9. Tests:
   ```
   cd backend && pytest tests/test_electrostatics.py
   cd frontend && npx vitest run components/__tests__/electrostatics-panel.test.tsx lib/__tests__/electrostatics.test.ts
   ```
   - Expect: 6 backend and 7 frontend tests pass.

**Pass criteria:** a basic protein reads positive with blue patches; the colouring follows the
legend and survives a representation change; the response says plainly what model it used.

---

## P16 — Explain assistant

Goal: an **Explain** sheet in the viewer header answers questions about the open structure, or the
current selection, at school, undergraduate or expert level, and shows the measured facts the answer
was grounded in. The key never leaves the backend.

Needs a chat-completions compatible endpoint. In `backend/.env` (see `backend/.env.example`) set
`EXPLAIN_API_URL` (the full `.../chat/completions` URL), `EXPLAIN_API_KEY` and `EXPLAIN_MODEL`, then
restart the backend.

1. First, run with none of the three set. Upload `backend/tests/fixtures/1HEW.pdb`, click
   **Explain**, then the **Explain** button in the sheet. Expect an amber message that the Explain
   assistant needs `EXPLAIN_API_URL and EXPLAIN_API_KEY and EXPLAIN_MODEL` set in the backend's
   environment; `POST /api/proteins/<id>/explain` is a 503. Set only the URL and key: the message
   now names `EXPLAIN_MODEL` alone. Everything else in the viewer keeps working.
2. Set all three and restart. Open **Explain** on the same upload. The sheet is titled **Explain
   this structure**, offers **School / Undergraduate / Expert** (Undergraduate chosen) and reads
   *"Ask anything, or leave the box empty for an overview."*
3. Leave the question empty and click **Explain**. Expect an answer in paragraphs or bullets, the
   button turning to **Ask again**, and a **Grounded in N measured facts · <model>** disclosure whose
   list includes the residue count (129 residues for 1HEW).
4. Select residue A:35 (Glu35) in the sequence panel, pick **School**, ask *"Why is E35
   important?"*. The sheet description reads *"Focused on the 1 selected residue."* and the facts
   include a line starting *"The user has selected"* that names `E35 (chain A)`.
5. Confirm the key is server-side only: in the browser's network tab the request goes to
   `/api/proteins/<id>/explain` on the backend, and no request or response carries the key.
6. Negative cases:
   - A wrong key: a 502 whose message starts *"The model API answered 401"* with the provider's
     reason.
   - An unreachable URL: a 502, *"Could not reach the model API: …"*.
   - `{"level": "phd"}` in the body is a 422; an unknown protein id is a 404.
7. Tests:
   ```
   cd backend && pytest tests/test_explain.py
   cd frontend && npx vitest run components/__tests__/explain-sheet.test.tsx lib/__tests__/explain.test.ts
   ```
   - Expect: 7 backend and 5 frontend tests pass (the model API is mocked).

**Pass criteria:** without configuration the sheet says exactly which variables to set; with it, an
answer arrives at the chosen level, focused on the selection, with its facts listed; upstream
failures are a plain 502 message.

---

## P19 — Structure prediction from a sequence

Goal: a pasted protein sequence is folded by ESMFold and opens in the viewer as a predicted model with
pLDDT colouring. Needs a machine that can reach `api.esmatlas.com`.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. On the landing page, click **Predict a structure**: expect `/predict` with an empty
   *Protein sequence* box, a counter reading *0 / 400 aa* and **Predict structure** disabled.
3. Click **Load example**: expect ubiquitin (76 residues) and the name *Ubiquitin (ESMFold)*.
4. Click **Predict structure**: expect *Folding…* for a few seconds, then the viewer at
   `/viewer/<id>` with the name *Ubiquitin (ESMFold)*, a **PREDICTED** badge and pLDDT colouring.
   The Confidence tab shows bands with most residues *Very high* or *Confident*.
5. Negative cases on `/predict`:
   - Paste `ATGGCCATTGTAATGGGCCGC`: expect *"This looks like DNA or RNA. Translate it first…"*.
   - Paste `MKTAYIAKQRQISFVKSHFSRQ1`: expect *"Only the 20 standard amino-acid letters…"* naming `'1'`.
   - Paste 401 residues: the counter reads *401 / 400 aa* and the button stays disabled.
6. With the network to ESM Atlas blocked, folding must fail with a 502 and the message
   *"Could not reach the ESMFold service."*, not a blank page.
7. Tests:
   ```
   cd backend && pytest tests/test_predict.py
   cd frontend && npx vitest run app/__tests__/predict.test.tsx
   ```
   - Expect: 15 backend and 4 frontend tests pass.

**Pass criteria:** a valid sequence becomes a viewable model with confidence colouring; invalid input
and upstream failures give a plain message.

---

## Clinical evidence — ClinVar, gnomAD and AlphaMissense on the structure (A2, clinical half)

Goal: the **Clinical** tab lists what variant databases say about each position, every variant
lands on the right residue of the loaded file, and the structure can be painted by AlphaMissense
or by pathogenic burden.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Import **AlphaFold P68871** (haemoglobin beta). Open **Clinical**.
   - Header: *HBB P68871*, ~760 reported variants, 147 positions placed on this structure.
   - Diseases: *beta Thalassemia (BTHAL)* first.
   - Type `E7V` in the variant search: one row, `p.Glu7Val`, **Pathogenic**, *Sickle cell anemia*.
     Click `E7V`: the header reads *1 selected* and residue A:7 (Glu) is highlighted in 3D.
3. Click **AlphaMissense**: the toolbar's colouring select reads *AlphaMissense*, the legend shows
   three bands, and the structure turns blue/grey/red. Click it again: back to the toolbar scheme.
   Pick any scheme from the toolbar while painted: the overlay clears.
4. Import **RCSB 2OCJ** (p53 core domain, four chains, numbering starts at 94). Open **Clinical**.
   - Search `R175H`: **Pathogenic**, AM residue 0.99. Click it: four residues are selected
     (`A:80`, `B:80`, `C:80`, `D:80` — ordinal 80 is auth residue 175 in every chain).
   - **Pathogenic burden** paints the DNA-binding loops dark red.
5. Upload `backend/app/static/1CRN.pdb`: expect *No clinical variant evidence for this structure*
   with the reason that an upload has no accession.
6. Negative case: with the network to `www.ebi.ac.uk` blocked, the tab shows *Clinical evidence
   failed* and a **Try again** button; with only `alphafold.ebi.ac.uk` blocked the variants still
   show and **AlphaMissense** is disabled with a note.
7. Tests: `cd backend && pytest tests/test_clinical.py`, `cd frontend && npm test -- clinical`.

**Pass criteria:** every itemised variant names its sources, AlphaMissense is labelled a residue
mean, and no variant is placed on a residue the alignment did not map.

---

## Oncology — hotspots, TCGA, drugs, CIViC, pathways (A2, oncology layer)

Goal: the **Oncology** tab answers "where do tumours mutate this protein, what targets it, and
what does the clinical literature say", and every position lands on the right residue.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Import **RCSB 6OIM** (KRAS G12C + sotorasib). Open **Oncology**. The first load queries six
   services and can take ~15-30 s (ChEMBL is the slow one); a reload is served from cache.
   - Header: *KRAS P01116*, *Mutated in 763 of 10,967 tumours across 32 TCGA PanCancer studies*,
     six green source chips.
   - Lollipop: the tallest head is labelled `G12D`; `G13D`, `Q61H` and `A146T` are labelled too.
   - Hotspots: `G12` first with ~2,175 tumours. Click it: *1 selected*, residue `A:13`
     (6OIM numbers from Gly0, so UniProt 12 is ordinal 13, auth 12).
   - Cancer types: *Pancreatic Adenocarcinoma 64%* first.
   - Drugs: **Sotorasib** and **Adagrasib**, both *G12C-specific*, *approved*.
   - CIViC: level-A items first; clicking `KRAS G12C` selects `A:13`.
3. Click **Tumour hotspots**: G12 turns dark red next to the bound drug, G13/Q61 orange, the rest
   grey; the toolbar reads *Tumour hotspots*. **TCGA mutation density** shades every mutated residue.
4. Negative case: with `civicdb.org` blocked, the CIViC chip reads *CIViC · unavailable*, a note
   says so, and every other section still renders.
5. Upload `backend/app/static/1CRN.pdb`: *No oncology context for this structure*.
6. Tests: `cd backend && pytest tests/test_oncology.py`, `cd frontend && npm test -- oncology`.

**Pass criteria:** each section names its source; a position whose reference residue differs
from UniProt is listed but never painted.

---

## Neoantigens — HLA class I candidates from a tumour mutation

Goal: for a missense change, list the mutant peptides predicted to be presented on HLA class I,
each beside its wild-type peptide, and paint them on the structure.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Import **RCSB 6OIM** (KRAS G12C with sotorasib). Open **Neoantigens**.
3. Enter `G12C` and keep the default alleles (A*02:01, A*03:01, A*11:01, A*24:02). Click **Predict**.
   Expect the spinner text *"This takes about a minute"*, then *"KRAS G12C: 4 binders among 152 mutant
   peptides on 4 alleles."*
4. Expect the first candidate `VVGACGVGK` on `HLA-A*11:01`, *weak · 0.5%*, the `C` highlighted,
   *"wild type VVGAGGVGK 0.2% · wild type binds better · change faces the T-cell receptor"*; then
   `VVVGACGVGK` on A*11:01 and A*03:01.
5. Click the first candidate: the header reads *9 selected* (ordinals A:9-A:17, UniProt 8-16).
6. Click **Neoantigen epitopes**: the peptide residues turn amber and residue 12 (ordinal 13) violet,
   with the legend shown and the toolbar reading *Neoantigen epitopes*.
7. Negative cases:
   - `A12C` → *"Residue 12 is Gly in UniProt, not Ala."* (HTTP 400).
   - `G12` or `G12*` → **Predict** stays disabled; the API answers 400.
   - IEDB unreachable → *"IEDB's prediction service did not answer. Try again."* (HTTP 502).
8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm test && npm run build
   ```
   - Expect: every test passes, build clean (627 backend and 482 frontend when this phase landed; current totals are in the header).

**Pass criteria:** every candidate contains the mutated residue; each sits beside the wild-type
peptide at the same start; a wrong reference residue is refused rather than scored.

---

## Conservation — evolutionary conservation painted on the structure

Goal: every residue scored by how strongly homologues keep it, shown along the sequence and painted
on the structure from variable (turquoise) to conserved (maroon).

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Import **RCSB 6OIM** (KRAS G12C). Open **Conservation**.
3. Expect *"P01116: 189 positions, mean 0.7 bits; 166 sit on residues in this structure."*, a bar
   strip with the tallest maroon bars near the start (residues 10-16), and **Most conserved residues**
   starting `G10 2.8`, `G15 2.7`, `K16 2.6`, `D119 2.3`, `D57 2.1`.
4. Click `K16`: the header reads *1 selected* (ordinal A:17).
5. Click **Conservation** under *Paint 3D by*: the P-loop and the strands around the bound nucleotide
   turn maroon, surface helices turquoise; the toolbar reads *Conservation* and the legend shows
   0 bits / 1 bit / ≥2.5 bits.
6. Hover a bar in the strip: the tooltip reads e.g. *"G10: 2.85 bits, G in 81%"*.
7. Negative cases:
   - Upload `backend/app/static/1CRN.pdb` (no accession): expect *"No conservation profile for this
     structure."* with the reason.
   - PDBe unreachable: the tab shows *"Conservation failed: Could not reach PDBe or UniProt…"* and
     **Try again** (HTTP 502).
8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm test && npm run build
   ```
   - Expect: every test passes, build clean (635 backend and 491 frontend when this phase landed; current totals are in the header).

**Pass criteria:** the GTPase motifs rank at the top; colours use a fixed bits scale; a profile for
another sequence version is refused rather than painted.

---

## Docking — AutoDock Vina into a crystal pocket or selected residues

Goal: dock a SMILES into the structure, rank Vina's poses, show each in 3D, and prove the setup by
redocking a crystal ligand onto its own pose.

1. Install Vina once: `cd backend && python scripts/install_vina.py` (downloads the 1.2.7 binary
   into `backend/bin/`). Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. Import **RCSB 1HSG** (HIV-1 protease with indinavir). Open **Docking**.
3. Expect *Dock into* to offer the **MK1** pocket (chain B 902) and *Selected residues (0)*, with the
   SMILES box prefilled with indinavir and the note *"This is MK1 itself, so poses are scored
   against its crystal pose."*
4. Keep *Standard (8)* and click **Dock**. Expect *"Vina is searching…"*, then after one to three
   minutes: *"MK1 site, chain B: 9 poses"*, *"Best score -10.5 kcal/mol (very strong)"* and, in
   green, *"Top pose is 0.78 Å from the crystal pose: the crystal binding mode is reproduced."*
   The amber pose sits on top of the crystal indinavir, and the camera zooms to it.
5. Click pose **2**: it replaces pose 1 in 3D and its contact residues are selected (about 29,
   including Asp25 of both chains). **Hide pose** removes it.
6. Choose *Selected residues*, edit the SMILES to aspirin `CC(=O)Oc1ccccc1C(=O)O`, and dock: poses
   list contacts instead of crystal RMSD.
7. Negative cases:
   - SMILES `C1CC`: *"Docking failed: RDKit could not read that SMILES."* (HTTP 400).
   - *Selected residues* with nothing selected: **Dock** is disabled with a hint.
   - No Vina binary (`VINA_BINARY=/nonexistent`): the tab reads *"Docking needs AutoDock Vina."*
     with the install command, and `POST /dock` is a 503.
8. Tests:
   ```
   cd backend && pytest
   cd frontend && npm ci && npm test && npm run build
   ```
   - Expect: every test passes, build clean (655 backend and 503 frontend when this phase landed; current totals are in the header).

**Pass criteria:** the redock reproduces the crystal pose within 2 Å; a pose never changes the
protein's representation or colouring; the app works without Vina installed.

---

## Central Dogma Explorer — one variant from chromosome to protein

Goal: `/explore` follows a disease variant through five zoom levels, every base and coordinate read
from Ensembl (GRCh38), and hands off to the 3D viewer with the variant residue selected.

1. Start the backend with `CORS_ORIGINS=http://localhost:3000` and the frontend.
2. From the landing page, click **Explore DNA**. Expect `/explore`, the **Sickle cell disease** chip
   active, and *"HBB sits on chromosome 11, band 11p15.4"* over a 24-chromosome karyotype with
   chromosome 11 outlined and a red HBB mark near its top (the p arm end).
3. **2. Gene**: expect *"Its canonical transcript, ENST00000335295, has 3 exons. The variant falls in
   exon 1"*, the gene drawn 5' to 3' with a `c.20A>T` marker in exon 1, and the note that HBB is read
   from the minus strand.
4. **3. DNA**: an animated helix of codons 4-10 with one base ringed in red. Toggle **Normal GAG** /
   **Mutant GTG**: the ringed base flips A/T. Expect *"chr11:5,227,002 T>A, the complement, because
   HBB is read from the minus strand"*. With the OS set to reduce motion, the helix stands still.
5. **4. mRNA → protein**: click **Next codon** once (AUG → M in both rows), then **Translate all**.
   Expect codon 7 outlined in both rows, `E` in Normal and `V` in Mutant, and *"Codon 7: GAG → Glu
   becomes GUG → Val. A missense change, p.Glu7Val."*
6. **5. 3D protein**: the four-step story, then **Open in 3D at residue 7**. Expect
   `/viewer/<id>?select=A%3A7`, the AlphaFold model of P68871 (147 residues), *"1 selected"* in the
   header and residue 7 highlighted and centred.
7. Click **TP53 R175H** and **KRAS G12C**: each loads its own gene (chr17, chr12), codon CGC→CAC and
   GGT→TGT, and hands off at residue 175 / 12.
8. Free entry: Gene `BRAF`, Change `V600E` → loads. Negative cases:
   - Gene `HBB`, Change `K7E` → *"Codon 7 of HBB is GAG, which encodes Glu, not Lys…"* (HTTP 400).
   - Gene `NOTAGENE1`, Change `A1V` → *"Ensembl does not know gene…"* (HTTP 404).
   - Ensembl unreachable → *"Could not reach Ensembl for the gene model. Try again."* (HTTP 502).
9. Viewer deep link negative case: `/viewer/<id>?select=garbage` opens normally with nothing selected.
10. Tests:
    ```
    cd backend && pytest
    cd frontend && npm ci && npm test && npm run build
    ```
    - Expect: every test passes, build clean (609 backend and 466 frontend when this phase landed; current totals are in the header).

**Pass criteria:** every level describes the same base; the genomic allele is the complement of the
coding allele on minus-strand genes; a wrong reference residue is refused, never "mutated"; the
hand-off lands on the variant residue.

---

## P21 / P24 — Retro theme, Classic toggle, and the Explorer in retro

Goal: the app opens in the retro theme by default, a toggle switches to the Classic light theme and
back on every page, and the report and the Central Dogma Explorer look right in both.

1. Start both servers. In a fresh browser profile (or after clearing site data) open `/`.
   Expect the retro theme: near-black indigo background, neon magenta and cyan accents, Orbitron
   headings, a perspective horizon grid behind the content and faint scanlines. The `<html>`
   element carries the class `retro`.
2. Expect a **Classic** button fixed at the bottom-left corner. Click it: the page switches to the
   light theme (`<html>` class `light`), the button now reads **Retro**, and the landing helix
   changes palette in place without a reload.
3. Reload the page: the choice is remembered. Visit `/search`, `/tools`, `/predict` and a viewer:
   each shows the same toggle in the same corner and uses the chosen theme.
4. In the viewer, in retro: the Mol\* canvas and its buttons follow the dark palette, the rail
   charts (composition, secondary-structure donut, hydropathy) are legible, and status colours
   (amber notes, red errors) stay readable. Switch to Classic and check the same panels.
5. Open a **Report** in retro: the page is still white paper with dark text, no grid or scanlines
   inside it, and printing it gives clean white pages in both themes.
6. Explorer in retro (P24): open `/explore`. Expect the indigo/violet tint on its panels and text in
   place of flat grey, with the horizon grid showing behind the page, and all five levels readable.
   Switch to **Classic**: the Explorer goes back to its original dark grey look, unchanged.
7. Negative case: the toggle never appears in print output, in either theme (it carries the
   `no-print` class), and it only appears once the page has hydrated, so it never shows the wrong
   label.
8. Tests:
   ```
   cd frontend && npx vitest run components/__tests__/theme-toggle.test.tsx components/__tests__/helix-field-palette.test.ts
   cd frontend && npm run build
   ```
   - Expect: 4 tests pass and the build is clean.

**Pass criteria:** retro is the default, Classic is one click away and sticks across pages and
reloads; nothing becomes unreadable in either theme; the report always prints as paper.

---

## How to add a smoke test

When you start a phase, replace the placeholder for that phase with the concrete steps. The steps should be the minimum sequence a new contributor needs to verify the phase works end-to-end, including:

- Setup commands (idempotent)
- Expected outputs (exact strings or close)
- Negative cases (what should fail gracefully — e.g. backend down)
- Test commands (`pytest`, `npm test`)

Keep each phase ≤ 10 steps. If it gets longer, split into multiple smoke tests.
