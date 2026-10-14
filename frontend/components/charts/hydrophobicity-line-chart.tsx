"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { HydrophobicityProfile } from "@/lib/types";

export function HydrophobicityLineChart({ data }: { data: HydrophobicityProfile }) {
  // Map window-center positions to (window/2)-offset residue indices for x-axis labels.
  const half = Math.floor(data.window / 2);
  const series = data.values.map((v, i) => ({ pos: i + half + 1, value: v }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" />
        <XAxis dataKey="pos" stroke="var(--chart-axis)" tick={{ fontSize: 10 }} />
        <YAxis
          stroke="var(--chart-axis)"
          tick={{ fontSize: 10 }}
          width={28}
          domain={[-4.5, 4.5]}
        />
        <ReferenceLine y={0} stroke="var(--chart-axis-soft)" strokeDasharray="2 2" />
        <Tooltip
          contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", fontSize: 11 }}
          itemStyle={{ color: "var(--chart-tooltip-text)" }}
          labelStyle={{ color: "var(--chart-axis)" }}
          labelFormatter={(v) => `residue ${v}`}
          formatter={(value: number) => [
            value.toFixed(2),
            `KD (chain ${data.chain_id}, w=${data.window})`,
          ]}
        />
        <Line type="monotone" dataKey="value" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
