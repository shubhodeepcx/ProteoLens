"use client";

import { useState } from "react";
import { bp, type CrisprResponse, type PrimerResponse } from "@/lib/seqtools";
import { SequenceMap } from "./sequence-map";
import { CopyButton, Empty, Notes, TD, TH } from "./tool-results-shared";

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
