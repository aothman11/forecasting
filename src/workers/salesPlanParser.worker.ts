/**
 * Web Worker: parses the Excel/CSV sales plan file off the main thread.
 *
 * Receives:  { buffer: ArrayBuffer }
 * Sends:     WorkerProgressMsg  | WorkerResultMsg | WorkerErrorMsg
 */
import {
  parseSalesPlanFull,
  distinctRowSignatures,
  distinctValues,
  distinctWeeksOfYear,
  buildFileWeekLabels,
} from "@/lib/salesPlanImport";
import type { RowSignatureGroup, SalesPlanRow } from "@/lib/salesPlanImport";

export interface WorkerProgressMsg {
  type: "progress";
  stage: string;
  percent: number;
}

export interface CartonRow {
  week: number;
  plant: string;
  skuCode: string;
  skuDescription: string;
  cartons: number;
}

export interface WorkerResultMsg {
  type: "result";
  rows: SalesPlanRow[];
  headers: string[];
  cartonRows: CartonRow[];
  signatures: RowSignatureGroup[];
  channelValues: string[];
  weeksInFile: number[];
  /** Serialised Map<number,string> as [week, label] pairs */
  fileWeekLabels: [number, string][];
}

export interface WorkerErrorMsg {
  type: "error";
  message: string;
}

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const { buffer } = e.data;

    self.postMessage({ type: "progress", stage: "Parsing Excel file…", percent: 15 } satisfies WorkerProgressMsg);

    const { rows, headers } = parseSalesPlanFull(buffer);

    self.postMessage({ type: "progress", stage: "Aggregating rows…", percent: 60 } satisfies WorkerProgressMsg);

    // Carton aggregation for the Processing Plan
    const aggMap = new Map<string, CartonRow>();
    for (const r of rows) {
      if (!r.materialCode || r.grossSalesVolumeCar <= 0) continue;
      const key = `${r.weekOfYear}::${r.plant || "ALL"}::${r.materialCode}`;
      const cur = aggMap.get(key);
      if (cur) {
        cur.cartons += r.grossSalesVolumeCar;
      } else {
        aggMap.set(key, {
          week: r.weekOfYear,
          plant: r.plant || "ALL",
          skuCode: r.materialCode,
          skuDescription: r.materialDescription,
          cartons: r.grossSalesVolumeCar,
        });
      }
    }

    self.postMessage({ type: "progress", stage: "Computing mappings…", percent: 75 } satisfies WorkerProgressMsg);

    const signatures = distinctRowSignatures(rows);
    const channelValues = distinctValues(rows, "channel");
    const weeksInFile = distinctWeeksOfYear(rows);
    const fileWeekLabels = buildFileWeekLabels(rows);

    self.postMessage({ type: "progress", stage: "Almost done…", percent: 95 } satisfies WorkerProgressMsg);

    self.postMessage({
      type: "result",
      rows,
      headers,
      cartonRows: [...aggMap.values()],
      signatures,
      channelValues,
      weeksInFile,
      fileWeekLabels: [...fileWeekLabels.entries()],
    } satisfies WorkerResultMsg);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Failed to parse file — it may be corrupted or in an unsupported format.",
    } satisfies WorkerErrorMsg);
  }
};
