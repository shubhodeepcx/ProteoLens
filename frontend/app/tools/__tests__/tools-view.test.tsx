import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToolsView } from "@/app/tools/tools-view";
import type { ToolResults } from "@/lib/seqtools";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const RESULTS: ToolResults = {
  orfs: {
    stats: {
      length: 600,
      gc_percent: 51.2,
      counts: { A: 150, C: 150, G: 150, T: 150, N: 0 },
      reverse_complement: "",
      molecular_weight_ds: 370000,
    },
    orfs: [
      { frame: 1, strand: "+", start: 181, end: 426, length_nt: 246, length_aa: 81, complete: true, protein: "MAKELFRDTQW" },
    ],
    frames: [{ frame: 1, protein: "XMAKEL" }],
  },
  restriction: {
    length: 600,
    circular: false,
    enzymes: [{ name: "EcoRI", site: "G^AATT_C", overhang: "5'", cuts: [500], fragments: [499, 101] }],
    unique_cutters: ["EcoRI"],
    non_cutters: ["NotI"],
  },
  primers: {
    target_start: 1,
    target_end: 600,
    pairs: [
      {
        forward: { sequence: "ACGTACGTACGTACGTACGT", strand: "+", start: 1, end: 20, length: 20, tm: 60.1, gc_percent: 50, gc_clamp: true, max_run: 1, self_dimer_3prime: 4, penalty: 0.3 },
        reverse: { sequence: "TTGCAGGCATGCAAGCTTGG", strand: "-", start: 581, end: 600, length: 20, tm: 59.8, gc_percent: 55, gc_clamp: true, max_run: 2, self_dimer_3prime: 2, penalty: 0.5 },
        product_size: 600,
        tm_difference: 0.3,
        pair_dimer_3prime: 2,
        penalty: 1.1,
      },
    ],
    notes: ["Ranking is a transparent penalty."],
  },
  crispr: {
    nuclease: "SpCas9 (NGG)",
    guides: [
      { protospacer: "GCCGCCGAGAATGCTGTTCG", pam: "AGG", strand: "+", start: 291, end: 310, cut_site: 307, gc_percent: 65, flags: [], off_targets_in_sequence: 0, score: 92.5 },
    ],
    total_sites: 12,
    notes: ["Off-targets are counted only within the submitted sequence."],
  },
};

function mockTools(overrides: Partial<Record<string, Response>> = {}) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const key = String(url).split("/api/tools/")[1];
    return overrides[key] ?? jsonResponse(RESULTS[key as keyof ToolResults]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ToolsView", () => {
  it("asks for a sequence before calling the API", () => {
    const fetchMock = mockTools();
    render(<ToolsView />);
    fireEvent.click(screen.getByRole("button", { name: /analyse/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/paste a dna sequence/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs all four tools on the example and shows each tab", async () => {
    const fetchMock = mockTools();
    render(<ToolsView />);
    fireEvent.click(screen.getByRole("button", { name: /load example/i }));
    fireEvent.change(screen.getByLabelText("Target start"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Target end"), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /analyse/i }));

    await screen.findByText("ORFs (1)");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const crisprCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/tools/crispr"))!;
    const body = JSON.parse(crisprCall[1]!.body as string);
    expect(body).toMatchObject({ target_start: 200, target_end: 300 });
    expect(body.sequence).toContain("GAATTC");

    expect(screen.getByText("181..426")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /restriction/i }));
    await waitFor(() => expect(screen.getByText("G^AATT_C")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: /primers/i }));
    await waitFor(() => expect(screen.getByText(/5′-ACGTACGTACGTACGTACGT-3′/)).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: /crispr/i }));
    await waitFor(() => expect(screen.getByText("GCCGCCGAGAATGCTGTTCG")).toBeTruthy());
    expect(screen.getByText("92.5")).toBeTruthy();
  });

  it("shows the backend's reason when a sequence is rejected", async () => {
    mockTools({ orfs: jsonResponse({ detail: "Only A, C, G, T (or U) and N are accepted. Is this a protein sequence?" }, 422) });
    render(<ToolsView />);
    fireEvent.change(screen.getByLabelText(/dna sequence/i), { target: { value: "MKVLAAGIW" } });
    fireEvent.click(screen.getByRole("button", { name: /analyse/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/protein sequence/);
  });
});
