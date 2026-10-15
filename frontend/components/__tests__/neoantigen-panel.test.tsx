import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { NeoantigenPanel } from "@/components/neoantigen-panel";
import { useStore } from "@/lib/store";
import type {
  NeoantigenCandidate,
  NeoantigenReport,
} from "@/lib/neoantigen-types";

/** KRAS G12C on 6OIM, shaped like the backend's answer from the recorded IEDB table. */
function candidate(
  patch: Partial<NeoantigenCandidate> = {},
): NeoantigenCandidate {
  return {
    peptide: "VVGACGVGK",
    wild_type: "VVGAGGVGK",
    allele: "HLA-A*11:01",
    length: 9,
    start: 8,
    mutant_offset: 5,
    mutant_rank: 0.52,
    wild_type_rank: 0.18,
    mutant_score: 0.34,
    binding: "weak",
    fold_change: 0.35,
    anchor: false,
    residue_keys: Array.from({ length: 9 }, (_, i) => `A:${9 + i}`),
    ...patch,
  };
}

function report(patch: Partial<NeoantigenReport> = {}): NeoantigenReport {
  return {
    protein_id: "k",
    accession: "P01116",
    gene: "KRAS",
    change: "G12C",
    alleles: ["HLA-A*02:01", "HLA-A*03:01", "HLA-A*11:01", "HLA-A*24:02"],
    lengths: [8, 9, 10, 11],
    method: "NetMHCpan 4.1 EL (IEDB)",
    peptides_scored: 152,
    candidates: [
      candidate({
        mutant_rank: 0.3,
        binding: "strong",
        fold_change: 3.2,
        allele: "HLA-A*03:01",
      }),
      candidate(),
    ],
    variant_keys: ["A:13"],
    resolution_note: "",
    notes: [],
    ...patch,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function serve(body: unknown, status = 200) {
  fetchMock = vi
    .fn()
    .mockResolvedValue({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    });
  vi.stubGlobal("fetch", fetchMock);
}

function predict(change = "G12C") {
  fireEvent.change(screen.getByLabelText("Missense change"), {
    target: { value: change },
  });
  fireEvent.click(screen.getByRole("button", { name: "Predict" }));
}

beforeEach(() => {
  useStore.setState({ selected: new Set(), residueOverlay: null });
  serve(report());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NeoantigenPanel", () => {
  it("asks nothing of IEDB until a change is entered", () => {
    render(<NeoantigenPanel proteinId="k" />);
    expect(screen.getByRole("button", { name: "Predict" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Missense change"), {
      target: { value: "G12" },
    });
    expect(screen.getByRole("button", { name: "Predict" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests the change on the checked alleles", async () => {
    render(<NeoantigenPanel proteinId="k" />);
    fireEvent.click(screen.getByLabelText("B*07:02"));
    fireEvent.click(screen.getByLabelText("A*24:02"));
    predict();
    await screen.findByText(/2 binders among 152/);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain("/api/proteins/k/neoantigens?change=G12C");
    expect(url).toContain(
      "alleles=HLA-A*02:01,HLA-A*03:01,HLA-A*11:01,HLA-B*07:02",
    );
  });

  it("lists candidates with the mutated residue marked and selects one in 3D", async () => {
    render(<NeoantigenPanel proteinId="k" />);
    predict();
    const list = await screen.findByRole("list", {
      name: "Neoantigen candidates",
    });
    expect(list.textContent).toContain("strong · 0.3%");
    expect(list.textContent).toContain("3.2× better than wild type");
    expect(list.textContent).toContain("wild type binds better");
    expect(list.textContent).toContain("change faces the T-cell receptor");
    fireEvent.click(screen.getAllByRole("button", { name: /VVGACGVGK/ })[1]);
    expect([...useStore.getState().selected]).toEqual(candidate().residue_keys);
  });

  it("paints the epitopes, with the mutated residue in violet", async () => {
    render(<NeoantigenPanel proteinId="k" />);
    predict();
    fireEvent.click(
      await screen.findByRole("button", { name: "Neoantigen epitopes" }),
    );
    const overlay = useStore.getState().residueOverlay!;
    expect(overlay.colors["A:13"]).toBe(0x7c3aed);
    expect(overlay.colors["A:9"]).toBe(0xdc2626);
  });

  it("says when nothing binds", async () => {
    serve(report({ candidates: [] }));
    render(<NeoantigenPanel proteinId="k" />);
    predict();
    expect(
      await screen.findByText(/No mutant peptide ranks in the top 2%/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Neoantigen epitopes" }),
    ).toBeDisabled();
  });

  it("shows the backend's reason for a wrong residue", async () => {
    serve({ detail: "Residue 12 is Gly in UniProt, not Ala." }, 400);
    render(<NeoantigenPanel proteinId="k" />);
    predict("A12C");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Residue 12 is Gly in UniProt",
    );
  });
});
