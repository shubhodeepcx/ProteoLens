import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LandingHeader } from "@/components/landing-header";

describe("LandingHeader", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("links to every top-level route", () => {
    // HealthPill polls the backend on mount; keep it offline.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<LandingHeader />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/search", "/explore", "/tools", "#upload"]),
    );
    expect(screen.getByText("ProteoLens")).toBeTruthy();
  });
});
