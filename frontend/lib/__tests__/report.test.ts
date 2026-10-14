import { describe, expect, it } from "vitest";
import {
  compositionCsv,
  csvField,
  fileStem,
  hydrophobicityCsv,
  loadSnapshot,
  reportJson,
  saveSnapshot,
} from "@/lib/report";
import type { AnalyticsResponse, ProteinSummary } from "@/lib/types";

const analytics = {
  id: "x",
  molecular_weight: 4736,
  residue_count: 46,
  atom_count: 327,
  chain_count: 1,
  composition: [
    { aa: "A", label: "Alanine", count: 5, percent: 10.87 },
    { aa: "C", label: "Cysteine", count: 6, percent: 13.04 },
  ],
  secondary_structure: { helix: 46, sheet: 17, coil: 37, available: true },
  hydrophobicity: { chain_id: "A", window: 9, values: [0.5, -1.25] },
  property_distribution: {
    hydrophobic: 0,
    polar: 0,
    charged_positive: 0,
    charged_negative: 0,
    aromatic: 0,
    cysteine: 0,
  },
  chain_lengths: [{ chain_id: "A", length: 46 }],
} as unknown as AnalyticsResponse;

describe("report exports", () => {
  it("quotes CSV fields that need it", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField(null)).toBe("");
  });

  it("writes composition rows", () => {
    expect(compositionCsv(analytics)).toBe(
      "amino_acid,name,count,percent\nA,Alanine,5,10.87\nC,Cysteine,6,13.04\n",
    );
  });

  it("places each hydrophobicity value at its window centre", () => {
    const lines = hydrophobicityCsv(analytics).trim().split("\n");
    expect(lines[1]).toBe("A,5,0.5,9");
    expect(lines[2]).toBe("A,6,-1.25,9");
  });

  it("builds a safe file stem and a JSON document", () => {
    const summary = { id: "u".repeat(32), source_id: "1CRN/x" } as ProteinSummary;
    expect(fileStem(summary)).toBe("1CRN_x");
    const parsed = JSON.parse(reportJson(summary, analytics));
    expect(parsed.generated_by).toBe("ProteoLens");
    expect(parsed.analytics.residue_count).toBe(46);
  });

  it("round-trips a snapshot through sessionStorage", () => {
    saveSnapshot("abc", "data:image/png;base64,xyz");
    expect(loadSnapshot("abc")).toBe("data:image/png;base64,xyz");
    expect(loadSnapshot("missing")).toBeNull();
  });
});

describe("sequenceLines", () => {
  it("groups by ten and numbers each line", async () => {
    const { sequenceLines } = await import("@/lib/report");
    const seq = "A".repeat(65);
    const lines = sequenceLines(seq);
    expect(lines).toHaveLength(2);
    expect(lines[0].start).toBe(1);
    expect(lines[0].text.split(" ")).toHaveLength(6);
    expect(lines[1]).toEqual({ start: 61, text: "AAAAA" });
  });
});
