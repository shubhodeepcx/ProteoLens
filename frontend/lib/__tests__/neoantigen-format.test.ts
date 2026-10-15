import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLELES,
  comparisonLabel,
  epitopeColors,
  looksLikeMissense,
  neoantigenPath,
  rankLabel,
  splitPeptide,
} from "@/lib/neoantigen-format";
import type { NeoantigenCandidate } from "@/lib/neoantigen-types";

const base: NeoantigenCandidate = {
  peptide: "VVGACGVGK",
  wild_type: "VVGAGGVGK",
  allele: "HLA-A*11:01",
  length: 9,
  start: 8,
  mutant_offset: 5,
  mutant_rank: 0.52,
  wild_type_rank: 0.18,
  mutant_score: 0.34,
  binding: "weak",
  fold_change: 0.35,
  anchor: false,
  residue_keys: ["A:9", "A:10"],
};

describe("neoantigen-format", () => {
  it("recognises missense changes", () => {
    expect(looksLikeMissense("G12C")).toBe(true);
    expect(looksLikeMissense("p.Gly12Cys")).toBe(true);
    expect(looksLikeMissense("G12")).toBe(false);
  });

  it("builds the request path", () => {
    expect(neoantigenPath("abc", " G12C ", DEFAULT_ALLELES)).toBe(
      "/api/proteins/abc/neoantigens?change=G12C&alleles=HLA-A*02%3A01%2CHLA-A*03%3A01%2CHLA-A*11%3A01%2CHLA-A*24%3A02",
    );
  });

  it("splits a peptide around the change", () => {
    expect(splitPeptide("VVGACGVGK", 5)).toEqual(["VVGA", "C", "GVGK"]);
    expect(splitPeptide("CGVGKSALT", 1)).toEqual(["", "C", "GVGKSALT"]);
  });

  it("labels ranks and the wild-type comparison", () => {
    expect(rankLabel(0.052)).toBe("0.05%");
    expect(rankLabel(1.4)).toBe("1.4%");
    expect(rankLabel(null)).toBe("n/a");
    expect(comparisonLabel(base)).toBe("wild type binds better");
    expect(comparisonLabel({ ...base, fold_change: 1.2 })).toBe(
      "similar to wild type",
    );
    expect(comparisonLabel({ ...base, fold_change: 12 })).toBe(
      "12.0× better than wild type",
    );
    expect(comparisonLabel({ ...base, fold_change: null })).toBe(
      "no reference peptide",
    );
  });

  it("colours each residue by its best covering candidate", () => {
    const colors = epitopeColors(
      [base, { ...base, mutant_rank: 0.2, residue_keys: ["A:10", "A:11"] }],
      ["A:11"],
    );
    expect(colors["A:10"]).toBe(0xdc2626); // strong via the second candidate
    expect(colors["A:9"]).not.toBe(0xdc2626); // weak only
    expect(colors["A:11"]).toBe(0x7c3aed); // the mutated residue wins
  });
});
