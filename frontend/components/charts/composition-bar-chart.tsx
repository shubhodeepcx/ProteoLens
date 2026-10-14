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
import type { CompositionEntry } from "@/lib/types";

export function CompositionBarChart({ data }: { data: CompositionEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="aa" stroke="var(--chart-axis)" tick={{ fontSize: 10 }} interval={0} />
        <YAxis stroke="var(--chart-axis)" tick={{ fontSize: 10 }} width={28} />
        <Tooltip
          contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", fontSize: 11 }}
          itemStyle={{ color: "var(--chart-tooltip-text)" }}
          labelStyle={{ color: "var(--chart-axis)" }}
          formatter={(value: number, _name, p) => {
            const payload = (p as { payload?: CompositionEntry }).payload;
            const label = payload?.label ?? "";
            const percent = payload?.percent ?? 0;
            return [`${value} (${percent}%)`, label];
          }}
        />
        <Bar dataKey="count" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
