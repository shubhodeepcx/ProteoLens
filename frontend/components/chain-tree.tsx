"use client";

import { X } from "lucide-react";
import { useStore } from "@/lib/store";
import { ChainRow } from "@/components/chain-row";

/**
 * Above this many chains the rows start collapsed. Purely a presentation
 * default for a rail that is otherwise mostly empty on a monomer — it is not
 * a limit: nothing is dropped, filtered or truncated at any chain count.
 */
const COLLAPSE_ABOVE_CHAINS = 4;

/**
 * The workspace's left rail: the chain tree the landing page has promised
 * since P0 and that nothing ever built.
 *
 * It drives the *existing* selection slice — `setSelection` — and nothing
 * else. Every highlight it produces therefore travels the P4 path already in
 * place: store → `viewer/[id]/page.tsx` effect → `highlightResidues` → Mol*,
 * and store → sequence panel scroll-to-selected. There is no second selection
 * mechanism here, and a click on a chain is indistinguishable downstream from
 * the same residues being clicked one at a time.
 */
export function ChainTree() {
  const summary = useStore((s) => s.current);
  const selected = useStore((s) => s.selected);
  const setSelection = useStore((s) => s.setSelection);
  const clearSelection = useStore((s) => s.clearSelection);

  const chains = summary?.chains ?? [];
  const total = chains.reduce((sum, c) => sum + c.residue_count, 0);

  // A structure with a handful of chains leaves the rail mostly empty when
  // every row is collapsed — the exact complaint this phase exists to answer —
  // so open them by default while the expanded content plausibly fits. This
  // hides nothing either way: every chain is listed at every count, and the
  // chevron overrides the default in one click.
  const openByDefault = chains.length <= COLLAPSE_ABOVE_CHAINS;

  if (chains.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-xs text-muted-foreground">
          No chains — this structure parsed without a polymer chain.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Chains &amp; residues
        </h2>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {chains.length} chain{chains.length === 1 ? "" : "s"} ·{" "}
          {total.toLocaleString()} aa
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground">
        <span data-testid="chain-tree-selection-count">
          {selected.size.toLocaleString()} selected
        </span>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => clearSelection()}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden className="size-3" />
            Clear
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chains.map((chain) => (
          <ChainRow
            key={chain.id}
            chain={chain}
            share={total === 0 ? 0 : chain.residue_count / total}
            selected={selected}
            onSelect={setSelection}
            defaultOpen={openByDefault}
          />
        ))}
      </div>
    </div>
  );
}
