import type { Strand } from "@/lib/seqtools";

export interface MapSpan {
  key: string;
  start: number;
  end: number;
  strand?: Strand;
  label: string;
  tone: "primary" | "amber" | "emerald" | "rose" | "muted";
}

export interface MapMark {
  key: string;
  position: number;
  label: string;
}

const TONE: Record<MapSpan["tone"], string> = {
  primary: "fill-blue-500",
  amber: "fill-amber-500",
  emerald: "fill-emerald-500",
  rose: "fill-rose-500",
  muted: "fill-muted-foreground/40",
};

const WIDTH = 1000;
const LANE = 16;
const CHAR = 6.2; // approximate width of one 10px label character, in viewBox units

/** Greedy lane packing so overlapping spans never draw on top of each other. */
export function packLanes<T extends { start: number; end: number }>(spans: T[]): number[] {
  const laneEnds: number[] = [];
  return spans.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.end);
    } else {
      laneEnds[lane] = s.end;
    }
    return lane;
  });
}

function ticks(length: number): number[] {
  const raw = length / 8;
  const step = [1, 2, 5]
    .flatMap((m) => [1, 10, 100, 1000, 10000].map((p) => m * p))
    .sort((a, b) => a - b)
    .find((s) => s >= raw) ?? 10000;
  const out: number[] = [];
  for (let t = step; t < length; t += step) out.push(t);
  return out;
}

/**
 * A linear map of the sequence: a ruler, cut-site marks above it and feature
 * arrows below it. Coordinates are the backend's 1-based forward-strand ones.
 */
export function SequenceMap({
  length,
  spans = [],
  marks = [],
  highlight,
  label,
}: {
  length: number;
  spans?: MapSpan[];
  marks?: MapMark[];
  highlight?: { start: number; end: number } | null;
  label: string;
}) {
  const x = (pos: number) => ((pos - 1) / Math.max(1, length - 1)) * WIDTH;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const lanes = packLanes(sorted);
  const laneCount = Math.max(0, ...lanes.map((l) => l + 1));
  const sortedMarks = [...marks].sort((a, b) => a.position - b.position);
  // Labels of close cut sites (a multiple cloning site) would print on top of
  // each other, so each label takes the lowest row its text fits in.
  const markLanes = packLanes(
    sortedMarks.map((m) => {
      const half = (m.label.length * CHAR) / 2 + 3;
      return { start: x(m.position) - half, end: x(m.position) + half };
    }),
  );
  const markRowCount = Math.max(0, ...markLanes.map((l) => l + 1));
  const markRows = markRowCount ? markRowCount * 12 + 10 : 6;
  const rulerY = markRows + 4;
  const height = rulerY + 22 + laneCount * LANE + 4;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`-10 0 ${WIDTH + 20} ${height}`}
      className="h-auto w-full overflow-visible"
    >
      {highlight && (
        <rect
          x={x(highlight.start)}
          y={rulerY - 6}
          width={Math.max(2, x(highlight.end) - x(highlight.start))}
          height={height - rulerY + 6}
          className="fill-primary/10"
        />
      )}
      <line x1={0} x2={WIDTH} y1={rulerY} y2={rulerY} className="stroke-foreground" strokeWidth={2} />
      {ticks(length).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={rulerY} y2={rulerY + 5} className="stroke-muted-foreground" />
          <text x={x(t)} y={rulerY + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {t.toLocaleString("en-US")}
          </text>
        </g>
      ))}
      {sortedMarks.map((m, i) => (
        <g key={m.key}>
          <line
            x1={x(m.position)}
            x2={x(m.position)}
            y1={markRows - 2 - markLanes[i] * 12}
            y2={rulerY + 2}
            className="stroke-rose-600"
            strokeWidth={1.5}
          />
          <text
            x={x(m.position)}
            y={markRows - 4 - markLanes[i] * 12}
            textAnchor="middle"
            className="fill-foreground text-[10px] font-medium"
          >
            {m.label}
          </text>
        </g>
      ))}
      {sorted.map((s, i) => {
        const y = rulerY + 22 + lanes[i] * LANE;
        const x0 = x(s.start);
        const x1 = Math.max(x0 + 3, x(s.end));
        const head = Math.min(8, (x1 - x0) / 2);
        const h = 10;
        const points =
          s.strand === "-"
            ? `${x0},${y + h / 2} ${x0 + head},${y} ${x1},${y} ${x1},${y + h} ${x0 + head},${y + h}`
            : s.strand === "+"
              ? `${x0},${y} ${x1 - head},${y} ${x1},${y + h / 2} ${x1 - head},${y + h} ${x0},${y + h}`
              : `${x0},${y} ${x1},${y} ${x1},${y + h} ${x0},${y + h}`;
        return (
          <polygon key={s.key} points={points} className={TONE[s.tone]}>
            <title>{s.label}</title>
          </polygon>
        );
      })}
    </svg>
  );
}
