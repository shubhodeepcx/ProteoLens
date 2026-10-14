import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ExplainSheet } from "@/components/explain-sheet";
import { useStore } from "@/lib/store";

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

beforeEach(() => {
  act(() => useStore.setState({ selected: new Set(["A:35", "A:52"]) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExplainSheet", () => {
  it("sends the question, level and selection, and renders the answer with its facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        answer: "Two catalytic acids.\n\n- Glu35\n- Asp52",
        model: "test-model",
        facts: ["1 protein chain(s), 129 residues."],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ExplainSheet proteinId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /explain/i }));

    expect(await screen.findByText(/2 selected residues/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Expert" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: " Why these two? " } });
    fireEvent.click(screen.getAllByRole("button", { name: /^explain$/i }).at(-1)!);

    expect(await screen.findByText("Two catalytic acids.")).toBeTruthy();
    expect(screen.getByText("Glu35")).toBeTruthy();
    expect(screen.getByText(/Grounded in 1 measured facts · test-model/)).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/proteins/p1/explain");
    expect(JSON.parse(init.body as string)).toEqual({
      question: "Why these two?",
      selection: ["A:35", "A:52"],
      level: "expert",
    });
  });

  it("shows the backend's reason when the assistant is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ detail: "The Explain assistant needs EXPLAIN_API_KEY set in the backend's environment." }, 503),
      ),
    );
    render(<ExplainSheet proteinId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /explain/i }));
    await screen.findByLabelText("Question");
    fireEvent.click(screen.getAllByRole("button", { name: /^explain$/i }).at(-1)!);
    expect((await screen.findByRole("alert")).textContent).toMatch(/EXPLAIN_API_KEY/);
  });
});
