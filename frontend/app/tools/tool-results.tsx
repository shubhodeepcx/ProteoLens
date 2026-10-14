"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  bp,
  frameLabel,
  type CrisprResponse,
  type OrfResponse,
  type PrimerResponse,
  type RestrictionResponse,
} from "@/lib/seqtools";
import { SequenceMap } from "./sequence-map";

const TH = "px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-muted-foreground uppercase";
const TD = "px-2 py-1.5 align-top tabular-nums";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="ml-1 inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}

function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

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

// ---------------------------------------------------------------- primers

export function PrimerResults({ data, length }: { data: PrimerResponse; length: number }) {
  const [pick, setPick] = useState(0);
  const pair = data.pairs[pick];
  return (
    <div className="space-y-4">
      <SequenceMap
        label="Primer pair and amplicon"
        length={length}
        highlight={{ start: data.target_start, end: data.target_end }}
        spans={
          pair
            ? [
                { key: "f", start: pair.forward.start, end: pair.forward.end, strand: "+", label: "Forward primer", tone: "emerald" },
                { key: "r", start: pair.reverse.start, end: pair.reverse.end, strand: "-", label: "Reverse primer", tone: "emerald" },
                { key: "p", start: pair.forward.start, end: pair.reverse.end, label: `Product ${bp(pair.product_size)}`, tone: "muted" },
              ]
            : []
        }
      />
      {data.pairs.length === 0 ? (
        <Empty>No primer pair met the criteria for target {data.target_start}..{data.target_end}.</Empty>
      ) : (
        <div className="space-y-2">
          {data.pairs.map((p, i) => (
            <button
              key={`${p.forward.start}-${p.reverse.start}-${p.forward.length}-${p.reverse.length}`}
              type="button"
              onClick={() => setPick(i)}
              className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                i === pick ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/60"
              }`}
            >
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 font-semibold">
                <span>Pair {i + 1}</span>
                <span className="font-normal text-muted-foreground">
                  product {bp(p.product_size)} · ΔTm {p.tm_difference} °C · penalty {p.penalty}
                </span>
              </div>
              {[
                ["F", p.forward],
                ["R", p.reverse],
              ].map(([tag, pr]) => {
                const primer = pr as typeof p.forward;
                return (
                  <div key={tag as string} className="flex flex-wrap items-center gap-x-3 font-mono text-[11px]">
                    <span className="w-3 font-sans font-semibold text-muted-foreground">{tag as string}</span>
                    <span>5&prime;-{primer.sequence}-3&prime;</span>
                    <CopyButton text={primer.sequence} label={`${tag === "F" ? "forward" : "reverse"} primer`} />
                    <span className="font-sans text-muted-foreground">
                      {primer.length} nt · Tm {primer.tm} °C · GC {primer.gc_percent}%
                      {primer.gc_clamp ? " · GC clamp" : ""}
                      {primer.self_dimer_3prime > 3 ? ` · 3′ self-dimer ${primer.self_dimer_3prime} bp` : ""}
                    </span>
                  </div>
                );
              })}
            </button>
          ))}
        </div>
      )}
      <Notes notes={data.notes} />
    </div>
  );
}

// ---------------------------------------------------------------- CRISPR

function scoreTone(score: number): string {
  if (score >= 75) return "bg-emerald-100 text-emerald-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

export function CrisprResults({ data, length }: { data: CrisprResponse; length: number }) {
  return (
    <div className="space-y-4">
      <SequenceMap
        label="CRISPR guides along the sequence"
        length={length}
        spans={data.guides.map((g, i) => ({
          key: `${g.strand}${g.start}`,
          start: g.start,
          end: g.end,
          strand: g.strand,
          label: `Guide ${i + 1}, score ${g.score}`,
          tone: g.score >= 75 ? "emerald" : g.score >= 50 ? "amber" : "rose",
        }))}
      />
      <p className="text-xs text-muted-foreground">
        {data.nuclease}: {data.total_sites} site{data.total_sites === 1 ? "" : "s"} cut in the target; best {data.guides.length} shown.
      </p>
      {data.guides.length === 0 ? (
        <Empty>No NGG PAM cuts inside the target.</Empty>
      ) : (
        <table className="w-full text-xs">
          <thead className="border-b border-border">
            <tr>
              <th className={TH}>Score</th>
              <th className={TH}>Protospacer + PAM</th>
              <th className={TH}>Strand</th>
              <th className={TH}>Cut after</th>
              <th className={TH}>GC</th>
              <th className={TH}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {data.guides.map((g) => (
              <tr key={`${g.strand}${g.start}`} className="border-b border-border/60">
                <td className={TD}>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${scoreTone(g.score)}`}>{g.score}</span>
                </td>
                <td className={`${TD} font-mono text-[11px] whitespace-nowrap`}>
                  {g.protospacer}
                  <span className="text-rose-600">{g.pam}</span>
                  <CopyButton text={g.protospacer} label={`guide ${g.protospacer}`} />
                </td>
                <td className={TD}>{g.strand}</td>
                <td className={TD}>{g.cut_site}</td>
                <td className={TD}>{g.gc_percent}%</td>
                <td className={`${TD} text-[11px] text-muted-foreground`}>{g.flags.join("; ") || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Notes notes={data.notes} />
    </div>
  );
}
