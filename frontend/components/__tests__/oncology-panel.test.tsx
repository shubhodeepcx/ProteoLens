import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { OncologyPanel } from "@/components/oncology-panel";
import { useStore } from "@/lib/store";
import type { OncologyContext } from "@/lib/oncology-types";

function context(patch: Partial<OncologyContext> = {}): OncologyContext {
  return {
    id: "k",
    accession: "P01116",
    accession_resolved: true,
    resolution_note: "Mapped from PDB 6OIM.",
    gene: "KRAS",
    sequence_length: 189,
    hotspots: [
      {
        residue: "G12",
        position: 12,
        tumor_count: 2175,
        q_value: 0,
        alternates: [{ label: "D", count: 900 }],
        tumor_types: [{ label: "pancreas", count: 600 }],
        keys: ["A:13"],
      },
    ],
    tcga: {
      studies: 32,
      samples: 10967,
      mutated_samples: 763,
      by_cancer_type: [
        {
          study_id: "paad_tcga_pan_can_atlas_2018",
          cancer_type: "Pancreatic Adenocarcinoma",
          mutated_samples: 117,
          samples: 184,
          fraction: 0.6359,
        },
      ],
      mutation_types: [{ label: "Missense Mutation", count: 700 }],
      positions: [{ position: 12, count: 500, truncating: 0, top_change: "G12D", keys: ["A:13"] }],
    },
    drugs: [
      {
        chembl_id: "CHEMBL4535757",
        name: "Sotorasib",
        max_phase: 4,
        first_approval: 2021,
        molecule_type: "Small molecule",
        mechanism: "GTPase KRas inhibitor",
        action_type: "INHIBITOR",
        variant: "G12C",
        url: "https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL4535757",
      },
    ],
    evidence: [
      {
        id: 993,
        profile: "KRAS G12C",
        evidence_type: "Predictive",
        significance: "Sensitivity/response",
        direction: "Supports",
        level: "A",
        rating: 5,
        therapies: ["Sotorasib"],
        disease: "Lung Non-small Cell Carcinoma",
        positions: [12],
        keys: ["A:13"],
        url: "https://civicdb.org/evidence/993/summary",
      },
    ],
    evidence_total: 200,
    pathways: [{ id: "R-HSA-1", name: "RAF/MAP kinase cascade", in_disease: true, url: "https://reactome.org/content/detail/R-HSA-1" }],
    pathways_total: 71,
    interactors: [{ name: "RAF1", score: 0.999 }],
    sources: [
      { name: "ChEMBL", state: "ok", detail: null },
      { name: "CIViC", state: "unavailable", detail: "HTTP 503" },
    ],
    notes: ["For study, not treatment guidance."],
    ...patch,
  };
}

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status < 400, status, text: async () => JSON.stringify(body) }),
  );
}

describe("OncologyPanel", () => {
  beforeEach(() => useStore.setState({ residueOverlay: null, selected: new Set() }));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders every section from one payload", async () => {
    stubFetch(context());
    render(<OncologyPanel proteinId="k" />);

    expect(await screen.findByText(/Mutated in 763 of 10,967 tumours/)).toBeTruthy();
    expect(screen.getByText("Sotorasib").closest("a")?.getAttribute("href")).toContain("CHEMBL4535757");
    expect(screen.getByText("G12C-specific")).toBeTruthy();
    expect(screen.getByText("Pancreatic Adenocarcinoma")).toBeTruthy();
    expect(screen.getByText("RAF1")).toBeTruthy();
    expect(screen.getByText(/CIViC · unavailable/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /TCGA mutations along 189 residues/ })).toBeTruthy();
  });

  it("selects a hotspot, a lollipop head and a CIViC profile in 3D", async () => {
    stubFetch(context());
    render(<OncologyPanel proteinId="k" />);

    fireEvent.click(await screen.findByRole("button", { name: "G12" }));
    expect([...useStore.getState().selected]).toEqual(["A:13"]);

    useStore.setState({ selected: new Set() });
    fireEvent.click(screen.getByRole("button", { name: "G12D: 500 samples" }));
    expect([...useStore.getState().selected]).toEqual(["A:13"]);

    useStore.setState({ selected: new Set() });
    fireEvent.click(screen.getByRole("button", { name: "KRAS G12C" }));
    expect([...useStore.getState().selected]).toEqual(["A:13"]);
  });

  it("paints hotspots through the shared overlay", async () => {
    stubFetch(context());
    render(<OncologyPanel proteinId="k" />);

    fireEvent.click(await screen.findByRole("button", { name: "Tumour hotspots" }));
    expect(useStore.getState().residueOverlay?.colors).toEqual({ "A:13": 0x9f1239 });
  });

  it("explains a structure with no gene", async () => {
    stubFetch(context({ accession: null, accession_resolved: false, gene: null, resolution_note: "Uploads carry no accession." }));
    render(<OncologyPanel proteinId="k" />);
    expect(await screen.findByText("Uploads carry no accession.")).toBeTruthy();
  });
});
