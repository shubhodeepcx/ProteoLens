"use client";

import type { ResidueConservation } from "@/lib/conservation-types";
import { conservationColor, CONSERVED_BITS } from "@/lib/conservation-format";
import { hex } from "@/lib/clinical-format";
import { useStore } from "@/lib/store";

const HEIGHT = 48;
const MAX_BITS = 4.32;

/** One bar per residue, height and colour by information; click selects it in 3D. */
export function ConservationStrip({
  residues,
}: {
  residues: readonly ResidueConservation[];
}) {
  const setSelection = useStore((s) => s.setSelection);
  const n = residues.length;
  if (n === 0) return null;
  const last = residues[n - 1].position;
  return (
    <svg
      viewBox={`0 0 ${n} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-14 w-full rounded bg-zinc-900"
      role="img"
      aria-label={`Conservation along residues 1 to ${last}`}
    >
      <line
        x1={0}
        x2={n}
        y1={HEIGHT - (CONSERVED_BITS / MAX_BITS) * HEIGHT}
        y2={HEIGHT - (CONSERVED_BITS / MAX_BITS) * HEIGHT}
        stroke="#52525b"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />
      {residues.map((r, i) => {
        const h = Math.max(1, (r.information / MAX_BITS) * HEIGHT);
        return (
          <rect
            key={r.position}
            x={i}
            y={HEIGHT - h}
            width={1}
            height={h}
            fill={hex(conservationColor(r.information))}
            onClick={() => r.keys.length && setSelection(r.keys)}
            className={r.keys.length ? "cursor-pointer" : undefined}
          >
            <title>{`${r.residue}${r.position}: ${r.information.toFixed(2)} bits, ${r.dominant} in ${Math.round(r.dominant_probability * 100)}%`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
