import { describe, it, expect } from "vitest";
import { bp, countBases, exampleSequence, frameLabel } from "@/lib/seqtools";
import { packLanes } from "@/app/tools/sequence-map";

describe("seqtools helpers", () => {
  it("counts bases ignoring FASTA headers, comments, whitespace and numbering", () => {
    expect(countBases(">x desc\n1 ACGT ACGT\n;note\n9 aa\r\n")).toBe(10);
    expect(countBases("")).toBe(0);
  });

  it("formats frames and lengths", () => {
    expect(frameLabel(2)).toBe("+2");
    expect(frameLabel(-3)).toBe("-3");
    expect(bp(12345)).toBe("12,345 bp");
  });

  it("builds a deterministic example with an ORF and an EcoRI site", () => {
    const a = exampleSequence();
    expect(a).toBe(exampleSequence());
    const flat = a.replace(/\n/g, "");
    expect(flat).toMatch(/^[ACGT]+$/);
    expect(flat).toContain("GAATTC");
    expect(flat.indexOf("ATG")).toBeGreaterThanOrEqual(0);
    expect(a.split("\n").every((line) => line.length <= 60)).toBe(true);
  });

  it("packs overlapping spans into separate lanes and reuses free ones", () => {
    expect(
      packLanes([
        { start: 1, end: 50 },
        { start: 10, end: 20 },
        { start: 60, end: 70 },
        { start: 25, end: 30 },
      ]),
    ).toEqual([0, 1, 0, 1]);
  });
});

describe("exampleSequence composition", () => {
  it("has a realistic base mix rather than long homopolymers", () => {
    const flat = exampleSequence().replace(/\n/g, "");
    const gc = (flat.match(/[GC]/g) ?? []).length / flat.length;
    expect(gc).toBeGreaterThan(0.35);
    expect(gc).toBeLessThan(0.65);
    expect(flat).not.toMatch(/(.)\1{7}/);
  });
});
