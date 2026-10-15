"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Loader2 } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { viewerHref } from "@/lib/deep-link";
import type { ExplorerView } from "@/lib/explorer-types";
import type { ImportRequest, ProteinSummary } from "@/lib/types";

/** Level 5: what the change does to the protein, then the 3D hand-off. */
export function LevelProtein({ view }: { view: ExplorerView }) {
  const router = useRouter();
  const { variant, scenario, accession, handoff_ok } = view;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (!accession) return;
    setBusy(true);
    setError(null);
    try {
      const body: ImportRequest = { source: "alphafold", source_id: accession };
      const summary = await apiPost<ProteinSummary>(
        "/api/proteins/import",
        body,
      );
      router.push(
        viewerHref(
          summary.id,
          handoff_ok ? `A:${variant.protein_position}` : null,
        ),
      );
    } catch (e) {
      setError(
        `Could not open the AlphaFold model of ${accession}: ${e instanceof ApiError || e instanceof Error ? e.message : String(e)}`,
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-zinc-100">
        {view.gene.symbol} {variant.hgvs_p}
        {scenario && (
          <span className="ml-2 text-xs font-normal text-zinc-400">
            {scenario.disease}
          </span>
        )}
      </h2>
      {scenario ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
          {scenario.story.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-300">
          {variant.ref_aa3} {variant.protein_position} becomes {variant.alt_aa3}
          : a {variant.consequence} change.{" "}
          {variant.consequence === "nonsense" &&
            "The ribosome stops here, so the protein is cut short (or the mRNA is destroyed by nonsense-mediated decay)."}
        </p>
      )}
      {scenario?.structure_note && (
        <p className="text-xs text-zinc-500">{scenario.structure_note}</p>
      )}
      {view.notes.map((n) => (
        <p key={n} className="text-xs text-amber-300/80">
          {n}
        </p>
      ))}
      {accession && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={open}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-[#fff] hover:bg-indigo-400 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Box className="size-3.5" aria-hidden />
            )}
            {handoff_ok
              ? `Open in 3D at residue ${variant.protein_position}`
              : "Open the protein in 3D"}
          </button>
          <span className="text-xs text-zinc-500">
            AlphaFold model of UniProt {accession}
            {view.protein_length ? `, ${view.protein_length} residues` : ""}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
