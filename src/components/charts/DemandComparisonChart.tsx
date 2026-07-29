"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DemandComparisonWeek } from "@/lib/types";

export function DemandComparisonChart({ data }: { data: DemandComparisonWeek[] }) {
  const chartData = data.map((d) => ({
    week: `W${d.week}`,
    Demand: Math.round(d.demandKg),
    Production: Math.round(d.productionKg),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value) => `${Number(value).toLocaleString()} kg`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Demand" fill="#C49A1A" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Production" fill="#047836" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
