"use client";

import { useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";
import { useStore } from "@/lib/store";
import { DockingForm } from "@/components/docking-form";
import { DockingPoses } from "@/components/docking-poses";
import { poseLabel } from "@/lib/docking-format";
import type { DockRequest, DockResult, DockingSites } from "@/lib/docking-types";

/**
 * Docking tab: dock a small molecule into this structure with AutoDock Vina,
 * either into the pocket of a ligand already in the file or around the
 * residues currently selected. Redocking the crystal ligand reports how close
 * Vina's best pose comes to the experimental one, the usual sanity check.
 */
export function DockingPanel({ proteinId }: { proteinId: string }) {
  const base = `/api/proteins/${encodeURIComponent(proteinId)}`;
  const { data, loading, error, reload } = useApiResource<DockingSites>(
    `${base}/docking/sites`,
  );
  const setDockedPose = useStore((s) => s.setDockedPose);
  const [result, setResult] = useState<DockResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function dock(request: DockRequest) {
    setRunning(true);
    setRunError(null);
    setResult(null);
    setDockedPose(null);
    try {
      const body = await apiPost<DockResult>(`${base}/dock`, request);
      setResult(body);
      const best = body.poses[0];
      if (best) setDockedPose({ sdf: best.sdf, label: poseLabel(best) });
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="ml-2 text-xs">Finding binding sites&hellip;</span>
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
        <p className="text-xs text-red-700">Docking sites failed: {error}</p>
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
  if (!data.vina_available) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Info className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">Docking needs AutoDock Vina.</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{data.vina_note}</p>
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-3">
      <DockingForm sites={data.sites} running={running} onDock={dock} />
      {running && (
        <p role="status" className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Vina is searching. This usually takes one to two minutes.
        </p>
      )}
      {runError && (
        <p role="alert" className="text-[11px] text-red-700">
          Docking failed: {runError}
        </p>
      )}
      {result && <DockingPoses result={result} />}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        AutoDock Vina 1.2 with a fixed seed. Scores estimate binding free energy
        to within about 2 kcal/mol: reliable for ranking poses of one molecule,
        much less so for ranking different molecules.
      </p>
    </div>
  );
}
