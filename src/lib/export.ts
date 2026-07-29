import * as XLSX from "xlsx";
import type { PipelineResult } from "./types";
import { activeCutKeys } from "./calculations";
import { CHANNEL_KEYS, CUT_LABELS, DEFAULT_CHICKS_PER_HOUSE, PLANT_LABELS, SIZE_KEYS, SIZE_LABELS } from "./defaults";
import type { ChannelKey, DemandPlanQty, DemandProduct, Parameters as PlanParameters, PlacementDayRow } from "./types";

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
    "Placement Date": d.date,
    "House Placing": "",
    "Chicks per House": DEFAULT_CHICKS_PER_HOUSE,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Placement Plan");
  XLSX.writeFile(wb, fileName);
}

/** Blank template matching the SAP sales plan export structure, with one illustrative example row. */
export function exportSalesPlanTemplate(year: number, fileName = "awp-sales-plan-template.xlsx") {
  const wb = XLSX.utils.book_new();
  const exampleRow = {
    "Year.Quarter": `${year}.Q3`,
    "Year.Month": `${year}.08`,
    Month: "August",
    [`Week No. in ${year}`]: 32,
    "Week No. in Month": 1,
    "Sales Office": "e.g. Riyadh",
    Channels: "e.g. Retail",
    "Material Division": "e.g. Poultry",
    Division: "e.g. Fresh",
    "Material Category": "e.g. Whole Chicken",
    "Material Report Group": "e.g. WC",
    "WH Grading": "e.g. A",
    Grading: "e.g. Grade A",
    Size: "900g",
    "Material Code": "e.g. 100234",
    "Material Description": "e.g. Whole Chicken Fresh 900g",
    "Weight of carton": 12,
    "Gross Sales Volume (CAR)": 500,
    "Gross Sales Volume (UoM)": 6000,
    "Gross Sales Value (SAR)": 45000,
    "Net Sales Value (SAR)": 43000,
  };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([exampleRow]), "Sales Plan");
  XLSX.writeFile(wb, fileName);
}

