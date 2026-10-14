import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "a".repeat(32) }),
  useRouter: () => ({ push: vi.fn() }),
}));

import ReportPage from "@/app/report/[id]/page";
import { saveSnapshot } from "@/lib/report";

const id = "a".repeat(32);
const summary = {
  id,
  source: "rcsb",
  source_id: "1CRN",
  name: "Crambin",
  organism: "Crambe hispanica",
  file_url: `/api/proteins/${id}/file`,
  file_format: "pdb",
  chains: [{ id: "A", label: "A", sequence: "TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN", residue_count: 46 }],
  residue_count: 46,
  atom_count: 327,
  molecular_weight: 4736.4,
  has_plddt: false,
  warnings: [],
};

function respond(url: string) {
  if (url.endsWith(`/api/proteins/${id}`)) return new Response(JSON.stringify(summary));
  return new Response(JSON.stringify({ detail: "nope" }), { status: 502 });
}

afterEach(() => vi.unstubAllGlobals());

describe("report page", () => {
  it("renders the structure facts, sequence and snapshot even when analytics fail", async () => {
    saveSnapshot(id, "data:image/png;base64,AAAA");
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(respond(String(url)))));
    render(<ReportPage />);

    expect(await screen.findByRole("heading", { name: "Crambin" })).toBeTruthy();
    expect(screen.getByText("4736 Da")).toBeTruthy();
    expect(screen.getByAltText("3D view of Crambin").getAttribute("src")).toContain("data:image/png");
    expect(screen.getByText(/TTCCPSIVAR SNFNVCRLPG/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /print or save as pdf/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /composition csv/i })).toBeNull();
  });

  it("explains a protein that cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: "Protein not found" }), { status: 404 }))),
    );
    render(<ReportPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Protein not found");
  });
});
