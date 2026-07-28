"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ProductFamilyWeek } from "@/lib/types";

const COLORS = ["#047836", "#C49A1A", "#D24918"];

export function FamilyDonut({ data }: { data: ProductFamilyWeek[] }) {
  const totals = data.reduce(
    (acc, d) => {
      acc.wcFresh += d.wcFreshKg;
      acc.wcFrozen += d.wcFrozenKg;
      acc.fpp += d.fppKg;
      return acc;
    },
    { wcFresh: 0, wcFrozen: 0, fpp: 0 }
  );

  const chartData = [
    { name: "Whole Chicken Fresh", value: Math.round(totals.wcFresh) },
    { name: "Whole Chicken Frozen", value: Math.round(totals.wcFrozen) },
    { name: "FPP (Cuts & Further Processing)", value: Math.round(totals.fpp) },
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => `${Number(value).toLocaleString()} kg`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