export function exportPipelineToExcel(
  result: PipelineResult,
  params: PlanParameters,
  fileName = "awp-production-plan.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const placementSheet = result.placementDays.map((r) => ({
    "Placement Date": r.date,
    "House Placing": r.farmsPlacing,
    "Chicks per House": r.chicksPerHouse,
    "Total Chicks Placed": r.farmsPlacing * r.chicksPerHouse,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(placementSheet), "Placement Plan");

  const liveBirdSheet = result.liveBird.map((r) => ({
    Week: r.week,
    "Harvest Start": r.harvestDateStart,
    "Harvest End": r.harvestDateEnd,
    "Placement Wk Ref": r.placementWeekRef ?? "-",
    "Harvestable Birds": round(r.harvestableBirds, 0),
    "Live Weight (kg)": round(r.totalLiveWeightKg, 0),
    "Utilization %": round(r.utilizationPct),
    "Exceeds Capacity": r.exceedsCapacity ? "YES" : "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liveBirdSheet), "Live Bird Forecast");

  const funnelSheet = result.liveBird.map((r) => ({
    Week: r.week,
    "Harvestable Birds": round(r.harvestableBirds, 0),
    "Harvest Mortality (0.2%)": round(r.harvestMortalityBirds, 0),
    "Dispatched Birds": round(r.dispatchedBirds, 0),
    "DOA (0.5%)": round(r.doaBirds, 0),
    "Culled (0.2%)": round(r.culledBirds, 0),
    "Electronic Bird Count": round(r.electronicBirdCount, 0),
    "Plucking Rejects (0.6%)": round(r.pluckingRejectBirds, 0),
    "Slaughtered Birds": round(r.slaughteredBirds, 0),
    "Slaughtered Carcass Weight (kg)": round(r.slaughteredCarcassWeightKg, 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(funnelSheet), "Processing Funnel");

  const carcassSheet = result.carcass.map((r) => ({
    Week: r.week,
    "Carcass (PC)": round(r.carcassCountPc, 0),
    "Carcass (kg)": round(r.carcassWeightKg, 0),
    "Grade A (kg)": round(r.gradeAKg, 0),
    "Grade B (kg)": round(r.gradeBKg, 0),
    "Grade C (kg)": round(r.gradeCKg, 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(carcassSheet), "Carcass Yield");

  const sizeTotals = SIZE_KEYS.reduce((acc, key) => {
    acc[key] = { birds: 0, kg: 0 };
    return acc;
  }, {} as Record<(typeof SIZE_KEYS)[number], { birds: number; kg: number }>);
  result.carcassSizes.forEach((week) => {
    SIZE_KEYS.forEach((key) => {
      sizeTotals[key].birds += week.sizes[key].birds;
      sizeTotals[key].kg += week.sizes[key].kg;
    });
  });
  const sizeSheet = SIZE_KEYS.map((key) => ({
    Size: SIZE_LABELS[key],
    "Distribution %": round(params.carcassSizeDistribution[key] * 100, 2),
    "Bird Count": round(sizeTotals[key].birds, 0),
    "Weight (kg)": round(sizeTotals[key].kg, 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sizeSheet), "Carcass Size Distribution");

  const familySheet = result.family.map((r) => ({
    Week: r.week,
    "WC Fresh (kg)": round(r.wcFreshKg, 0),
    "WC Frozen (kg)": round(r.wcFrozenKg, 0),
    "FPP (kg)": round(r.fppKg, 0),
    "Total (kg)": round(r.totalKg, 0),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(familySheet), "Product Family");

  const keys = activeCutKeys(params.legSplitMode);
  const cutSheet = result.cuts.map((r) => {
    const row: Record<string, number | string> = { Week: r.week };
    keys.forEach((k) => {
      row[CUT_LABELS[k]] = round(r.cuts[k], 0);
    });
    row["Total (kg)"] = round(r.totalKg, 0);
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cutSheet), "FPP Cut Plan");

  const plantSheet = result.plants.map((r) => ({
    Week: r.week,
    Plant: PLANT_LABELS[r.plant],
    Birds: round(r.birds, 0),
    "Live Weight (kg)": round(r.liveWeightKg, 0),
    "Carcass (kg)": round(r.carcassKg, 0),
    "WC Fresh (kg)": round(r.wcFreshKg, 0),
    "WC Frozen (kg)": round(r.wcFrozenKg, 0),
    "FPP (kg)": round(r.fppKg, 0),
    "Daily Birds": round(r.dailyBirds, 0),
    "Capacity Breach": r.capacityBreach ? "YES" : "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plantSheet), "Processing by Plant");

  XLSX.writeFile(wb, fileName);
}

/**
 * Standalone workbook: one sheet per channel (+ one "All Channels" summary),
 * products as rows, weeks as columns.
 */
export function exportDemandPlanToExcel(
  products: DemandProduct[],
  qty: DemandPlanQty,
  weeks: number[],
  fileName = "awp-demand-plan.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const channels: (ChannelKey | "ALL")[] = ["ALL", ...CHANNEL_KEYS];

  channels.forEach((ch) => {
    const rows = products.map((p) => {
      const row: Record<string, string | number> = {
        Category: p.category,
        Product: p.name,
        Unit: p.unit,
      };
      let total = 0;
      weeks.forEach((w) => {
        const key = ch === "ALL"
          ? CHANNEL_KEYS.reduce((s, c) => s + (qty[`${p.id}::${c}::${w}`] ?? 0), 0)
          : (qty[`${p.id}::${ch}::${w}`] ?? 0);
        row[`W${w}`] = round(key, 2);
        total += key;
      });
      row["Total"] = round(total, 2);
      return row;
    });
    const label = ch === "ALL" ? "All Channels" : ch;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), label);
  });

  XLSX.writeFile(wb, fileName);
}

export async function exportSummaryToPDF(elementId: string, fileName = "awp-production-summary.pdf") {
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
