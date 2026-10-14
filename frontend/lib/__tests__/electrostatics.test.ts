import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearElectrostaticsCache,
  fetchElectrostatics,
  potentialByKey,
  residueLabel,
  signed,
} from "@/lib/electrostatics";
import { SAMPLE } from "@/lib/__tests__/electrostatics-sample";


function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

afterEach(() => {
  clearElectrostaticsCache();
  vi.unstubAllGlobals();
});

describe("electrostatics helpers", () => {
  it("keys potentials by chain and 1-based ordinal", () => {
    const map = potentialByKey(SAMPLE);
    expect(map.get("A:1")).toBe(6.5);
    expect(map.get("A:3")).toBe(-7.25);
    expect(map.get("B:1")).toBe(8);
    expect(map.size).toBe(4);
  });

  it("labels residues by the file's own numbering", () => {
    expect(residueLabel(SAMPLE.patches[0].residues[0])).toBe("K33");
    expect(residueLabel(SAMPLE.patches[0].residues[1])).toBe("R5A");
  });

  it("signs values", () => {
    expect(signed(8.1, "e")).toBe("+8.1 e");
    expect(signed(-2)).toBe("-2");
    expect(signed(0)).toBe("0");
  });

  it("fetches once per protein and retries after a failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "boom" }, 500))
      .mockResolvedValue(jsonResponse(SAMPLE));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchElectrostatics("p1")).rejects.toBeTruthy();
    const [a, b] = await Promise.all([fetchElectrostatics("p1"), fetchElectrostatics("p1")]);
    expect(a).toEqual(SAMPLE);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/proteins/p1/electrostatics");
  });
});
