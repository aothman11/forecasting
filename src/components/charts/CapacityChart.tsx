"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LiveBirdWeek } from "@/lib/types";

export function CapacityChart({ data }: { data: LiveBirdWeek[] }) {
  const chartData = data.map((d) => ({
    week: `W${d.week}`,
    birds: Math.round(d.harvestableBirds),
    capacity: d.totalPlantCapacity,
    exceeds: d.exceedsCapacity,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(value) => Number(value).toLocaleString()} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="birds" name="Harvestable Birds" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.exceeds ? "#D24918" : "#047836"} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="capacity"
            name="Total Plant Capacity"
            stroke="#C49A1A"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
