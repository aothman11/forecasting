"use client";

import { useState } from "react";
import { exportPipelineToExcel, exportSummaryToPDF } from "@/lib/export";
import { usePipeline } from "@/lib/usePipeline";
import { usePlanStore } from "@/lib/store";

export function ExportButtons() {
  const { result, params } = usePipeline();
  const demand = usePlanStore((s) => s.demand);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => exportPipelineToExcel(result, params, undefined, demand)}
        className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors"
      >
        Export Excel
      </button>
      <button
        onClick={async () => {
          setBusy("pdf");
          try {
            await exportSummaryToPDF("pdf-summary-export");
          } finally {
            setBusy(null);
          }
        }}
        disabled={busy === "pdf"}
        className="text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:border-brand-green hover:text-brand-green transition-colors disabled:opacity-50"
      >
        {busy === "pdf" ? "Generating…" : "Export Summary PDF"}
      </button>
    </div>
  );
}
