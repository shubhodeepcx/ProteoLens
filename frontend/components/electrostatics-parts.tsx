import type { ChainPotential } from "@/lib/electrostatics";

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </dd>
    </div>
  );
}

export function Legend({ range, units }: { range: number; units: string }) {
  return (
    <div>
      <div
        aria-hidden
        className="h-2 rounded-full"
        style={{ background: "linear-gradient(to right, #d7301f, #ffffff, #2166ac)" }}
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>-{range} acidic</span>
        <span>{units}</span>
        <span>basic +{range}</span>
      </div>
    </div>
  );
}

/** Per-residue potential as a centred bar strip; a click selects the residue. */
export function Profile({
  chain,
  range,
  onPick,
}: {
  chain: ChainPotential;
  range: number;
  onPick: (ordinal: number) => void;
}) {
  const n = chain.potential.length;
  const half = 28;
  return (
    <svg
      role="img"
      aria-label={`Surface potential along chain ${chain.chain}`}
      viewBox={`0 0 ${n} ${half * 2}`}
      preserveAspectRatio="none"
      className="h-14 w-full cursor-pointer rounded border border-border bg-card"
    >
      <line x1={0} x2={n} y1={half} y2={half} className="stroke-border" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      {chain.potential.map((v, i) => {
        const h = (Math.min(Math.abs(v), range) / range) * (half - 2);
        return (
          <rect
            key={i}
            x={i + 0.1}
            width={0.8}
            y={v >= 0 ? half - h : half}
            height={Math.max(h, 0.3)}
            fill={v >= 0 ? "#2166ac" : "#d7301f"}
            opacity={chain.exposed && !chain.exposed[i] ? 0.35 : 1}
            onClick={() => onPick(i + 1)}
          >
            <title>{`${chain.sequence[i]}${i + 1}: ${v}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
