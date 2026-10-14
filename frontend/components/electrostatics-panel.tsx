"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Paintbrush } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  fetchElectrostatics,
  residueLabel,
  signed,
  type ChainPotential,
  type ElectrostaticsResponse,
} from "@/lib/electrostatics";

/**
 * P15 surface electrostatics, inside the Analytics tab.
 *
 * The numbers (net charge, pI, dipole) and the per-residue profile read on
 * their own; the patches and the "Colour structure" button are the bridge to
 * 3D, through the same selection and colouring seams as everything else.
 */
export function ElectrostaticsPanel({ proteinId }: { proteinId: string }) {
  const [data, setData] = useState<ElectrostaticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chainIndex, setChainIndex] = useState(0);
  const coloring = useStore((s) => s.coloring);
  const setColoring = useStore((s) => s.setColoring);
  const setSelection = useStore((s) => s.setSelection);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setChainIndex(0);
    fetchElectrostatics(proteinId)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [proteinId]);

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2 text-xs text-red-500">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        Electrostatics failed: {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Computing surface potential&hellip;
      </p>
    );
  }
  if (!data.chains.length) {
    return <p className="text-xs text-muted-foreground">{data.notes[0]}</p>;
  }

  const chain = data.chains[Math.min(chainIndex, data.chains.length - 1)];
  const painting = coloring === "electrostatics";

  return (
    <div className="space-y-3" data-testid="electrostatics">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Net charge" value={signed(data.net_charge)} unit="e" />
        <Stat
          label="pI"
          value={chain.isoelectric_point?.toFixed(2) ?? "–"}
          unit={data.chains.length > 1 ? `chain ${chain.chain}` : undefined}
        />
        <Stat label="Dipole" value={data.dipole_debye?.toFixed(0) ?? "–"} unit="D" />
      </dl>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setColoring(painting ? "chain" : "electrostatics")}
          aria-pressed={painting}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors ${
            painting
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card hover:bg-muted"
          }`}
        >
          <Paintbrush className="size-3.5" aria-hidden />
          {painting ? "Showing on structure" : "Colour structure by potential"}
        </button>
        {data.chains.length > 1 && (
          <select
            aria-label="Chain"
            className="h-7 rounded-md border border-border bg-card px-1.5 text-[11px]"
            value={chainIndex}
            onChange={(e) => setChainIndex(Number(e.target.value))}
          >
            {data.chains.map((c, i) => (
              <option key={c.chain} value={i}>
                Chain {c.chain}
              </option>
            ))}
          </select>
        )}
      </div>

      <Legend range={data.color_range} units={data.units} />
      <Profile
        chain={chain}
        range={data.color_range}
        onPick={(ordinal) => setSelection([`${chain.chain}:${ordinal}`])}
      />

      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Charged surface patches
        </h4>
        {data.patches.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No surface patch passes the threshold.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.patches.map((p) => (
              <li key={p.residues.map((r) => r.key).join(",")}>
                <button
                  type="button"
                  onClick={() => setSelection(p.residues.map((r) => r.key))}
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${p.sign === "positive" ? "bg-blue-600" : "bg-red-600"}`}
                    />
                    {p.sign === "positive" ? "Basic" : "Acidic"} · {p.residues.length} residues ·{" "}
                    {signed(p.mean_potential)}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                    {p.residues.map(residueLabel).join(" ")}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{p.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="space-y-1 text-[10px] leading-relaxed text-muted-foreground">
        {data.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
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

function Legend({ range, units }: { range: number; units: string }) {
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
function Profile({
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
