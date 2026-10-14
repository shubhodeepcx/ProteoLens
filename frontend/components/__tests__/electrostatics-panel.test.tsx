import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ElectrostaticsPanel } from "@/components/electrostatics-panel";
import { clearElectrostaticsCache } from "@/lib/electrostatics";
import { useStore } from "@/lib/store";
import { SAMPLE } from "@/lib/__tests__/electrostatics-sample";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

beforeEach(() => {
  act(() => useStore.setState({ coloring: "chain", selected: new Set<string>() }));
});

afterEach(() => {
  cleanup();
  clearElectrostaticsCache();
  vi.unstubAllGlobals();
});

describe("ElectrostaticsPanel", () => {
  it("shows the summary, selects a patch and toggles structure colouring", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(SAMPLE)));
    render(<ElectrostaticsPanel proteinId="p1" />);

    await screen.findByTestId("electrostatics");
    expect(screen.getByText("120")).toBeTruthy(); // dipole, D
    expect(screen.getByText("4.50")).toBeTruthy(); // chain A pI
    expect(screen.getByText("K33 R5A")).toBeTruthy();

    fireEvent.click(screen.getByText(/Basic · 2 residues/));
    expect([...useStore.getState().selected]).toEqual(["A:1", "B:1"]);

    fireEvent.click(screen.getByRole("button", { name: /colour structure by potential/i }));
    expect(useStore.getState().coloring).toBe("electrostatics");
    fireEvent.click(screen.getByRole("button", { name: /showing on structure/i }));
    expect(useStore.getState().coloring).toBe("chain");

    fireEvent.change(screen.getByLabelText("Chain"), { target: { value: "1" } });
    expect(screen.getByText("11.20")).toBeTruthy();
  });

  it("reports a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "Protein not found" }, 404)));
    render(<ElectrostaticsPanel proteinId="missing" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Electrostatics failed/);
  });

  it("explains an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...SAMPLE, chains: [], patches: [], notes: ["No protein chain."] })),
    );
    render(<ElectrostaticsPanel proteinId="empty" />);
    expect(await screen.findByText("No protein chain.")).toBeTruthy();
  });
});
