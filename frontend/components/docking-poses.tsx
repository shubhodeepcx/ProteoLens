"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { SectionTitle } from "@/components/oncology-sections";
import { crystalVerdict, kcal, poseLabel, strength } from "@/lib/docking-format";
import type { DockPose, DockResult } from "@/lib/docking-types";

/** Vina's ranked poses; clicking one shows it in 3D and selects its contacts. */
export function DockingPoses({ result }: { result: DockResult }) {
  const dockedPose = useStore((s) => s.dockedPose);
  const setDockedPose = useStore((s) => s.setDockedPose);
  const setSelection = useStore((s) => s.setSelection);
  const best = result.poses[0];
  const verdict = best ? crystalVerdict(best) : null;

  function show(pose: DockPose) {
    setDockedPose({ sdf: pose.sdf, label: poseLabel(pose) });
    setSelection(pose.contacts);
  }

  return (
    <section aria-label="Docking results" className="space-y-2">
      <SectionTitle>
        {result.site_label}: {result.poses.length} poses in{" "}
        {Math.round(result.elapsed_seconds)} s
      </SectionTitle>
      {best && (
        <p className="text-xs text-foreground/80">
          Best score {kcal(best.affinity)} ({strength(best.affinity)}).
        </p>
      )}
      {verdict && (
        <p
          className={`flex items-center gap-1.5 text-xs ${verdict.reproduced ? "text-emerald-700" : "text-amber-700"}`}
        >
          {verdict.reproduced ? (
            <CheckCircle2 className="size-3.5" aria-hidden />
          ) : (
            <XCircle className="size-3.5" aria-hidden />
          )}
          Top pose is {verdict.text}
          {verdict.reproduced ? ": the crystal binding mode is reproduced." : "."}
        </p>
      )}
      <ol className="space-y-1" aria-label="Poses">
        {result.poses.map((pose) => {
          const active = dockedPose?.sdf === pose.sdf;
          return (
            <li key={pose.rank}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => show(pose)}
                className={`flex w-full items-baseline gap-2 rounded border px-2 py-1 text-left text-[11px] ${active ? "border-amber-500/70 bg-amber-500/10" : "border-border hover:border-foreground/30"}`}
              >
                <span className="w-4 text-muted-foreground">{pose.rank}</span>
                <span className="font-mono text-foreground">{pose.affinity.toFixed(1)}</span>
                <span className="text-muted-foreground">kcal/mol</span>
                <span className="ml-auto text-muted-foreground">
                  {pose.rmsd_to_crystal !== null
                    ? `${pose.rmsd_to_crystal.toFixed(1)} Å to crystal`
                    : `${pose.contacts.length} contacts`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {dockedPose && (
        <button
          type="button"
          onClick={() => setDockedPose(null)}
          className="text-[11px] text-sky-700 hover:underline"
        >
          Hide pose
        </button>
      )}
      {result.notes.map((n) => (
        <p key={n} className="text-[11px] text-amber-700">
          {n}
        </p>
      ))}
    </section>
  );
}
