import { describe, expect, it } from "vitest";
import { selectKeyFromSearch, viewerHref } from "@/lib/deep-link";

describe("deep-link", () => {
  it("accepts a residue key", () => {
    expect(selectKeyFromSearch("?select=A:7")).toBe("A:7");
    expect(selectKeyFromSearch("?select=A%3A175&x=1")).toBe("A:175");
  });

  it("ignores anything else", () => {
    for (const bad of [
      "",
      "?select=",
      "?select=A",
      "?select=A:0",
      "?select=A:7;B:8",
      "?select=<b>:1",
    ]) {
      expect(selectKeyFromSearch(bad)).toBeNull();
    }
  });

  it("builds the viewer link", () => {
    expect(viewerHref("abc", "A:7")).toBe("/viewer/abc?select=A%3A7");
    expect(viewerHref("abc", null)).toBe("/viewer/abc");
  });
});
