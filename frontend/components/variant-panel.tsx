"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { VariantImpact } from "@/lib/types";
import { CONCERN_STYLE, Chemistry, Site } from "@/components/variant-panel-parts";

/**
 * A2 — where a protein variant sits in this structure and what it touches.
 *
 * Type a change ("R175H", "p.Arg175His", "W53*", "F508del"); the backend maps
 * it through the UniProt sequence when it can, finds every copy of the
 * residue, and measures burial, neighbours, interfaces, DNA/RNA, ligands and
 * disulfides. The variant residue is selected in 3D through the same
 * `setSelection` every other panel uses.
 *
 * The verdict is a set of structural rules of thumb with their reasons, never
 * a pathogenicity score. The panel says so under every result.
 */

const EXAMPLES = ["R175H", "p.Gly12Cys", "W53*", "F508del"];

export function VariantPanel({ proteinId }: { proteinId: string }) {
  const setSelection = useStore((s) => s.setSelection);
  const [notation, setNotation] = useState("");
  const [impact, setImpact] = useState<VariantImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<VariantImpact>(`/api/proteins/${proteinId}/variant`, {
        notation: trimmed,
      });
      setImpact(result);
      setSelection(result.sites.map((s) => s.residue.key));
    } catch (err) {
      setImpact(null);
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Variant analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <form
        className="space-y-2 border-b border-border px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(notation);
        }}
      >
        <label htmlFor="variant-input" className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Protein variant
        </label>
        <div className="flex gap-2">
          <input
            id="variant-input"
            value={notation}
            onChange={(e) => setNotation(e.target.value)}
            placeholder="e.g. R175H or p.Arg175His"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !notation.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Search className="size-3.5" aria-hidden />}
            Analyse
          </button>
        </div>
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          Try:
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setNotation(example);
                void run(example);
              }}
              className="rounded border border-border px-1 font-mono hover:border-ring hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 px-3 py-3 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {impact && (
        <section className="space-y-3 px-3 py-3" aria-label={`Impact of ${impact.hgvs}`}>
          <header className="flex items-baseline gap-2">
            <h3 className="font-mono text-sm font-semibold text-foreground">{impact.hgvs}</h3>
            <span className="text-[11px] text-muted-foreground">{impact.kind}</span>
            <span className={cn("ml-auto rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", CONCERN_STYLE[impact.concern])}>
              {impact.concern} concern
            </span>
          </header>
          {impact.truncated_residues !== null && (
            <p className="text-[11px] text-foreground">
              {impact.truncated_residues} residues of this chain are never made.
            </p>
          )}
          <Chemistry impact={impact} />
          <ul className="space-y-2">
            {impact.sites.map((site) => (
              <Site key={site.residue.key} site={site} cutoff={impact.neighbour_cutoff} />
            ))}
          </ul>
          <ul className="space-y-1 text-[10px] leading-relaxed text-muted-foreground" data-testid="variant-notes">
            <li>{impact.numbering_note}</li>
            {impact.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {!impact && !error && (
        <p className="px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Enter a protein change to see where it sits in this structure: buried or exposed,
          what it touches, and which structural rules of thumb it trips. Clinical numbering is
          mapped through UniProt when an entry is available.
        </p>
      )}
    </div>
  );
}
