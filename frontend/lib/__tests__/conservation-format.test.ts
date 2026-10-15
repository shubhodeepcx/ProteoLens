import { describe, expect, it } from "vitest";
import {
  CONSERVED_BITS,
  MIDPOINT_BITS,
  bits,
  conservationColor,
  conservationColors,
} from "@/lib/conservation-format";

describe("conservation-format", () => {
  it("runs turquoise to white to maroon on a fixed bits scale", () => {
    expect(conservationColor(0)).toBe(0x10c8d1);
    expect(conservationColor(MIDPOINT_BITS)).toBe(0xffffff);
    expect(conservationColor(CONSERVED_BITS)).toBe(0xa02560);
    expect(conservationColor(4.3)).toBe(0xa02560);
  });

  it("colours every structure copy of a residue", () => {
    const colors = conservationColors([
      {
        position: 10,
        residue: "G",
        information: 2.85,
        dominant: "G",
        dominant_probability: 0.8,
        keys: ["A:11", "B:11"],
      },
      {
        position: 12,
        residue: "G",
        information: 0.5,
        dominant: "S",
        dominant_probability: 0.2,
        keys: [],
      },
    ]);
    expect(colors).toEqual({ "A:11": 0xa02560, "B:11": 0xa02560 });
  });

  it("formats bits", () => {
    expect(bits(2.849)).toBe("2.8 bits");
  });
});
