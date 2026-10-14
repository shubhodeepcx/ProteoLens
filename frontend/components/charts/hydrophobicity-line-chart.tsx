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
        <CartesianGrid stroke="#e2e8f0" />
        <XAxis dataKey="pos" stroke="#64748b" tick={{ fontSize: 10 }} />
        <YAxis
          stroke="#64748b"
          tick={{ fontSize: 10 }}
          width={28}
          domain={[-4.5, 4.5]}
        />
        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", fontSize: 11 }}
          itemStyle={{ color: "#0f172a" }}
          labelStyle={{ color: "#64748b" }}
          labelFormatter={(v) => `residue ${v}`}
          formatter={(value: number) => [
            value.toFixed(2),
            `KD (chain ${data.chain_id}, w=${data.window})`,
          ]}
        />
        <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
