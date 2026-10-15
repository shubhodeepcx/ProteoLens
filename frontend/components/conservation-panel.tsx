"use client";

import { AlertCircle, Info, Loader2 } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { OverlayToggle } from "@/components/overlay-toggle";
import { ConservationStrip } from "@/components/conservation-strip";
import { SectionTitle } from "@/components/oncology-sections";
import { useStore } from "@/lib/store";
import {
  CONSERVATION_LEGEND,
  bits,
  conservationColors,
} from "@/lib/conservation-format";
import type { ConservationProfile } from "@/lib/conservation-types";

/**
 * Conservation tab: how strongly evolution has kept each residue, from PDBe-KB's
 * per-residue profile of homologous sequences. Conserved residues are usually
 * the ones the protein cannot do without: catalytic sites, binding motifs,
 * buried core. A variant at one is far more likely to be damaging.
 */
export function ConservationPanel({ proteinId }: { proteinId: string }) {
  const { data, loading, error, reload } = useApiResource<ConservationProfile>(
    `/api/proteins/${encodeURIComponent(proteinId)}/conservation`,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="ml-2 text-xs">
          Reading the conservation profile&hellip;
        </span>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <AlertCircle className="size-6 text-red-700" aria-hidden />
        <p className="text-xs text-red-700">Conservation failed: {error}</p>
        <button
          type="button"
          onClick={reload}
          className="text-[11px] text-sky-700 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;
  if (data.residues.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Info className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">
          No conservation profile for this structure.
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {data.resolution_note}
        </p>
      </div>
    );
  }
  return <ConservationBody data={data} />;
}

function ConservationBody({ data }: { data: ConservationProfile }) {
  const setSelection = useStore((s) => s.setSelection);
  const byPosition = new Map(data.residues.map((r) => [r.position, r]));
  const colors = conservationColors(data.residues);
  const top = data.most_conserved
    .map((p) => byPosition.get(p))
    .filter((r) => r !== undefined);

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <p className="text-xs text-foreground/80">
        {data.accession}: {data.residues.length} positions, mean{" "}
        {bits(data.mean_information ?? 0)}; {data.placed} sit on residues in
        this structure.
      </p>
      <OverlayToggle
        choices={[
          {
            label: "Conservation",
            build: () =>
              data.placed
                ? { label: "Conservation", colors, legend: CONSERVATION_LEGEND }
                : null,
            unavailableReason:
              "No profiled position is resolved in this structure.",
          },
        ]}
      />
      <SectionTitle>Along the sequence</SectionTitle>
      <ConservationStrip residues={data.residues} />
      <SectionTitle>Most conserved residues</SectionTitle>
      <ul className="flex flex-wrap gap-1" aria-label="Most conserved residues">
        {top.map((r) => (
          <li key={r.position}>
            <button
              type="button"
              disabled={r.keys.length === 0}
              onClick={() => setSelection(r.keys)}
              title={`${r.dominant} in ${Math.round(r.dominant_probability * 100)}% of homologues`}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:border-foreground/30 disabled:opacity-50"
            >
              {r.residue}
              {r.position}
              <span className="ml-1 text-[10px] text-muted-foreground">
                {r.information.toFixed(1)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {data.notes.map((n) => (
        <p key={n} className="text-[11px] text-amber-700">
          {n}
        </p>
      ))}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {data.source}. Information content of each position&apos;s amino-acid
        profile across homologues: 0 bits means any residue is tolerated, 4.3
        bits means the same residue in every homologue.
      </p>
    </div>
  );
}
