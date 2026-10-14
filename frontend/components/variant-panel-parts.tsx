import { cn } from "@/lib/utils";
import type {
  VariantConcern,
  VariantFlag,
  VariantImpact,
  VariantSite,
} from "@/lib/types";
import { ResidueChip, ResidueChips } from "@/components/functional-residues";

export const CONCERN_STYLE: Record<VariantConcern, string> = {
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

export function Chemistry({ impact }: { impact: VariantImpact }) {
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

export function Site({ site, cutoff }: { site: VariantSite; cutoff: number }) {
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
