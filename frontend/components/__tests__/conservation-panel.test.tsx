import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { ConservationPanel } from "@/components/conservation-panel";
import { useStore } from "@/lib/store";
import type {
  ConservationProfile,
  ResidueConservation,
} from "@/lib/conservation-types";

/** KRAS on 6OIM (UniProt n is ordinal n+1), values from the recorded PDBe-KB profile. */
function residue(
  position: number,
  residue: string,
  information: number,
  keys = true,
): ResidueConservation {
  return {
    position,
    residue,
    information,
    dominant: residue,
    dominant_probability: 0.8,
    keys: keys ? [`A:${position + 1}`] : [],
  };
}

function profile(
  patch: Partial<ConservationProfile> = {},
): ConservationProfile {
  return {
    protein_id: "k",
    accession: "P01116",
    accession_resolved: true,
    resolution_note: "Mapped from PDB 6OIM.",
    source: "PDBe-KB sequence conservation",
    sequence_length: 189,
    residues: [
      residue(10, "G", 2.85),
      residue(12, "G", 0.5),
      residue(16, "K", 2.61),
      residue(189, "M", 0.3, false),
    ],
    most_conserved: [10, 16],
    mean_information: 1.07,
    placed: 3,
    notes: [],
    ...patch,
  };
}

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: status < 400,
        status,
        text: async () => JSON.stringify(body),
      }),
  );
}

beforeEach(() => {
  useStore.setState({ selected: new Set(), residueOverlay: null });
  serve(profile());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConservationPanel", () => {
  it("summarises the profile and lists the most conserved residues", async () => {
    render(<ConservationPanel proteinId="k" />);
    expect(
      await screen.findByText(
        /P01116: 4 positions, mean 1.1 bits; 3 sit on residues/,
      ),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Most conserved residues" });
    expect(list.textContent).toBe("G102.9K162.6");
  });

  it("selects a conserved residue in 3D", async () => {
    render(<ConservationPanel proteinId="k" />);
    fireEvent.click(await screen.findByRole("button", { name: /K16/ }));
    expect([...useStore.getState().selected]).toEqual(["A:17"]);
  });

  it("paints the structure maroon where conserved and turquoise where variable", async () => {
    render(<ConservationPanel proteinId="k" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Conservation" }),
    );
    const overlay = useStore.getState().residueOverlay!;
    expect(overlay.label).toBe("Conservation");
    expect(overlay.colors["A:11"]).toBe(0xa02560);
    expect(overlay.colors["A:13"]).not.toBe(0xa02560);
    expect(overlay.colors).not.toHaveProperty("A:190");
  });

  it("draws one bar per residue", async () => {
    render(<ConservationPanel proteinId="k" />);
    const strip = await screen.findByRole("img", {
      name: "Conservation along residues 1 to 189",
    });
    expect(strip.querySelectorAll("rect")).toHaveLength(4);
  });

  it("explains an empty profile", async () => {
    serve(
      profile({
        residues: [],
        most_conserved: [],
        placed: 0,
        resolution_note: "PDBe has no conservation profile for Q9XXXX",
      }),
    );
    render(<ConservationPanel proteinId="k" />);
    expect(
      await screen.findByText("No conservation profile for this structure."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/PDBe has no conservation profile/),
    ).toBeInTheDocument();
  });

  it("offers a retry when the request fails", async () => {
    serve(
      {
        detail: "Could not reach PDBe or UniProt for conservation. Try again.",
      },
      502,
    );
    render(<ConservationPanel proteinId="k" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach PDBe",
    );
  });
});
