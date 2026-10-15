"use client";

import { useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { OverlayToggle } from "@/components/overlay-toggle";
import { NeoantigenCandidates } from "@/components/neoantigen-candidates";
import { SectionTitle } from "@/components/oncology-sections";
import {
  COMMON_ALLELES,
  DEFAULT_ALLELES,
  EPITOPE_LEGEND,
  epitopeColors,
  looksLikeMissense,
  neoantigenPath,
} from "@/lib/neoantigen-format";
import type { NeoantigenReport } from "@/lib/neoantigen-types";

/**
 * Neoantigens tab: which mutant peptides from one missense change are likely
 * to be shown to T cells on HLA class I (NetMHCpan 4.1 through IEDB). A step
 * from tumour mutation to cancer vaccine or T-cell therapy target.
 */
export function NeoantigenPanel({ proteinId }: { proteinId: string }) {
  const [change, setChange] = useState("");
  const [alleles, setAlleles] = useState<string[]>([...DEFAULT_ALLELES]);
  const [path, setPath] = useState<string | null>(null);
  const { data, loading, error, reload } =
    useApiResource<NeoantigenReport>(path);
  const valid = looksLikeMissense(change) && alleles.length > 0;

  const toggle = (a: string) =>
    setAlleles((cur) =>
      cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a],
    );

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setPath(neoantigenPath(proteinId, change, alleles));
        }}
      >
        <div className="flex gap-1.5">
          <input
            aria-label="Missense change"
            placeholder="Missense change, e.g. G12C"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            className="h-7 flex-1 rounded border border-border bg-muted/50 px-2 text-xs"
          />
          <button
            type="submit"
            disabled={!valid || loading}
            className="h-7 rounded bg-primary px-2.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Predict
          </button>
        </div>
        <fieldset className="flex flex-wrap gap-x-3 gap-y-1">
          <legend className="sr-only">HLA alleles</legend>
          {COMMON_ALLELES.map((a) => (
            <label
              key={a}
              className="flex items-center gap-1 text-[11px] text-foreground/80"
            >
              <input
                type="checkbox"
                checked={alleles.includes(a)}
                onChange={() => toggle(a)}
              />
              {a.replace("HLA-", "")}
            </label>
          ))}
        </fieldset>
      </form>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Scoring every 8-11mer with NetMHCpan on IEDB. This takes about a
          minute.
        </p>
      ) : error ? (
        <div role="alert" className="space-y-1 text-xs text-red-700">
          <p className="flex items-center gap-1.5">
            <AlertCircle className="size-4" aria-hidden />
            {error}
          </p>
          <button
            type="button"
            onClick={reload}
            className="text-[11px] text-sky-700 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : data ? (
        <Results data={data} />
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Enter a tumour mutation to list the mutant peptides predicted to be
          presented on the chosen HLA class I alleles, each next to its
          wild-type peptide.
        </p>
      )}
    </div>
  );
}

function Results({ data }: { data: NeoantigenReport }) {
  if (!data.change) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {data.resolution_note || "No UniProt sequence for this structure."}
      </p>
    );
  }
  const colors = epitopeColors(data.candidates, data.variant_keys);
  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground/80">
        {data.gene} {data.change}: {data.candidates.length} binders among{" "}
        {data.peptides_scored} mutant peptides on {data.alleles.length} alleles.
      </p>
      <OverlayToggle
        choices={[
          {
            label: "Neoantigen epitopes",
            build: () =>
              data.candidates.some((c) => c.residue_keys.length)
                ? {
                    label: "Neoantigen epitopes",
                    colors,
                    legend: EPITOPE_LEGEND,
                  }
                : null,
            unavailableReason:
              "No candidate peptide is resolved in this structure.",
          },
        ]}
      />
      <SectionTitle>Candidates, best first</SectionTitle>
      {data.candidates.length ? (
        <NeoantigenCandidates candidates={data.candidates} />
      ) : (
        <p className="text-xs text-muted-foreground">
          No mutant peptide ranks in the top 2% for these alleles.
        </p>
      )}
      {data.notes.map((n) => (
        <p key={n} className="text-[11px] text-amber-700">
          {n}
        </p>
      ))}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {data.method}. Percentile rank against random peptides: under 0.5% is a
        strong binder, under 2% a weak one. Presentation is necessary, not
        sufficient: whether a T cell responds is not predicted here.
      </p>
    </div>
  );
}
