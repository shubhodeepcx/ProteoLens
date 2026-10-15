import { describe, expect, it } from "vitest";
import {
  AM_BENIGN_MAX,
  AM_PATHOGENIC_MIN,
  BURDEN_LEGEND,
  alphaMissenseColor,
  burdenColor,
  formatAf,
  hex,
  residueColors,
} from "@/lib/clinical-format";
import type { ResidueEvidence } from "@/lib/clinical-types";

function residue(patch: Partial<ResidueEvidence>): ResidueEvidence {
  return {
    position: 1,
    pathogenic: 0,
    benign: 0,
    uncertain: 0,
    somatic: 0,
    alphamissense: null,
    keys: ["A:1"],
    ...patch,
  };
}

describe("alphaMissenseColor", () => {
  it("is blue at 0, grey in the ambiguous band, dark red at 1", () => {
    expect(hex(alphaMissenseColor(0))).toBe("#3b82f6");
    expect(hex(alphaMissenseColor((AM_BENIGN_MAX + AM_PATHOGENIC_MIN) / 2))).toBe("#d4d4d8");
    expect(hex(alphaMissenseColor(1))).toBe("#b91c1c");
  });

  it("clamps scores outside 0-1", () => {
    expect(alphaMissenseColor(-1)).toBe(alphaMissenseColor(0));
    expect(alphaMissenseColor(2)).toBe(alphaMissenseColor(1));
  });
});

describe("burdenColor", () => {
  it("steps through the legend", () => {
    expect([0, 1, 3, 9].map(burdenColor)).toEqual(BURDEN_LEGEND.map(([, c]) => c));
  });
});

describe("residueColors", () => {
  const residues = [
    residue({ position: 7, pathogenic: 2, alphamissense: 0.9, keys: ["A:7", "B:7"] }),
    residue({ position: 8, alphamissense: null, keys: ["A:8"] }),
    residue({ position: 9, alphamissense: 0.1, keys: [] }),
  ];

  it("paints every copy of a residue in a homo-oligomer", () => {
    const colors = residueColors(residues, "alphamissense");
    expect(colors["A:7"]).toBe(colors["B:7"]);
    expect(Object.keys(colors).sort()).toEqual(["A:7", "B:7"]);
  });

  it("leaves residues without a score to the fallback", () => {
    expect(residueColors(residues, "alphamissense")["A:8"]).toBeUndefined();
  });

  it("paints burden for every mapped residue, zero included", () => {
    const colors = residueColors(residues, "burden");
    expect(colors["A:7"]).toBe(burdenColor(2));
    expect(colors["A:8"]).toBe(burdenColor(0));
  });
});

describe("formatAf", () => {
  it("reads absent, percent and scientific forms", () => {
    expect(formatAf(null)).toBe("absent");
    expect(formatAf(0.25)).toBe("25.0%");
    expect(formatAf(0.0000123)).toBe("1.2e-5");
  });
});
