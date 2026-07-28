"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CarcassYieldWeek } from "@/lib/types";

export function GradeChart({ data }: { data: CarcassYieldWeek[] }) {
  const chartData = data.map((d) => ({
    week: `W${d.week}`,
    "Grade A": Math.round(d.gradeATons * 10) / 10,
    "Grade B": Math.round(d.gradeBTons * 10) / 10,
    "Grade C": Math.round(d.gradeCTons * 10) / 10,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e5e3" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="t" />
          <Tooltip formatter={(value) => `${Number(value).toLocaleString()} t`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Grade A" stackId="grade" fill="#047836" />
          <Bar dataKey="Grade B" stackId="grade" fill="#C49A1A" />
          <Bar dataKey="Grade C" stackId="grade" fill="#D24918" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
