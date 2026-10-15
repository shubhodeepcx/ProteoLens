"use client";

import { useStore } from "@/lib/store";
import type { ResidueOverlay } from "@/lib/store";
import { hex } from "@/lib/clinical-format";

export interface OverlayChoice {
  /** Stable id; also the `label` the toolbar shows while it is active. */
  label: string;
  /** Null when this choice has no data for the current protein. */
  build: () => ResidueOverlay | null;
  /** Why the choice is unavailable, shown as its tooltip. */
  unavailableReason?: string;
}

/**
 * "Paint the structure by ..." buttons for a rail panel, plus the legend of
 * whichever overlay is active. The overlay itself lives in the viewer slice,
 * so the toolbar and every panel agree about what the canvas is showing.
 */
export function OverlayToggle({ choices }: { choices: readonly OverlayChoice[] }) {
  const overlay = useStore((s) => s.residueOverlay);
  const setOverlay = useStore((s) => s.setResidueOverlay);
  const ownActive = overlay && choices.some((c) => c.label === overlay.label);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Paint structure">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Paint 3D by</span>
        {choices.map((choice) => {
          const built = choice.build();
          const active = overlay?.label === choice.label;
          return (
            <button
              key={choice.label}
              type="button"
              aria-pressed={active}
              disabled={built === null}
              title={built === null ? choice.unavailableReason : undefined}
              onClick={() => setOverlay(active ? null : built)}
              className={`rounded border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "border-sky-500 bg-sky-500/15 text-sky-700"
                  : "border-border text-foreground/80 hover:border-foreground/30"
              }`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
      {ownActive && overlay && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Legend">
          {overlay.legend.map(([label, color]) => (
            <li key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-sm"
                style={{ backgroundColor: hex(color) }}
              />
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
