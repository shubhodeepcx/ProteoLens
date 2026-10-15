"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Outbound } from "@/components/annotation-section";
import { percent, phaseLabel } from "@/lib/oncology-format";
import type {
  CancerTypeFrequency,
  Drug,
  EvidenceItem,
  Hotspot,
  Interactor,
  Pathway,
} from "@/lib/oncology-types";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{children}</h3>
  );
}

export function HotspotList({ hotspots }: { hotspots: readonly Hotspot[] }) {
  const setSelection = useStore((s) => s.setSelection);
  return (
    <ul className="space-y-1.5">
      {hotspots.slice(0, 8).map((h) => (
        <li key={h.residue} className="text-[11px]">
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              disabled={h.keys.length === 0}
              onClick={() => setSelection(h.keys)}
              className="font-mono font-semibold text-foreground hover:text-sky-700 disabled:text-muted-foreground"
            >
              {h.residue}
            </button>
            <span className="text-muted-foreground">{h.tumor_count.toLocaleString()} tumours</span>
            <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
              {h.alternates.map((a) => `${a.label}·${a.count}`).join(" ")}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {h.tumor_types.map((t) => `${t.label} ${t.count}`).join(", ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CancerTypeBars({ rows }: { rows: readonly CancerTypeFrequency[] }) {
  const top = rows[0]?.fraction || 1;
  return (
    <ul className="space-y-1">
      {rows.slice(0, 8).map((r) => (
        <li key={r.study_id} className="text-[11px] text-foreground/80">
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.cancer_type}</span>
            <span className="font-mono text-muted-foreground">
              {percent(r.fraction)} · {r.mutated_samples}/{r.samples}
            </span>
          </div>
          <div className="mt-0.5 h-1 rounded bg-muted">
            <div className="h-1 rounded bg-orange-500/80" style={{ width: `${(r.fraction / top) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DrugList({ drugs }: { drugs: readonly Drug[] }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {drugs.slice(0, 12).map((d) => (
        <li key={d.chembl_id} className="px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <Outbound href={d.url}>{d.name}</Outbound>
            {d.variant && (
              <span className="rounded bg-violet-500/20 px-1 text-[10px] text-violet-700">
                {d.variant}-specific
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {phaseLabel(d.max_phase)}
              {d.first_approval ? ` ${d.first_approval}` : ""}
            </span>
          </div>
          {d.mechanism && <p className="text-[10px] text-muted-foreground">{d.mechanism}</p>}
        </li>
      ))}
    </ul>
  );
}

const SIGNIFICANCE_TONE: Record<string, string> = {
  Resistance: "text-red-700",
  "Sensitivity/response": "text-emerald-700",
  "Poor outcome": "text-amber-700",
  "Better outcome": "text-sky-700",
};

export function EvidenceList({ items, total }: { items: readonly EvidenceItem[]; total: number }) {
  const setSelection = useStore((s) => s.setSelection);
  const [shown, setShown] = useState(15);
  return (
    <div className="space-y-1.5">
      <ul className="divide-y divide-border rounded-md border border-border">
        {items.slice(0, shown).map((e) => (
          <li key={e.id} className="px-2.5 py-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={e.keys.length === 0}
                onClick={() => setSelection(e.keys)}
                className="font-medium text-foreground hover:text-sky-700 disabled:text-foreground/80"
              >
                {e.profile}
              </button>
              <span className="ml-auto rounded bg-muted px-1 font-mono text-[10px] text-foreground/80" title="CIViC evidence level">
                {e.level ?? "?"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              <span className={SIGNIFICANCE_TONE[e.significance ?? ""] ?? "text-foreground/80"}>
                {e.evidence_type}
                {e.significance ? `: ${e.significance}` : ""}
              </span>
              {e.therapies.length > 0 && ` · ${e.therapies.join(" + ")}`}
              {e.disease && ` · ${e.disease}`}{" "}
              <Outbound href={e.url}>EID{e.id}</Outbound>
            </p>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        {Math.min(shown, items.length)} of {total} accepted CIViC items.{" "}
        {items.length > shown && (
          <button type="button" className="text-sky-700 hover:underline" onClick={() => setShown((n) => n + 15)}>
            Show more
          </button>
        )}
      </p>
    </div>
  );
}

export function PathwayList({ pathways, total }: { pathways: readonly Pathway[]; total: number }) {
  return (
    <div>
      <ul className="flex flex-wrap gap-1">
        {pathways.slice(0, 14).map((p) => (
          <li key={p.id} className="rounded border border-border px-1.5 py-0.5 text-[10px]">
            <Outbound href={p.url}>
              {p.in_disease ? "⚠ " : ""}
              {p.name}
            </Outbound>
          </li>
        ))}
      </ul>
      {total > 14 && <p className="mt-1 text-[10px] text-muted-foreground">{total} Reactome pathways in all; disease pathways (⚠) first.</p>}
    </div>
  );
}

export function InteractorList({ interactors }: { interactors: readonly Interactor[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {interactors.map((i) => (
        <li key={i.name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80" title={`STRING combined score ${i.score}`}>
          {i.name} <span className="text-muted-foreground">{i.score.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}
