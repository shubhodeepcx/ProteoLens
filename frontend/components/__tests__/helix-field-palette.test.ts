import { describe, it, expect } from "vitest";
import {
  HELIX_PALETTES,
  createHelixFieldState,
  setHelixPalette,
} from "@/components/helix-field-draw";

describe("helix field palettes", () => {
  it("defaults to the classic blue and mixes deep to light across tones", () => {
    const state = createHelixFieldState(0);
    expect(state.palette).toBe("classic");
    expect(state.tones[0]).toBe(HELIX_PALETTES.classic.deep.join(","));
    expect(state.tones.at(-1)).toBe(HELIX_PALETTES.classic.light.join(","));
  });

  it("switches to the retro neon tones in place", () => {
    const state = createHelixFieldState(0);
    setHelixPalette(state, "retro");
    expect(state.palette).toBe("retro");
    expect(state.tones[0]).toBe("255,60,172");
    expect(state.tones.at(-1)).toBe("46,230,255");
  });
});
