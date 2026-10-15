import { describe, expect, it } from "vitest";
import { densityColors, hotspotColors, percent, phaseLabel, ramp } from "@/lib/oncology-format";
import type { Hotspot, MutationPosition } from "@/lib/oncology-types";

const hotspot = (residue: string, tumor_count: number, keys: string[]): Hotspot => ({
  residue,
  position: Number(residue.slice(1)),
  tumor_count,
  q_value: 0,
  alternates: [],
  tumor_types: [],
  keys,
});

describe("hotspotColors", () => {
  it("gives the top hotspot the darkest colour and skips unmapped ones", () => {
    const colors = hotspotColors([hotspot("G12", 2000, ["A:13"]), hotspot("Q61", 20, ["A:62"]), hotspot("A146", 9, [])]);
    expect(colors["A:13"]).toBe(0x9f1239);
    expect(colors["A:62"]).not.toBe(colors["A:13"]);
    expect(Object.keys(colors)).toHaveLength(2);
  });
});

describe("densityColors", () => {
  it("uses a log scale so a lone count still shows", () => {
    const p = (position: number, count: number): MutationPosition => ({
      position,
      count,
      truncating: 0,
      top_change: "X",
      keys: [`A:${position}`],
    });
    const colors = densityColors([p(12, 1000), p(40, 1)]);
    expect(colors["A:12"]).toBe(0xdc2626);
    expect(colors["A:40"]).not.toBe(0xfde68a);
  });
});

describe("helpers", () => {
  it("ramps endpoints exactly", () => {
    expect(ramp(0x000000, 0xffffff, 0)).toBe(0);
    expect(ramp(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });
  it("formats fractions and phases", () => {
    expect(percent(0.6359)).toBe("64%");
    expect(percent(0.012)).toBe("1.2%");
    expect(phaseLabel(4)).toBe("approved");
    expect(phaseLabel(2.5)).toBe("phase 2");
    expect(phaseLabel(null)).toBe("phase unknown");
  });
});
