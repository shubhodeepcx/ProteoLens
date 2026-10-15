"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { OverlayToggle, type OverlayChoice } from "@/components/overlay-toggle";
import { ClinicalVariantList } from "@/components/clinical-variant-list";
import {
  AM_LEGEND,
  BURDEN_LEGEND,
  CLASS_META,
  CLASS_ORDER,
  hex,
  residueColors,
} from "@/lib/clinical-format";
import type { ClinicalClass, ClinicalEvidence } from "@/lib/clinical-types";

/**
 * Clinical tab: what ClinVar, UniProt, gnomAD and AlphaMissense say about this
 * protein's variants, mapped onto the structure (spec A2, clinical half).
 */
export function ClinicalPanel({ proteinId }: { proteinId: string }) {
  const { data, loading, error, reload } = useApiResource<ClinicalEvidence>(
    `/api/proteins/${encodeURIComponent(proteinId)}/clinical-evidence`,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="ml-2 text-xs">Fetching variant evidence&hellip;</span>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertCircle className="size-6 text-red-700" aria-hidden />
        <p className="text-xs text-red-700">Clinical evidence failed: {error}</p>
        <button type="button" onClick={reload} className="text-[11px] text-sky-700 hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;
  if (data.variants.length === 0 && !data.alphamissense_available) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Info className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">No clinical variant evidence for this structure.</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {[data.resolution_note, ...data.notes].filter(Boolean).join(" ")}
        </p>
      </div>
    );
  }
  return <ClinicalBody data={data} />;
}

function ClinicalBody({ data }: { data: ClinicalEvidence }) {
  const [filter, setFilter] = useState<ClinicalClass | null>(null);

  const choices = useMemo<OverlayChoice[]>(
    () => [
      {
        label: "AlphaMissense",
        unavailableReason: "No AlphaMissense annotation for this accession.",
        build: () =>
          data.alphamissense_available
            ? { label: "AlphaMissense", colors: residueColors(data.residues, "alphamissense"), legend: AM_LEGEND }
            : null,
      },
      {
        label: "Pathogenic burden",
        build: () => ({
          label: "Pathogenic burden",
          colors: residueColors(data.residues, "burden"),
          legend: BURDEN_LEGEND,
        }),
      },
    ],
    [data],
  );

  const maxDisease = data.top_diseases[0]?.variants ?? 1;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-3">
      <header>
        <p className="text-sm font-semibold text-foreground">
          {data.gene ?? "Variants"}{" "}
          <span className="font-mono text-xs font-normal text-muted-foreground">{data.accession}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {data.total_variants.toLocaleString()} reported variants,{" "}
          {data.mapped_positions.toLocaleString()} positions with evidence placed on this structure.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by significance">
        {CLASS_ORDER.filter((c) => data.class_counts[c]).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={filter === c}
            onClick={() => setFilter(filter === c ? null : c)}
            className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
              filter === c ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: hex(CLASS_META[c].color) }} />
            {CLASS_META[c].label} {data.class_counts[c]?.toLocaleString()}
          </button>
        ))}
      </div>

      <OverlayToggle choices={choices} />

      {data.top_diseases.length > 0 && (
        <section aria-label="Diseases">
          <h3 className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Diseases named by pathogenic variants
          </h3>
          <ul className="space-y-1">
            {data.top_diseases.slice(0, 6).map((d) => (
              <li key={d.name} className="text-[11px] text-foreground/80">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{d.name}</span>
                  <span className="font-mono text-muted-foreground">{d.variants}</span>
                </div>
                <div className="mt-0.5 h-1 rounded bg-muted">
                  <div className="h-1 rounded bg-red-500/70" style={{ width: `${(d.variants / maxDisease) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Variants">
        <h3 className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Variants</h3>
        <ClinicalVariantList variants={data.variants} filter={filter} />
        {data.variants_truncated > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {data.variants_truncated.toLocaleString()} further classified variants are counted above
            and painted in 3D but not itemised.
          </p>
        )}
      </section>

      <footer className="space-y-1 text-[10px] leading-relaxed text-muted-foreground/70">
        {data.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        <p>Sources: EBI Proteins API (UniProt, ClinVar, Ensembl, gnomAD, COSMIC, TCGA) and AlphaFold DB.</p>
      </footer>
    </div>
  );
}
