import React from "react";
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="retro" themes={["retro", "light"]} enableSystem={false}>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeAll(() => {
    // jsdom has no matchMedia; next-themes queries it for the system theme.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    document.documentElement.className = "";
    try {
      window.localStorage.clear();
    } catch {
      // storage can be unavailable in some runners
    }
  });

  it("starts in the retro theme and offers the classic one", async () => {
    renderToggle();
    const button = await screen.findByRole("button", { name: /classic theme/i });
    expect(button).toBeInTheDocument();
    expect(document.documentElement.classList.contains("retro")).toBe(true);
  });

  it("switches the html class to light and back", async () => {
    renderToggle();
    fireEvent.click(await screen.findByRole("button", { name: /classic theme/i }));
    const back = await screen.findByRole("button", { name: /retro theme/i });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("retro")).toBe(false);
    fireEvent.click(back);
    await screen.findByRole("button", { name: /classic theme/i });
    expect(document.documentElement.classList.contains("retro")).toBe(true);
  });
});
