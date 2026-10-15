import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

import { ClinicalPanel } from "@/components/clinical-panel";
import { useStore } from "@/lib/store";
import type { ClinicalEvidence, ClinicalVariant } from "@/lib/clinical-types";

function variant(patch: Partial<ClinicalVariant> = {}): ClinicalVariant {
  return {
    position: 7,
    end: 7,
    ref: "E",
    alt: "V",
    hgvs: "p.Glu7Val",
    short: "E7V",
    consequence: "missense",
    clinical_class: "pathogenic",
    significance_labels: ["Pathogenic"],
    significance_sources: ["ClinVar"],
    diseases: ["Sickle cell anemia (SKCA)"],
    clinvar_ids: ["RCV000016286"],
    dbsnp_id: "rs334",
    gnomad_af: 0.0068,
    somatic: false,
    predictions: [],
    alphamissense: 0.95,
    residues: [
      { chain: "A", ordinal: 7, key: "A:7", residue: "E", auth_seq_id: 7, insertion_code: null },
    ],
    ...patch,
  };
}

function evidence(patch: Partial<ClinicalEvidence> = {}): ClinicalEvidence {
  return {
    id: "p1",
    accession: "P68871",
    accession_resolved: true,
    resolution_note: "Resolved directly from the alphafold accession.",
    gene: "HBB",
    class_counts: { pathogenic: 1, benign: 1 },
    total_variants: 817,
    variants: [
      variant(),
      variant({ short: "V2A", hgvs: "p.Val2Ala", position: 2, clinical_class: "benign", diseases: [], residues: [] }),
    ],
    variants_truncated: 0,
    residues: [
      { position: 7, pathogenic: 1, benign: 0, uncertain: 0, somatic: 0, alphamissense: 0.95, keys: ["A:7"] },
    ],
    top_diseases: [{ name: "Sickle cell anemia (SKCA)", variants: 1 }],
    alphamissense_available: true,
    mapped_positions: 1,
    notes: ["AlphaMissense values are residue means."],
    ...patch,
  };
}

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    }),
  );
}

describe("ClinicalPanel", () => {
  beforeEach(() => {
    useStore.setState({ residueOverlay: null, selected: new Set() });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists variants with their class, disease and links", async () => {
    stubFetch(evidence());
    render(<ClinicalPanel proteinId="p1" />);

    expect(await screen.findByText("E7V")).toBeTruthy();
    expect(screen.getAllByText("Sickle cell anemia (SKCA)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RCV000016286")[0].closest("a")?.getAttribute("href")).toBe(
      "https://www.ncbi.nlm.nih.gov/clinvar/RCV000016286/",
    );
    expect(screen.getByText(/not modelled here/)).toBeTruthy();
  });

  it("selects the variant's residue in 3D on click", async () => {
    stubFetch(evidence());
    render(<ClinicalPanel proteinId="p1" />);

    fireEvent.click(await screen.findByText("E7V"));

    expect([...useStore.getState().selected]).toEqual(["A:7"]);
  });

  it("filters by significance class", async () => {
    stubFetch(evidence());
    render(<ClinicalPanel proteinId="p1" />);
    await screen.findByText("E7V");

    fireEvent.click(screen.getByRole("button", { name: /Benign 1/ }));

    expect(screen.queryByText("E7V")).toBeNull();
    expect(screen.getByText("V2A")).toBeTruthy();
  });

  it("paints the structure through the viewer slice and toggles off", async () => {
    stubFetch(evidence());
    render(<ClinicalPanel proteinId="p1" />);
    const button = await screen.findByRole("button", { name: "AlphaMissense" });

    fireEvent.click(button);
    const overlay = useStore.getState().residueOverlay;
    expect(overlay?.label).toBe("AlphaMissense");
    expect(Object.keys(overlay?.colors ?? {})).toEqual(["A:7"]);
    // The legend renders on the store update, which can land a tick later.
    expect(await screen.findByRole("list", { name: "Legend" })).toBeTruthy();

    fireEvent.click(button);
    expect(useStore.getState().residueOverlay).toBeNull();
  });

  it("disables AlphaMissense when the accession has none", async () => {
    stubFetch(evidence({ alphamissense_available: false }));
    render(<ClinicalPanel proteinId="p1" />);

    const button = await screen.findByRole("button", { name: "AlphaMissense" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains an empty result", async () => {
    stubFetch(
      evidence({
        accession: null,
        accession_resolved: false,
        resolution_note: "Uploaded files carry no accession.",
        variants: [],
        alphamissense_available: false,
        notes: [],
      }),
    );
    render(<ClinicalPanel proteinId="p1" />);

    expect(await screen.findByText(/No clinical variant evidence/)).toBeTruthy();
    expect(screen.getByText(/Uploaded files carry no accession/)).toBeTruthy();
  });

  it("offers a retry after a failure", async () => {
    stubFetch({ detail: "Could not reach the EBI Proteins API" }, 502);
    render(<ClinicalPanel proteinId="p1" />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Could not reach the EBI Proteins API/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
