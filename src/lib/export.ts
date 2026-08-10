import * as XLSX from "xlsx";
import type { PipelineResult } from "./types";
import { activeCutKeys } from "./calculations";
import { CHANNEL_KEYS, CUT_LABELS, DEFAULT_CHICKS_PER_HOUSE, PLANT_LABELS, SIZE_KEYS, SIZE_LABELS } from "./defaults";
import type { ChannelKey, DemandPlanQty, DemandProduct, MonthlyPlanConfig, Parameters as PlanParameters, PlacementDayRow } from "./types";
import type { MEQ1Row } from "./farmQuota";

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
    "Cuts (kg)": round(r.cutsKg, 0),
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
    row["FPP from Cuts (kg)"] = round(r.fppInputKg, 0);
    row["Net Cuts (kg)"] = round(r.netCutsKg, 0);
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cutSheet), "Cut Plan");

  const plantSheet = result.plants.map((r) => ({
    Week: r.week,
    Plant: PLANT_LABELS[r.plant],
    Birds: round(r.birds, 0),
    "Live Weight (kg)": round(r.liveWeightKg, 0),
    "Carcass (kg)": round(r.carcassKg, 0),
    "WC Fresh (kg)": round(r.wcFreshKg, 0),
    "WC Frozen (kg)": round(r.wcFrozenKg, 0),
    "Cuts (kg)": round(r.cutsKg, 0),
    "Daily Birds": round(r.dailyBirds, 0),
    "Capacity Breach": r.capacityBreach ? "YES" : "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plantSheet), "Processing by Plant");

  XLSX.writeFile(wb, fileName);
}

/**
 * SAP MEQ1 Quota Arrangement upload as a tab-delimited .txt file (LSMW-compatible).
 * No external libraries — uses browser Blob download.
 */
export function exportMEQ1ToTxt(
  rows: MEQ1Row[],
  config: MonthlyPlanConfig,
  fileName = "awp-meq1-quota-arrangement.txt"
) {
  const header = ["MATNR", "WERKS", "DATAB", "DATBI", "QUPOS", "VERID", "QUMAX", "QUPRI", "QUAZT", "QUMIN"].join("\t");
  const dataLines = rows.map((r) =>
    [r.matnr, r.werks, r.datab, r.datbi, r.qupos, r.verid, r.qumax, r.qupri, r.quazt, r.qumin].join("\t")
  );
  const content = [header, ...dataLines].join("\r\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * SAP MEQ1 Quota Arrangement upload workbook (LSMW-compatible).
 * Columns match the exact SAP MEQ1 batch-upload format.
 */
export function exportMEQ1ToExcel(
  rows: MEQ1Row[],
  config: MonthlyPlanConfig,
  fileName = "awp-meq1-quota-arrangement.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const sheet = rows.map((r) => ({
    MATNR: r.matnr,
    WERKS: r.werks,
    DATAB: r.datab,
    DATBI: r.datbi,
    QUPOS: r.qupos,
    VERID: r.verid,
    QUMAX: r.qumax,
    QUPRI: r.qupri,
    QUAZT: r.quazt,
    QUMIN: r.qumin,
  }));

  const ws = XLSX.utils.json_to_sheet(sheet);
  ws["!cols"] = [
    { wch: 18 }, // MATNR
    { wch: 8 },  // WERKS
    { wch: 12 }, // DATAB
    { wch: 12 }, // DATBI
    { wch: 8 },  // QUPOS
    { wch: 8 },  // VERID
    { wch: 10 }, // QUMAX
    { wch: 8 },  // QUPRI
    { wch: 8 },  // QUAZT
    { wch: 8 },  // QUMIN
  ];
  XLSX.utils.book_append_sheet(wb, ws, "MEQ1 Upload");

  // Summary sheet
  const summary = [
    { Field: "Plant (WERKS)", Value: config.plant },
    { Field: "Planning Month", Value: config.planningMonth.slice(0, 7) },
    { Field: "Cobb Material No.", Value: config.cobbMatNo },
    { Field: "Ross Material No.", Value: config.rossMatNo },
    { Field: "GP Material No.", Value: config.gpMatNo },
    { Field: "Total Rows", Value: rows.length },
    { Field: "Generated On", Value: new Date().toISOString().slice(0, 10) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

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

export interface SOPReportRow {
  week: number;
  wcDemandTons: number;
  wcSupplyTons: number;
  fppDemandTons: number;
  fppSupplyTons: number;
  cutsDemandTons: number;
  cutsSupplyTons: number;
  placementWeek: number;
  overallStatus: "green" | "amber" | "red" | "na";
}

export function exportSOPReportToExcel(
  rows: SOPReportRow[],
  planStartDate: string,
  fileName = "awp-sop-report.xlsx"
) {
  const wb = XLSX.utils.book_new();

  const ragLabel = (s: SOPReportRow["overallStatus"]) =>
    s === "green" ? "OK" : s === "amber" ? "TIGHT" : s === "red" ? "DEFICIT" : "No demand";

  const covPct = (d: number, s: number) =>
    d > 0 ? round((s / d) * 100, 1) : null;

  const sheet = rows.map((r) => ({
    Week: `W${r.week}`,
    "WC Demand (t)": round(r.wcDemandTons, 1),
    "WC Supply (t)": round(r.wcSupplyTons, 1),
    "WC Coverage %": covPct(r.wcDemandTons, r.wcSupplyTons) ?? "—",
    "FPP Demand (t)": round(r.fppDemandTons, 1),
    "FPP Supply (t)": round(r.fppSupplyTons, 1),
    "FPP Coverage %": covPct(r.fppDemandTons, r.fppSupplyTons) ?? "—",
    "Cuts Demand (t)": round(r.cutsDemandTons, 1),
    "Cuts Supply (t)": round(r.cutsSupplyTons, 1),
    "Cuts Coverage %": covPct(r.cutsDemandTons, r.cutsSupplyTons) ?? "—",
    "Placement Wk": r.placementWeek > 0 ? `Wk ${r.placementWeek}` : "pre-plan",
    Status: ragLabel(r.overallStatus),
  }));

  const ws = XLSX.utils.json_to_sheet(sheet);
  ws["!cols"] = Object.keys(sheet[0] ?? {}).map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, ws, "COP Report");

  // Summary tab
  const totals = rows.reduce(
    (acc, r) => {
      acc.wcD += r.wcDemandTons; acc.wcS += r.wcSupplyTons;
      acc.fppD += r.fppDemandTons; acc.fppS += r.fppSupplyTons;
      acc.cutsD += r.cutsDemandTons; acc.cutsS += r.cutsSupplyTons;
      return acc;
    },
    { wcD: 0, wcS: 0, fppD: 0, fppS: 0, cutsD: 0, cutsS: 0 }
  );
  const summarySheet = [
    { Metric: "Plan Start Date", Value: planStartDate },
    { Metric: "Planning Weeks", Value: rows.length },
    { Metric: "WC Total Demand (t)", Value: round(totals.wcD, 1) },
    { Metric: "WC Total Supply (t)", Value: round(totals.wcS, 1) },
    { Metric: "WC Coverage %", Value: totals.wcD > 0 ? round((totals.wcS / totals.wcD) * 100, 1) : "—" },
    { Metric: "FPP Total Demand (t)", Value: round(totals.fppD, 1) },
    { Metric: "FPP Total Supply (t)", Value: round(totals.fppS, 1) },
    { Metric: "FPP Coverage %", Value: totals.fppD > 0 ? round((totals.fppS / totals.fppD) * 100, 1) : "—" },
    { Metric: "Cuts Total Demand (t)", Value: round(totals.cutsD, 1) },
    { Metric: "Cuts Total Supply (t)", Value: round(totals.cutsS, 1) },
    { Metric: "Cuts Coverage %", Value: totals.cutsD > 0 ? round((totals.cutsS / totals.cutsD) * 100, 1) : "—" },
    { Metric: "Deficit Weeks", Value: rows.filter((r) => r.overallStatus === "red").length },
    { Metric: "Tight Weeks", Value: rows.filter((r) => r.overallStatus === "amber").length },
    { Metric: "OK Weeks", Value: rows.filter((r) => r.overallStatus === "green").length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "Summary");

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
