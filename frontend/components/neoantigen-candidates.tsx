"use client";

import { useStore } from "@/lib/store";
import type { NeoantigenCandidate } from "@/lib/neoantigen-types";
import {
  comparisonLabel,
  rankLabel,
  splitPeptide,
} from "@/lib/neoantigen-format";

/** One row per mutant peptide + allele; clicking selects the peptide in 3D. */
export function NeoantigenCandidates({
  candidates,
}: {
  candidates: readonly NeoantigenCandidate[];
}) {
  const setSelection = useStore((s) => s.setSelection);
  return (
    <ul className="space-y-1" aria-label="Neoantigen candidates">
      {candidates.map((c, i) => {
        const [before, mutated, after] = splitPeptide(
          c.peptide,
          c.mutant_offset,
        );
        return (
          <li key={`${c.allele}-${c.start}-${c.length}-${i}`}>
            <button
              type="button"
              onClick={() => setSelection(c.residue_keys)}
              disabled={c.residue_keys.length === 0}
              className="w-full rounded border border-border px-2 py-1.5 text-left hover:border-foreground/30 disabled:cursor-default"
            >
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-xs tracking-wide text-foreground">
                  {before}
                  <span className="rounded-sm bg-violet-600/70 px-px text-[#fff]">
                    {mutated}
                  </span>
                  {after}
                </span>
                <span className="text-[10px] text-muted-foreground">{c.allele}</span>
                <span
                  className={`ml-auto rounded px-1.5 text-[10px] ${
                    c.binding === "strong"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {c.binding} · {rankLabel(c.mutant_rank)}
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                wild type{" "}
                <span className="font-mono">{c.wild_type || "?"}</span>{" "}
                {rankLabel(c.wild_type_rank)} · {comparisonLabel(c)}
                {c.anchor
                  ? " · change at an anchor position"
                  : " · change faces the T-cell receptor"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
