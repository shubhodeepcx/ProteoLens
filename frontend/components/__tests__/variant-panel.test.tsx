import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariantPanel } from "@/components/variant-panel";
import { useStore } from "@/lib/store";

const residue = (ordinal: number, letter: string) => ({
  chain: "A",
  ordinal,
  key: `A:${ordinal}`,
  residue: letter,
  auth_seq_id: ordinal,
  insertion_code: null,
});

const impact = {
  id: "a".repeat(32),
  notation: "L56R",
  hgvs: "p.Leu56Arg",
  kind: "missense",
  ref: "L",
  alt: "R",
  position: 56,
  numbering: "author",
  numbering_note: "Read as the file's own residue number.",
  accession: null,
  physicochemistry: {
    hydropathy_ref: 3.8,
    hydropathy_alt: -4.5,
    charge_ref: 0,
    charge_alt: 1,
    volume_ref: 166.7,
    volume_alt: 173.4,
    blosum62: -2,
  },
  truncated_residues: null,
  sites: [
    {
      residue: residue(56, "L"),
      relative_accessibility: 0.006,
      burial: "buried",
      neighbours: [residue(55, "I"), residue(57, "Q")],
      interface_chains: [],
      nucleic_acid_chains: [],
      ligand_contacts: ["NAG"],
      disulfide_partner: null,
      curated_sites: [],
      flags: [
        { severity: "high", code: "buried-charge", text: "Places a charged side chain in the buried core." },
      ],
      concern: "high",
    },
  ],
  concern: "high",
  neighbour_cutoff: 4.5,
  contact_cutoff: 4,
  notes: ["These are structural rules of thumb, not a pathogenicity prediction."],
};

afterEach(() => {
  vi.unstubAllGlobals();
  useStore.getState().setSelection([]);
});

describe("VariantPanel", () => {
  it("analyses a variant and selects it in 3D", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(impact), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<VariantPanel proteinId={impact.id} />);

    fireEvent.change(screen.getByLabelText(/protein variant/i), { target: { value: "L56R" } });
    fireEvent.click(screen.getByRole("button", { name: /analyse/i }));

    expect(await screen.findByText("p.Leu56Arg")).toBeTruthy();
    expect(screen.getByText(/charged side chain in the buried core/)).toBeTruthy();
    expect(screen.getByText(/not a pathogenicity prediction/)).toBeTruthy();
    expect([...useStore.getState().selected]).toEqual(["A:56"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/proteins/${impact.id}/variant`);
    expect(JSON.parse(init.body)).toEqual({ notation: "L56R" });
  });

  it("shows the backend's reason when a variant does not fit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Residue 35 in this file is Glu (A:35), not Ala." }), {
          status: 422,
        }),
      ),
    );
    render(<VariantPanel proteinId={impact.id} />);
    fireEvent.click(screen.getByRole("button", { name: "R175H" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not Ala");
  });
});
