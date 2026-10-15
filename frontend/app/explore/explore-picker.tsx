"use client";

import { useState } from "react";
import type { Scenario } from "@/lib/explorer-types";
import type { ExplorerQuery } from "@/lib/explorer-format";

/** Guided scenarios as chips, plus any human gene and protein change. */
export function ExplorePicker({
  scenarios,
  current,
  onPick,
}: {
  scenarios: Scenario[];
  current: ExplorerQuery;
  onPick: (q: ExplorerQuery) => void;
}) {
  const [gene, setGene] = useState("gene" in current ? current.gene : "");
  const [change, setChange] = useState("gene" in current ? current.change : "");

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-wrap gap-1.5" aria-label="Scenarios">
        {scenarios.map((s) => {
          const active = "scenario" in current && current.scenario === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onPick({ scenario: s.id })}
              aria-pressed={active}
              title={s.summary}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {s.title}
              <span className="ml-1.5 text-[10px] text-zinc-500">
                {s.field}
              </span>
            </button>
          );
        })}
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (gene.trim() && change.trim())
            onPick({ gene: gene.trim(), change: change.trim() });
        }}
      >
        <input
          aria-label="Gene"
          placeholder="Gene (BRCA1)"
          value={gene}
          onChange={(e) => setGene(e.target.value)}
          className="h-8 w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs"
        />
        <input
          aria-label="Protein change"
          placeholder="Change (C61G)"
          value={change}
          onChange={(e) => setChange(e.target.value)}
          className="h-8 w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs"
        />
        <button
          type="submit"
          className="h-8 rounded-md bg-zinc-800 px-3 text-xs text-zinc-100 hover:bg-zinc-700"
        >
          Explore
        </button>
      </form>
    </div>
  );
}
