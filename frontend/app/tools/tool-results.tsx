"use client";

import { useState } from "react";
import { bp, frameLabel, type OrfResponse, type RestrictionResponse } from "@/lib/seqtools";
import { SequenceMap } from "./sequence-map";
import { CopyButton, Empty, TD, TH } from "./tool-results-shared";

export { CrisprResults, PrimerResults } from "./design-results";

// ---------------------------------------------------------------- ORFs

export function OrfResults({ data }: { data: OrfResponse }) {
  const [open, setOpen] = useState<number | null>(0);
  const { stats } = data;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Length", bp(stats.length)],
          ["GC content", `${stats.gc_percent}%`],
          ["dsDNA mass", stats.molecular_weight_ds ? `${(stats.molecular_weight_ds / 1000).toFixed(1)} kDa` : "n/a (contains N)"],
          ["ORFs found", String(data.orfs.length)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-card px-3 py-2">
            <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{k}</dt>
            <dd className="text-sm font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <SequenceMap
        label="Open reading frames along the sequence"
        length={stats.length}
        spans={data.orfs.map((o, i) => ({
          key: `${o.frame}-${o.start}`,
          start: o.start,
          end: o.end,
          strand: o.strand,
          label: `ORF ${i + 1}, frame ${frameLabel(o.frame)}, ${o.length_aa} aa`,
          tone: i === open ? "primary" : "muted",
        }))}
      />
      {data.orfs.length === 0 ? (
        <Empty>No ORF reaches the minimum length. Lower it, or switch off &ldquo;start at ATG&rdquo;.</Empty>
      ) : (
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>Frame</th>
              <th className={TH}>Location</th>
              <th className={TH}>Length</th>
              <th className={TH}>Protein</th>
            </tr>
          </thead>
          <tbody>
            {data.orfs.slice(0, 50).map((o, i) => (
              <tr
                key={`${o.frame}-${o.start}`}
                className={`cursor-pointer border-b border-border/60 hover:bg-muted/60 ${i === open ? "bg-muted/60" : ""}`}
                onClick={() => setOpen(i === open ? null : i)}
              >
                <td className={TD}>{i + 1}</td>
                <td className={TD}>{frameLabel(o.frame)}</td>
                <td className={TD}>
                  {o.start}..{o.end}
                  {!o.complete && <span className="ml-1 text-amber-700">(no stop)</span>}
                </td>
                <td className={TD}>{o.length_aa} aa</td>
                <td className={`${TD} font-mono text-[11px] break-all`}>
                  {i === open ? o.protein : `${o.protein.slice(0, 24)}${o.protein.length > 24 ? "…" : ""}`}
                  {i === open && <CopyButton text={o.protein} label={`ORF ${i + 1} protein`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Six-frame translation</summary>
        <div className="mt-2 space-y-2 font-mono text-[11px]">
          {data.frames.map((f) => (
            <p key={f.frame} className="break-all">
              <span className="mr-2 font-semibold text-muted-foreground">{frameLabel(f.frame)}</span>
              {f.protein}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- restriction

export function RestrictionResults({ data }: { data: RestrictionResponse }) {
  const [only, setOnly] = useState(true);
  const shown = only ? data.enzymes.filter((e) => e.cuts.length === 1) : data.enzymes;
  return (
    <div className="space-y-4">
      <SequenceMap
        label="Restriction sites along the sequence"
        length={data.length}
        marks={shown.flatMap((e) => e.cuts.map((c) => ({ key: `${e.name}-${c}`, position: c, label: e.name })))}
      />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
        Show unique cutters only ({data.unique_cutters.length})
      </label>
      {shown.length === 0 ? (
        <Empty>No enzyme in the panel cuts this sequence {only ? "exactly once" : ""}.</Empty>
      ) : (
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              <th className={TH}>Enzyme</th>
              <th className={TH}>Site</th>
              <th className={TH}>Ends</th>
              <th className={TH}>Cuts at</th>
              <th className={TH}>Fragments ({data.circular ? "circular" : "linear"})</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.name} className="border-b border-border/60">
                <td className={`${TD} font-medium`}>{e.name}</td>
                <td className={`${TD} font-mono text-[11px]`}>{e.site}</td>
                <td className={TD}>{e.overhang === "blunt" ? "blunt" : `${e.overhang} overhang`}</td>
                <td className={TD}>{e.cuts.join(", ")}</td>
                <td className={TD}>{e.fragments.map((f) => f.toLocaleString("en-US")).join(" + ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-muted-foreground">
        Positions are the first base after the top-strand cut. Do not cut:{" "}
        {data.non_cutters.join(", ") || "none"}.
      </p>
    </div>
  );
}
