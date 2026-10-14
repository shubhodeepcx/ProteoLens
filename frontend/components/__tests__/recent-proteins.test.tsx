import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentProteins } from "@/components/recent-proteins";

const summary = {
  id: "a".repeat(32),
  source: "rcsb",
  source_id: "4HHB",
  name: "Deoxy human haemoglobin",
  organism: "Homo sapiens",
  file_url: "/api/proteins/x/file",
  file_format: "mmcif",
  chains: [{ id: "A" }, { id: "B" }],
  residue_count: 574,
  atom_count: 4384,
  molecular_weight: 64000,
  has_plddt: false,
  warnings: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecentProteins", () => {
  it("links each recent protein to its viewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify([summary]), { status: 200 })),
    );
    render(<RecentProteins />);
    const link = await screen.findByRole("link", { name: /4HHB/ });
    expect(link.getAttribute("href")).toBe(`/viewer/${summary.id}`);
    expect(screen.getByText(/574 residues · 2 chains · rcsb/)).toBeTruthy();
  });

  it("renders nothing when the backend is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<RecentProteins />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
