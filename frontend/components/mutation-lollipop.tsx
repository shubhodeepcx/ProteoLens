"use client";

import { useStore } from "@/lib/store";
import type { MutationPosition } from "@/lib/oncology-types";

const W = 360;
const H = 120;
const PAD = { left: 24, right: 8, top: 18, bottom: 18 };
const LABELLED = 5;

/**
 * Lollipop plot of TCGA somatic mutations along the protein: one stem per
 * mutated position, height by the square root of mutated samples so a single
 * hotspot does not flatten every other position. Red heads are mostly
 * missense, dark heads mostly truncating. Click a head to select it in 3D.
 */
export function MutationLollipop({
  positions,
  length,
}: {
  positions: readonly MutationPosition[];
  length: number;
}) {
  const setSelection = useStore((s) => s.setSelection);
  if (positions.length === 0 || length <= 0) return null;

  const max = Math.max(...positions.map((p) => p.count));
  const x = (pos: number) => PAD.left + ((pos - 0.5) / length) * (W - PAD.left - PAD.right);
  const y = (count: number) =>
    H - PAD.bottom - Math.sqrt(count / max) * (H - PAD.top - PAD.bottom);
  const labelled = new Set(
    [...positions].sort((a, b) => b.count - a.count).slice(0, LABELLED).map((p) => p.position),
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`TCGA mutations along ${length} residues; most mutated position has ${max} samples`}
    >
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={H - PAD.bottom}
        y2={H - PAD.bottom}
        className="stroke-muted-foreground/50"
        strokeWidth={3}
      />
      <text x={PAD.left} y={H - 4} className="fill-muted-foreground text-[8px]">
        1
      </text>
      <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[8px]">
        {length}
      </text>
      <text x={2} y={PAD.top} className="fill-muted-foreground text-[8px]">
        {max}
      </text>
      {positions.map((p) => {
        const truncating = p.truncating * 2 > p.count;
        return (
          <g
            key={p.position}
            role="button"
            tabIndex={p.keys.length ? 0 : -1}
            aria-label={`${p.top_change}: ${p.count} samples`}
            className={p.keys.length ? "cursor-pointer" : undefined}
            onClick={() => p.keys.length && setSelection(p.keys)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && p.keys.length) setSelection(p.keys);
            }}
          >
            <title>{`${p.top_change} · ${p.count} sample(s)${p.truncating ? ` · ${p.truncating} truncating` : ""}`}</title>
            <line
              x1={x(p.position)}
              x2={x(p.position)}
              y1={H - PAD.bottom}
              y2={y(p.count)}
              className="stroke-muted-foreground/50"
              strokeWidth={0.75}
            />
            <circle
              cx={x(p.position)}
              cy={y(p.count)}
              r={labelled.has(p.position) ? 3.5 : 2.2}
              className={truncating ? "fill-foreground/70" : "fill-red-500"}
            />
            {labelled.has(p.position) && (
              <text
                x={x(p.position)}
                y={y(p.count) - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px] font-medium"
              >
                {p.top_change}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
