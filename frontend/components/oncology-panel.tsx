"use client";

import { useMemo } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { OverlayToggle, type OverlayChoice } from "@/components/overlay-toggle";
import { MutationLollipop } from "@/components/mutation-lollipop";
import {
  CancerTypeBars,
  DrugList,
  EvidenceList,
  HotspotList,
  InteractorList,
  PathwayList,
  SectionTitle,
} from "@/components/oncology-sections";
import { DENSITY_LEGEND, HOTSPOT_LEGEND, densityColors, hotspotColors } from "@/lib/oncology-format";
import type { OncologyContext, SourceStatus } from "@/lib/oncology-types";

/**
 * Oncology tab: where tumours mutate this protein (cancerhotspots.org, TCGA via
 * cBioPortal), which drugs act on it (ChEMBL), what clinical evidence says
 * about its variants (CIViC), and its pathways and partners (Reactome, STRING).
 */
export function OncologyPanel({ proteinId }: { proteinId: string }) {
  const { data, loading, error, reload } = useApiResource<OncologyContext>(
    `/api/proteins/${encodeURIComponent(proteinId)}/oncology`,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="ml-2 text-xs">Querying six cancer databases&hellip;</span>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertCircle className="size-6 text-red-700" aria-hidden />
        <p className="text-xs text-red-700">Oncology context failed: {error}</p>
        <button type="button" onClick={reload} className="text-[11px] text-sky-700 hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;
  if (!data.accession_resolved || !data.gene) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Info className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">No oncology context for this structure.</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{data.resolution_note}</p>
      </div>
    );
  }
  return <OncologyBody data={data} />;
}

function OncologyBody({ data }: { data: OncologyContext }) {
  const tcga = data.tcga;
  const choices = useMemo<OverlayChoice[]>(
    () => [
      {
        label: "Tumour hotspots",
        unavailableReason: "No recurrent hotspot is reported for this gene.",
        build: () =>
          data.hotspots.some((h) => h.keys.length)
            ? { label: "Tumour hotspots", colors: hotspotColors(data.hotspots), legend: HOTSPOT_LEGEND }
            : null,
      },
      {
        label: "TCGA mutation density",
        unavailableReason: "No TCGA mutation is placed on this structure.",
        build: () =>
          tcga && tcga.positions.some((p) => p.keys.length)
            ? { label: "TCGA mutation density", colors: densityColors(tcga.positions), legend: DENSITY_LEGEND }
            : null,
      },
    ],
    [data, tcga],
  );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-3">
      <header>
        <p className="text-sm font-semibold text-foreground">
          {data.gene} <span className="font-mono text-xs font-normal text-muted-foreground">{data.accession}</span>
        </p>
        {tcga && (
          <p className="text-[11px] text-muted-foreground">
            Mutated in {tcga.mutated_samples.toLocaleString()} of {tcga.samples.toLocaleString()} tumours
            across {tcga.studies} TCGA PanCancer studies.
          </p>
        )}
        <SourceChips sources={data.sources} />
      </header>

      <OverlayToggle choices={choices} />

      {tcga && tcga.positions.length > 0 && (
        <section aria-label="Mutation map">
          <SectionTitle>Somatic mutations along the protein (TCGA)</SectionTitle>
          <MutationLollipop positions={tcga.positions} length={data.sequence_length} />
        </section>
      )}
      {data.hotspots.length > 0 && (
        <section aria-label="Hotspots">
          <SectionTitle>Recurrent hotspots</SectionTitle>
          <HotspotList hotspots={data.hotspots} />
        </section>
      )}
      {tcga && tcga.by_cancer_type.length > 0 && (
        <section aria-label="Cancer types">
          <SectionTitle>Most affected cancer types</SectionTitle>
          <CancerTypeBars rows={tcga.by_cancer_type} />
        </section>
      )}
      {data.drugs.length > 0 && (
        <section aria-label="Drugs">
          <SectionTitle>Drugs acting on this protein (ChEMBL)</SectionTitle>
          <DrugList drugs={data.drugs} />
        </section>
      )}
      {data.evidence.length > 0 && (
        <section aria-label="Clinical evidence">
          <SectionTitle>Sensitivity, resistance and prognosis (CIViC)</SectionTitle>
          <EvidenceList items={data.evidence} total={data.evidence_total} />
        </section>
      )}
      {data.pathways.length > 0 && (
        <section aria-label="Pathways">
          <SectionTitle>Pathways (Reactome)</SectionTitle>
          <PathwayList pathways={data.pathways} total={data.pathways_total} />
        </section>
      )}
      {data.interactors.length > 0 && (
        <section aria-label="Interaction partners">
          <SectionTitle>Interaction partners (STRING)</SectionTitle>
          <InteractorList interactors={data.interactors} />
        </section>
      )}

      <footer className="space-y-1 text-[10px] leading-relaxed text-muted-foreground/70">
        {data.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </footer>
    </div>
  );
}

const STATE_TONE: Record<SourceStatus["state"], string> = {
  ok: "border-emerald-700/60 text-emerald-700",
  empty: "border-border text-muted-foreground",
  unavailable: "border-red-700/60 text-red-700",
  skipped: "border-border text-muted-foreground/70",
};

function SourceChips({ sources }: { sources: readonly SourceStatus[] }) {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Sources">
      {sources.map((s) => (
        <li
          key={s.name}
          title={s.detail ?? s.state}
          className={`rounded border px-1.5 py-px text-[9px] ${STATE_TONE[s.state]}`}
        >
          {s.name}
          {s.state === "ok" ? "" : ` · ${s.state}`}
        </li>
      ))}
    </ul>
  );
}
