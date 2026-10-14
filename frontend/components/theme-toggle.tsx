"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Sparkles } from "lucide-react";

/**
 * Switches between the retro theme (default) and the classic light theme.
 * Fixed to the bottom-left corner so every page gets it without each
 * header carrying its own copy; hidden in print.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes only knows the theme after hydration; render nothing until
  // then so server and client markup agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const retro = resolvedTheme !== "light";
  const next = retro ? "light" : "retro";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={retro ? "Switch to the classic theme" : "Switch to the retro theme"}
      title={retro ? "Classic theme" : "Retro theme"}
      className="theme-toggle no-print fixed bottom-4 left-4 z-50 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
    >
      {retro ? <Monitor className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
      {retro ? "Classic" : "Retro"}
    </button>
  );
}
