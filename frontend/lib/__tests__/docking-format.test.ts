import { describe, it, expect } from "vitest";
import {
  crystalVerdict,
  kcal,
  poseLabel,
  siteTitle,
  strength,
} from "@/lib/docking-format";
import type { DockPose, DockingSite } from "@/lib/docking-types";

const pose = (rmsd: number | null): DockPose => ({
  rank: 1,
  affinity: -11.416,
  rmsd_lb: 0,
  rmsd_ub: 0,
  rmsd_to_crystal: rmsd,
  sdf: "",
  contacts: [],
});

describe("docking format", () => {
  it("labels scores and poses", () => {
    expect(kcal(-11.416)).toBe("-11.4 kcal/mol");
    expect(poseLabel(pose(null))).toBe("Pose 1, -11.4 kcal/mol");
  });

  it("calls a redock reproduced at 2 Å or less", () => {
    expect(crystalVerdict(pose(0.76))).toEqual({
      text: "0.76 Å from the crystal pose",
      reproduced: true,
    });
    expect(crystalVerdict(pose(4.19))?.reproduced).toBe(false);
    expect(crystalVerdict(pose(null))).toBeNull();
  });

  it("bins strength coarsely", () => {
    expect(strength(-11)).toBe("very strong");
    expect(strength(-8.5)).toBe("strong");
    expect(strength(-6)).toBe("moderate");
    expect(strength(-4)).toBe("weak");
  });

  it("names a site by code, short name and chain", () => {
    const site: DockingSite = {
      id: "HEM:A:154",
      code: "HEM",
      name: "PROTOPORPHYRIN IX CONTAINING FE",
      chain: "A",
      auth_seq_id: 154,
      atom_count: 43,
      center: [0, 0, 0],
      size: [1, 1, 1],
      smiles: null,
    };
    expect(siteTitle(site)).toBe("HEM (PROTOPORPHYRIN IX CONTAINING FE), chain A 154");
    expect(siteTitle({ ...site, name: null, auth_seq_id: null })).toBe("HEM, chain A");
  });
});
