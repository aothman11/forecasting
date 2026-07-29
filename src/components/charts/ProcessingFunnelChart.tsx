"use client";

import { Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip } from "recharts";

export interface FunnelStage {
  name: string;
  value: number;
  fill: string;
}

export function ProcessingFunnelChart({ stages }: { stages: FunnelStage[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip formatter={(value) => Math.round(Number(value)).toLocaleString()} />
          <Funnel dataKey="value" data={stages} isAnimationActive>
            <LabelList position="right" dataKey="name" stroke="none" fill="#1a1f1c" fontSize={12} />
            <LabelList
              position="center"
              dataKey="value"
              stroke="none"
              fill="#ffffff"
              fontSize={12}
              formatter={(v: unknown) => Math.round(Number(v ?? 0)).toLocaleString()}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </div>
  );
}
