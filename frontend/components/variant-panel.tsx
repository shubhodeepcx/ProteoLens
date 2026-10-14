"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type {
  VariantConcern,
  VariantFlag,
  VariantImpact,
  VariantSite,
} from "@/lib/types";
import { ResidueChip, ResidueChips } from "@/components/functional-residues";

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

const CONCERN_STYLE: Record<VariantConcern, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  moderate: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const FLAG_DOT: Record<VariantFlag["severity"], string> = {
  high: "bg-red-500",
  moderate: "bg-amber-500",
  info: "bg-sky-500",
};

function signed(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function Chemistry({ impact }: { impact: VariantImpact }) {
  const c = impact.physicochemistry;
  if (c.volume_alt === null) return null;
  const rows: [string, string][] = [
    ["Volume", `${c.volume_ref.toFixed(0)} → ${c.volume_alt.toFixed(0)} Å³ (${signed(c.volume_alt - c.volume_ref, 0)})`],
    ["Hydropathy", `${c.hydropathy_ref.toFixed(1)} → ${(c.hydropathy_alt ?? 0).toFixed(1)}`],
    ["Charge", `${signed(c.charge_ref, 0)} → ${signed(c.charge_alt ?? 0, 0)}`],
    ["BLOSUM62", c.blosum62 === null ? "n/a" : String(c.blosum62)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono tabular-nums text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Site({ site, cutoff }: { site: VariantSite; cutoff: number }) {
  return (
    <li className="space-y-2 rounded-md border border-border p-2.5" data-testid={`variant-site-${site.residue.key}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ResidueChip residue={site.residue} />
        {site.burial && (
          <span className="text-muted-foreground">
            {site.burial} ({Math.round((site.relative_accessibility ?? 0) * 100)}% accessible)
          </span>
        )}
        <span className={cn("ml-auto rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", CONCERN_STYLE[site.concern])}>
          {site.concern}
        </span>
      </div>
      {site.flags.length > 0 && (
        <ul className="space-y-1">
          {site.flags.map((flag) => (
            <li key={flag.code} className="flex gap-2 text-[11px] leading-relaxed text-foreground">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", FLAG_DOT[flag.severity])} aria-hidden />
              <span>{flag.text}</span>
            </li>
          ))}
        </ul>
      )}
      {site.neighbours.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Neighbours within {cutoff} Å
          </p>
          <ResidueChips residues={site.neighbours} label={`the neighbours of ${site.residue.key}`} />
        </div>
      )}
    </li>
  );
}

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
