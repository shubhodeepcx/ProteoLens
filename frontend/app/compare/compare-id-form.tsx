"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";

const INPUT_CLASS =
  "h-8 w-full rounded-md border border-input bg-card px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none";

/**
 * Asks for the two protein ids when `/compare` is opened without both.
 *
 * Ids are the ones the viewer URL carries (`/viewer/{id}`), which is where a
 * user arriving here already is. The path most people should take instead is
 * the search page — one query returns the RCSB experimental entry and the
 * AlphaFold prediction for the same protein, which is A3's headline case — so
 * that link is given equal weight rather than buried.
 */
export function CompareIdForm({
  initialA = "",
  initialB = "",
}: {
  initialA?: string;
  initialB?: string;
}) {
  const router = useRouter();
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);

  const trimmedA = a.trim();
  const trimmedB = b.trim();
  const ready = trimmedA.length > 0 && trimmedB.length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-muted/50 p-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          Choose two structures to compare
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Paste the IDs of two proteins already loaded in ProteoLens (the ID
          at the end of a viewer URL, <code>/viewer/&lt;id&gt;</code>). Or search
          for a protein and import both its experimental structure and AlphaFold
          model.
        </p>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          router.push(
            `/compare?a=${encodeURIComponent(trimmedA)}&b=${encodeURIComponent(trimmedB)}`,
          );
        }}
      >
        <label className="flex-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Protein A
          <input
            className={`mt-1 ${INPUT_CLASS}`}
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="e.g. 3f2a9c1e…"
            aria-label="Protein A id"
          />
        </label>
        <label className="flex-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Protein B
          <input
            className={`mt-1 ${INPUT_CLASS}`}
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder="e.g. 7b1d4e60…"
            aria-label="Protein B id"
          />
        </label>
        <button
          type="submit"
          disabled={!ready}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input bg-muted/70 px-3 text-xs font-medium text-foreground transition-colors hover:border-ring hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          Compare
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </form>

      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-3.5" aria-hidden />
        Search and import structures
      </Link>
    </div>
  );
}
