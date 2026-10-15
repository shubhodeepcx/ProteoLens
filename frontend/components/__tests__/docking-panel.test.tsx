import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

import { DockingPanel } from "@/components/docking-panel";
import { useStore } from "@/lib/store";
import type {
  DockPose,
  DockResult,
  DockingSites,
} from "@/lib/docking-types";

/** 1HSG (HIV-1 protease + indinavir); scores from the recorded Vina run. */
const MK1_SMILES = "CC(C)(C)NC(=O)[C@@H]1C[N@@](CC[N@]1C)";

function sites(patch: Partial<DockingSites> = {}): DockingSites {
  return {
    protein_id: "h",
    sites: [
      {
        id: "MK1:B:902",
        code: "MK1",
        name: "N-[2(R)-HYDROXY-1(S)-INDANYL]-5-[(2(S)-TERTIARY BUTYLAMINOCARBONYL)]",
        chain: "B",
        auth_seq_id: 902,
        atom_count: 45,
        center: [11.6, 22.5, 5.9],
        size: [14.9, 10.2, 8.6],
        smiles: MK1_SMILES,
      },
    ],
    vina_available: true,
    vina_note: null,
    ...patch,
  };
}

function pose(rank: number, affinity: number, rmsd: number | null): DockPose {
  return {
    rank,
    affinity,
    rmsd_lb: 0,
    rmsd_ub: 0,
    rmsd_to_crystal: rmsd,
    sdf: `pose ${rank}\nM  END\n`,
    contacts: ["A:25", "B:25", `A:${80 + rank}`],
  };
}

const RESULT: DockResult = {
  protein_id: "h",
  smiles: MK1_SMILES,
  site_label: "MK1 site, chain B",
  center: [11.6, 22.5, 5.9],
  size: [22.9, 18.2, 16.6],
  exhaustiveness: 8,
  poses: [pose(1, -11.4, 0.76), pose(2, -10.2, 4.19)],
  vina_version: "1.2.7",
  elapsed_seconds: 90.1,
  receptor_residues_skipped: 0,
  notes: [],
};

function respond(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function serve(siteBody: unknown, dockBody: unknown = RESULT, dockStatus = 200) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? respond(dockBody, dockStatus)
      : respond(siteBody),
  );
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  useStore.setState({ selected: new Set(), dockedPose: null });
  serve(sites());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DockingPanel", () => {
  it("prefills the crystal ligand's pocket and SMILES", async () => {
    render(<DockingPanel proteinId="h" />);
    const target = await screen.findByRole("combobox", { name: /dock into/i });
    expect((target as HTMLSelectElement).value).toBe("MK1:B:902");
    expect(screen.getByRole("textbox", { name: /ligand smiles/i })).toHaveValue(
      MK1_SMILES,
    );
    expect(
      screen.getByText(/This is MK1 itself, so poses are scored/),
    ).toBeInTheDocument();
  });

  it("docks, shows the best pose in 3D and reports the redock RMSD", async () => {
    render(<DockingPanel proteinId="h" />);
    fireEvent.click(await screen.findByRole("button", { name: "Dock" }));
    expect(
      await screen.findByText(/Top pose is 0.76 Å from the crystal pose/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Best score -11.4 kcal\/mol \(very strong\)/)).toBeInTheDocument();

    const [, init] = fetchMock.mock.calls.find(
      ([, i]) => (i as RequestInit | undefined)?.method === "POST",
    )!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      smiles: MK1_SMILES,
      exhaustiveness: 8,
      site: "MK1:B:902",
    });
    expect(useStore.getState().dockedPose?.label).toBe("Pose 1, -11.4 kcal/mol");
  });

  it("switches pose and selects its contacts", async () => {
    render(<DockingPanel proteinId="h" />);
    fireEvent.click(await screen.findByRole("button", { name: "Dock" }));
    const poses = await screen.findByRole("list", { name: "Poses" });
    fireEvent.click(poses.querySelectorAll("button")[1]!);
    expect(useStore.getState().dockedPose?.sdf).toBe(RESULT.poses[1]!.sdf);
    expect([...useStore.getState().selected].sort()).toEqual(["A:25", "A:82", "B:25"]);
    fireEvent.click(screen.getByRole("button", { name: "Hide pose" }));
    expect(useStore.getState().dockedPose).toBeNull();
  });

  it("docks around the selected residues", async () => {
    useStore.setState({ selected: new Set(["A:25", "B:25"]) });
    render(<DockingPanel proteinId="h" />);
    fireEvent.change(await screen.findByRole("combobox", { name: /dock into/i }), {
      target: { value: "selection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Dock" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    );
    expect(body.residues).toEqual(["A:25", "B:25"]);
    expect(body).not.toHaveProperty("site");
  });

  it("needs a selection when there is no crystal ligand", async () => {
    serve(sites({ sites: [] }));
    render(<DockingPanel proteinId="h" />);
    expect(
      await screen.findByText(/Select the pocket residues in 3D/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dock" })).toBeDisabled();
  });

  it("shows Vina's refusal", async () => {
    serve(sites(), { detail: "RDKit could not read that SMILES." }, 400);
    render(<DockingPanel proteinId="h" />);
    fireEvent.click(await screen.findByRole("button", { name: "Dock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Docking failed: RDKit could not read that SMILES.",
    );
    expect(useStore.getState().dockedPose).toBeNull();
  });

  it("explains how to install Vina when it is missing", async () => {
    serve(
      sites({
        vina_available: false,
        vina_note: "AutoDock Vina is not installed. Run `python scripts/install_vina.py`.",
      }),
    );
    render(<DockingPanel proteinId="h" />);
    expect(await screen.findByText("Docking needs AutoDock Vina.")).toBeInTheDocument();
    expect(screen.getByText(/install_vina.py/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dock" })).toBeNull();
  });
});
