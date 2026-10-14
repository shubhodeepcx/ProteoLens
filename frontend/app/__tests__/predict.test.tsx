import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { PredictView } from "@/app/predict/predict-view";
import { EXAMPLE_SEQUENCE, residueCount } from "@/lib/predict";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

beforeEach(() => push.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("residueCount", () => {
  it("ignores FASTA headers, whitespace and a trailing stop", () => {
    expect(residueCount(">sp|X\nMKT AYI\nAKQ*\n")).toBe(9);
    expect(residueCount("")).toBe(0);
  });
});

describe("PredictView", () => {
  it("is disabled until there is enough sequence, and over the limit", () => {
    render(<PredictView />);
    const button = screen.getByRole("button", { name: /predict structure/i });
    expect(button).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText(/protein sequence/i), { target: { value: "M".repeat(401) } });
    expect(screen.getByTestId("residue-count").textContent).toBe("401 / 400 aa");
    expect(button).toHaveProperty("disabled", true);
  });

  it("folds the example and opens the model in the viewer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "abc123" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PredictView />);
    fireEvent.click(screen.getByRole("button", { name: /load example/i }));
    fireEvent.click(screen.getByRole("button", { name: /predict structure/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/viewer/abc123"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/proteins/predict");
    expect(JSON.parse(init.body as string)).toEqual({
      sequence: EXAMPLE_SEQUENCE,
      name: "Ubiquitin (ESMFold)",
    });
  });

  it("shows the backend's reason when folding is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: "This looks like DNA or RNA." }, 422)),
    );
    render(<PredictView />);
    fireEvent.change(screen.getByLabelText(/protein sequence/i), { target: { value: "ATGCATGCATGC" } });
    fireEvent.click(screen.getByRole("button", { name: /predict structure/i }));
    expect((await screen.findByRole("alert")).textContent).toContain("looks like DNA");
    expect(push).not.toHaveBeenCalled();
  });
});
