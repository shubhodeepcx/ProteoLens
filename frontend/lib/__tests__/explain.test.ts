import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { answerBlocks, explainError } from "@/lib/explain";

describe("answerBlocks", () => {
  it("splits paragraphs and bullet lists", () => {
    const text = "Lysozyme is small.\nIt cuts walls.\n\nKey parts:\n- Glu35 donates a proton\n* Asp52 stabilises\n\nFrom general knowledge: it is in tears.";
    expect(answerBlocks(text)).toEqual([
      { kind: "p", text: "Lysozyme is small. It cuts walls." },
      { kind: "p", text: "Key parts:" },
      { kind: "ul", items: ["Glu35 donates a proton", "Asp52 stabilises"] },
      { kind: "p", text: "From general knowledge: it is in tears." },
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(answerBlocks("  \n\n ")).toEqual([]);
  });
});

describe("explainError", () => {
  it("prefers the backend's detail", () => {
    const e = new ApiError(503, "Service Unavailable", { detail: "Set EXPLAIN_API_KEY." });
    expect(explainError(e)).toBe("Set EXPLAIN_API_KEY.");
    expect(explainError(new ApiError(500, "x", null))).toMatch(/500/);
    expect(explainError(new Error("offline"))).toBe("offline");
  });
});
