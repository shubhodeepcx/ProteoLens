"use client";

import { ExternalLink, Loader2, Telescope } from "lucide-react";
import type { BlastResult } from "@/lib/types";
import { formatCount, formatEValue, formatPercent, queryCoverage } from "@/lib/blast-format";
import { useProteinImport } from "@/lib/use-protein-import";

/**
 * The BLAST results table (P8): accession, description, identity %, E-value,
 * score — plus the link back into the import flow, so a hit can be opened.
 *
 * "Open" appears only when the hit carries a `uniprot_accession`. A nucleotide
 * hit's ENA identifier has no importer, and a button that could only ever fail
 * is worse than no button.
 */
export function BlastHitsTable({ result }: { result: BlastResult }) {
  const { importingId, error, open } = useProteinImport();

  if (result.hit_count === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
        <Telescope className="size-5 text-muted-foreground/70" aria-hidden />
        <p className="text-xs text-muted-foreground">No hits above the E-value threshold.</p>
        <p className="text-[11px] text-muted-foreground">
          Try a larger threshold, or a broader database than {result.databases[0] ?? "this one"}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">
            {result.hit_count} BLAST hits, best alignment per subject
          </caption>
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-1 pr-2 font-medium">Hit</th>
              <th scope="col" className="py-1 pr-2 font-medium">Description</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Identity</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">E-value</th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Score</th>
              <th scope="col" className="py-1 font-medium"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {result.hits.map((hit) => {
              const coverage = queryCoverage(hit.align_length, result.query_length);
              const busy = importingId === hit.uniprot_accession;
              return (
                <tr
                  key={`${hit.rank}-${hit.accession}`}
                  data-testid={`blast-hit-${hit.accession}`}
                  className="border-b border-border align-top"
                >
                  <td className="py-1.5 pr-2">
                    {hit.url ? (
                      <a
                        href={hit.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-700 hover:underline"
                      >
                        {hit.accession}
                        <ExternalLink className="size-2.5 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-mono text-[11px] text-foreground/80">{hit.accession}</span>
                    )}
                    {hit.organism && (
                      <div className="mt-0.5 text-[10px] italic text-muted-foreground">{hit.organism}</div>
                    )}
                  </td>
                  <td className="max-w-[16rem] py-1.5 pr-2 text-[11px] text-foreground/80">
                    {hit.description ?? hit.entry_id ?? "—"}
                    {hit.length !== null && (
                      <span className="ml-1 text-[10px] text-muted-foreground/70">
                        {formatCount(hit.length)} aa
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-[11px] tabular-nums text-foreground">
                    {formatPercent(hit.identity_percent)}
                    {coverage !== null && (
                      <div className="text-[10px] text-muted-foreground/70">
                        {formatPercent(coverage)} cov
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-[11px] tabular-nums text-foreground">
                    {formatEValue(hit.expect)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-[11px] tabular-nums text-foreground/80">
                    {formatCount(hit.score)}
                  </td>
                  <td className="py-1.5 text-right">
                    {hit.uniprot_accession ? (
                      <button
                        type="button"
                        onClick={() => void open(hit.uniprot_accession as string)}
                        disabled={importingId !== null}
                        aria-busy={busy}
                        aria-label={`Open ${hit.accession} in the viewer`}
                        className="inline-flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] text-foreground hover:border-ring hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy && <Loader2 className="size-2.5 animate-spin" aria-hidden />}
                        {busy ? "Opening…" : "Open"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/70">no structure</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
