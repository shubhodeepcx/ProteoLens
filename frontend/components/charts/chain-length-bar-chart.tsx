"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ChainLength } from "@/lib/types";

export function ChainLengthBarChart({ data }: { data: ChainLength[] }) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="chain_id" stroke="var(--chart-axis)" tick={{ fontSize: 10 }} />
        <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 10 }} width={28} />
        <Tooltip
          contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", fontSize: 11 }}
          itemStyle={{ color: "var(--chart-tooltip-text)" }}
          labelStyle={{ color: "var(--chart-axis)" }}
          formatter={(v: number) => [`${v} residues`, "length"]}
          labelFormatter={(v) => `chain ${v}`}
        />
        <Bar dataKey="length" fill="var(--chart-4)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
