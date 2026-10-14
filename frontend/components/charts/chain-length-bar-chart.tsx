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
        <CartesianGrid stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="chain_id" stroke="#64748b" tick={{ fontSize: 10 }} />
        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} width={28} />
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", fontSize: 11 }}
          itemStyle={{ color: "#0f172a" }}
          labelStyle={{ color: "#64748b" }}
          formatter={(v: number) => [`${v} residues`, "length"]}
          labelFormatter={(v) => `chain ${v}`}
        />
        <Bar dataKey="length" fill="#a855f7" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
