import * as XLSX from "xlsx";
import type { PipelineResult } from "./types";
import { activeCutKeys } from "./calculations";
import { CUT_LABELS, DEFAULT_CHICKS_PER_FARM, PLANT_LABELS } from "./defaults";
import type { Parameters as PlanParameters, PlacementDayRow } from "./types";

function round(n: number, dp = 1): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

/** Blank fill-in-the-blanks template matching the current horizon's dates, ready for re-import. */
export function exportPlacementTemplate(
  placementDays: PlacementDayRow[],
  fileName = "awp-placement-template.xlsx"
) {
  const wb = XLSX.utils.book_new();
  const sheet = placementDays.map((d) => ({
    Date: d.date,
    "Farms Placing": "",
    "Chicks per Farm": DEFAULT_CHICKS_PER_FARM,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Placement Plan");
  XLSX.writeFile(wb, fileName);
}

export function exportPipelineToExcel(result: PipelineResult, params: PlanParameters, fileName = "awp-broiler-plan.xlsx") {
  const wb = XLSX.utils.book_new();

  const placementSheet = result.placementDays.map((r) => ({
    Date: r.date,
    "Farms Placing": r.farmsPlacing,
    "Chicks per Farm": r.chicksPerFarm,
    "Total Chicks Placed": r.farmsPlacing * r.chicksPerFarm,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(placementSheet), "Placement Plan");

  const liveBirdSheet = result.liveBird.map((r) => ({
    Week: r.week,
    "Harvest Start": r.harvestDateStart,
    "Harvest End": r.harvestDateEnd,
    "Placement Wk Ref": r.placementWeekRef ?? "-",
    "Harvestable Birds": round(r.harvestableBirds, 0),
    "Live Weight (tons)": round(r.totalLiveWeightTons),
    "Utilization %": round(r.utilizationPct),
    "Exceeds Capacity": r.exceedsCapacity ? "YES" : "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liveBirdSheet), "Live Bird Forecast");

  const carcassSheet = result.carcass.map((r) => ({
    Week: r.week,
    "Carcass (tons)": round(r.carcassWeightTons),
    "Grade A (tons)": round(r.gradeATons),
    "Grade B (tons)": round(r.gradeBTons),
    "Grade C (tons)": round(r.gradeCTons),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(carcassSheet), "Carcass Yield");

  const familySheet = result.family.map((r) => ({
    Week: r.week,
    "WC Fresh (tons)": round(r.wcFreshTons),
    "WC Frozen (tons)": round(r.wcFrozenTons),
    "FPP (tons)": round(r.fppTons),
    "Total (tons)": round(r.totalTons),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(familySheet), "Product Family");

  const keys = activeCutKeys(params.legSplitMode);
  const cutSheet = result.cuts.map((r) => {
    const row: Record<string, number | string> = { Week: r.week };
    keys.forEach((k) => {
      row[CUT_LABELS[k]] = round(r.cuts[k]);
    });
    row["Total (tons)"] = round(r.totalTons);
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cutSheet), "FPP Cut Plan");

  const plantSheet = result.plants.map((r) => ({
    Week: r.week,
    Plant: PLANT_LABELS[r.plant],
    Birds: round(r.birds, 0),
    "Live Weight (tons)": round(r.liveWeightTons),
    "Carcass (tons)": round(r.carcassTons),
    "WC Fresh (tons)": round(r.wcFreshTons),
    "WC Frozen (tons)": round(r.wcFrozenTons),
    "FPP (tons)": round(r.fppTons),
    "Daily Birds": round(r.dailyBirds, 0),
    "Capacity Breach": r.capacityBreach ? "YES" : "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plantSheet), "Processing by Plant");

  XLSX.writeFile(wb, fileName);
}

export async function exportSummaryToPDF(elementId: string, fileName = "awp-broiler-summary.pdf") {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const el = document.getElementById(elementId);
  if (!el) return;

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 40;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const finalHeight = Math.min(imgHeight, pageHeight - 40);

  pdf.addImage(imgData, "PNG", 20, 20, imgWidth, finalHeight);
  pdf.save(fileName);
}
