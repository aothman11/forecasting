"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { usePlanStore } from "@/lib/store";
import type { BomRecord, GradePool } from "@/lib/bomTypes";
import { GRADE_POOL_LABELS } from "@/lib/bomTypes";

// ─── helpers ────────────────────────────────────────────────────────────────

const PLANTS = ["1100", "1200", "1300", "ALL"] as const;
const GRADE_POOLS: GradePool[] = ["930", "931", "932", "933"];

const POOL_COLORS: Record<GradePool, string> = {
  "930": "bg-green-100 text-green-800 border-green-200",
  "931": "bg-blue-100 text-blue-800 border-blue-200",
  "932": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "933": "bg-orange-100 text-orange-800 border-orange-200",
};

function carcassKgPerCarton(rec: BomRecord, gradeYields: Record<string, number>): number {
  const yield_ = gradeYields[rec.gradePool] ?? 1;
  if (yield_ <= 0) return 0;
  return (rec.packageWeightKg * rec.unitsPerCarton) / yield_;
}

function fmt2(n: number) {
  return n.toFixed(2);
}

// ─── blank record shape for add / edit ──────────────────────────────────────

function blankDraft(): Omit<BomRecord, "id"> {
  return {
    skuCode: "",
    skuDescription: "",
    packageWeightKg: 0.8,
    unitsPerCarton: 10,
    gradePool: "930",
    plant: "ALL",
  };
}

// ─── inline row editor ───────────────────────────────────────────────────────

function EditRow({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Omit<BomRecord, "id">;
  onChange: (patch: Partial<Omit<BomRecord, "id">>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inp =
    "w-full border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-brand-green";

  return (
    <tr className="bg-brand-green-tint/30">
      <td className="px-2 py-1.5">
        <input
          className={inp}
          placeholder="SAP code"
          value={draft.skuCode}
          onChange={(e) => onChange({ skuCode: e.target.value.trim() })}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          className={inp}
          placeholder="Description"
          value={draft.skuDescription}
          onChange={(e) => onChange({ skuDescription: e.target.value })}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.05"
          min="0"
          className={`${inp} w-20`}
          value={draft.packageWeightKg}
          onChange={(e) => onChange({ packageWeightKg: Number(e.target.value) })}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="1"
          min="1"
          className={`${inp} w-16`}
          value={draft.unitsPerCarton}
          onChange={(e) => onChange({ unitsPerCarton: Number(e.target.value) })}
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          className={`${inp} w-36`}
          value={draft.gradePool}
          onChange={(e) => onChange({ gradePool: e.target.value as GradePool })}
        >
          {GRADE_POOLS.map((p) => (
            <option key={p} value={p}>
              {p} · {GRADE_POOL_LABELS[p]}
            </option>
          ))}
        </select>
      </td>
      {/* derived — read-only in edit row, shown as placeholder */}
      <td className="px-2 py-1.5 text-neutral-400 text-xs italic text-right">auto</td>
      <td className="px-2 py-1.5">
        <select
          className={`${inp} w-28`}
          value={draft.plant}
          onChange={(e) => onChange({ plant: e.target.value as BomRecord["plant"] })}
        >
          {PLANTS.map((p) => (
            <option key={p} value={p}>
              {p === "ALL" ? "All Plants" : `Plant ${p}`}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <button
          onClick={onSave}
          className="text-xs font-semibold text-white bg-brand-green rounded px-2 py-0.5 mr-1 hover:bg-brand-green-dark transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          Cancel
        </button>
      </td>
    </tr>
  );
}

// ─── SAP BOM import parser ───────────────────────────────────────────────────

interface ImportPreviewRow {
  skuCode: string;
  skuDescription: string;
  packageWeightKg: number;
  unitsPerCarton: number;
  gradePool: GradePool;
  plant: BomRecord["plant"];
  isNew: boolean;
}

function parseSapBomFile(
  buffer: ArrayBuffer,
  existing: BomRecord[]
): { rows: ImportPreviewRow[]; errors: string[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const errors: string[] = [];
  const rows: ImportPreviewRow[] = [];
  const existingMap = new Map(existing.map((r) => [r.skuCode, r]));

  for (const sheetName of wb.SheetNames) {
    // Only process sheets whose name is a numeric SAP material number (7+ digits)
    if (!/^\d{7,}$/.test(sheetName.trim())) continue;

    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (data.length === 0) continue;

    // Find the row that has component 930/931/932/933 — that gives us grade pool + qty
    const fgCode = sheetName.trim();
    const fgDesc = String(data[0]["Material Number"] ?? "");

    // Base quantity and unit from the sheet header row
    const baseQtyRaw = data[0]["Base quantity"];
    const baseQty = typeof baseQtyRaw === "number" ? baseQtyRaw : Number(baseQtyRaw);
    const baseUnit = String(data[0]["BUn"] ?? "EA").toUpperCase();

    if (!["EA", "CAR"].includes(baseUnit) && baseUnit !== "") {
      // Unit might be KG for some semi-finished — skip those sheets
      errors.push(`Sheet ${sheetName}: unexpected base unit "${baseUnit}" — skipped`);
      continue;
    }

    // Find the first row where Component is one of 930/931/932/933
    const poolRow = data.find((row) => {
      const comp = String(row["Component"] ?? "").trim();
      return ["930", "931", "932", "933"].includes(comp);
    });

    if (!poolRow) {
      errors.push(`Sheet ${sheetName}: no grade-pool component (930/931/932/933) found — skipped`);
      continue;
    }

    const gradePool = String(poolRow["Component"]).trim() as GradePool;
    const compQtyRaw = poolRow["Quantity"];
    const compQty = typeof compQtyRaw === "number" ? compQtyRaw : Number(compQtyRaw);

    if (isNaN(compQty) || compQty <= 0) {
      errors.push(`Sheet ${sheetName}: invalid component quantity "${compQtyRaw}" — skipped`);
      continue;
    }

    // packageWeightKg = compQty (KG) / baseQty (EA)
    const packageWeightKg = parseFloat((compQty / baseQty).toFixed(4));
    const unitsPerCarton = Math.round(baseQty);

    // Plant — if Alternative Text column contains P1/P2/P3 info, use first alt
    // We just record "ALL" for import — planner can refine after
    const plant: BomRecord["plant"] = "ALL";

    rows.push({
      skuCode: fgCode,
      skuDescription: fgDesc,
      packageWeightKg,
      unitsPerCarton,
      gradePool,
      plant,
      isNew: !existingMap.has(fgCode),
    });
  }

  return { rows, errors };
}

// ─── main component ──────────────────────────────────────────────────────────

export function ProductBOM() {
  const params = usePlanStore((s) => s.params);
  const bomRecords = usePlanStore((s) => s.bomRecords);
  const addBomRecord = usePlanStore((s) => s.addBomRecord);
  const updateBomRecord = usePlanStore((s) => s.updateBomRecord);
  const removeBomRecord = usePlanStore((s) => s.removeBomRecord);
  const setBomRecords = usePlanStore((s) => s.setBomRecords);
  const toggleAssumptions = usePlanStore((s) => s.toggleAssumptions);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<BomRecord, "id">>(blankDraft());
  const [addingRow, setAddingRow] = useState(false);
  const [addDraft, setAddDraft] = useState<Omit<BomRecord, "id">>(blankDraft());

  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const gradeYields = params.gradeYields;

  // ── yield sum validation ──
  const gradeSum = Object.values(gradeYields).reduce((a, b) => a + b, 0);
  const gradeSumOk = Math.abs(gradeSum - 1) <= 0.001;

  // ── inline edit handlers ──
  const startEdit = (rec: BomRecord) => {
    setEditingId(rec.id);
    setEditDraft({ skuCode: rec.skuCode, skuDescription: rec.skuDescription, packageWeightKg: rec.packageWeightKg, unitsPerCarton: rec.unitsPerCarton, gradePool: rec.gradePool, plant: rec.plant });
    setAddingRow(false);
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!editDraft.skuCode.trim()) return;
    updateBomRecord(editingId, editDraft);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const saveAdd = () => {
    if (!addDraft.skuCode.trim()) return;
    addBomRecord({ ...addDraft, id: crypto.randomUUID() });
    setAddingRow(false);
    setAddDraft(blankDraft());
  };

  const cancelAdd = () => {
    setAddingRow(false);
    setAddDraft(blankDraft());
  };

  const deleteRow = (id: string) => {
    if (confirm("Delete this BOM record?")) removeBomRecord(id);
  };

  // ── import handlers ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      const { rows, errors } = parseSapBomFile(buf, bomRecords);
      setImportPreview(rows);
      setImportErrors(errors);
    };
    reader.readAsArrayBuffer(file);
    // reset so same file can be re-selected
    e.target.value = "";
  };

  const applyImport = () => {
    const updated = [...bomRecords];
    for (const row of importPreview) {
      const idx = updated.findIndex((r) => r.skuCode === row.skuCode);
      const rec: BomRecord = {
        id: idx >= 0 ? updated[idx].id : crypto.randomUUID(),
        skuCode: row.skuCode,
        skuDescription: row.skuDescription,
        packageWeightKg: row.packageWeightKg,
        unitsPerCarton: row.unitsPerCarton,
        gradePool: row.gradePool,
        plant: row.plant,
      };
      if (idx >= 0) updated[idx] = rec;
      else updated.push(rec);
    }
    setBomRecords(updated);
    setImportPreview([]);
    setImportErrors([]);
    setImportOpen(false);
  };

  // ── export ──
  const handleExport = () => {
    const rows = bomRecords.map((r) => ({
      "SKU Code": r.skuCode,
      "Description": r.skuDescription,
      "Package Weight (kg)": r.packageWeightKg,
      "Units per Carton": r.unitsPerCarton,
      "Grade Pool": r.gradePool,
      "Grade Pool Name": GRADE_POOL_LABELS[r.gradePool],
      "Carcass KG / Carton": parseFloat(carcassKgPerCarton(r, gradeYields).toFixed(4)),
      "Plant": r.plant,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product BOM");
    XLSX.writeFile(wb, "AWP_Product_BOM.xlsx");
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-brand-green-dark">Product BOM</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          FG SKU master — maps each finished-good SKU to its carcass grade pool and computes the carcass requirement per carton.
        </p>
      </div>

      {/* Grade yield summary bar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Carcass Grade Yields:</span>
            {GRADE_POOLS.map((pool) => (
              <span
                key={pool}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${POOL_COLORS[pool]}`}
              >
                {pool} · {GRADE_POOL_LABELS[pool]}
                <span className="font-bold ml-1">{(gradeYields[pool] * 100).toFixed(0)}%</span>
              </span>
            ))}
            {!gradeSumOk && (
              <span className="text-xs text-red-600 font-semibold">
                ⚠ Total = {(gradeSum * 100).toFixed(1)}% (must be 100%)
              </span>
            )}
            {gradeSumOk && (
              <span className="text-xs text-green-700">✓ Sums to 100%</span>
            )}
          </div>
          <button
            onClick={toggleAssumptions}
            className="text-xs text-brand-green-dark font-medium underline underline-offset-2 hover:no-underline"
          >
            Edit in Assumptions →
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setAddingRow(true); setEditingId(null); setAddDraft(blankDraft()); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-green text-white hover:bg-brand-green-dark transition-colors shadow-sm"
        >
          ＋ Add SKU
        </button>
        <button
          onClick={() => { setImportOpen((o) => !o); setImportPreview([]); setImportErrors([]); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-neutral-700 hover:border-brand-green hover:text-brand-green-dark transition-colors"
        >
          ⬆ Import from SAP BOM
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-neutral-700 hover:border-brand-green hover:text-brand-green-dark transition-colors"
        >
          ⬇ Export
        </button>
        <span className="ml-auto text-xs text-neutral-400">{bomRecords.length} SKU{bomRecords.length !== 1 ? "s" : ""}</span>
      </div>

      {/* SAP Import panel */}
      {importOpen && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-blue-900">Import from SAP BOM Excel</div>
              <div className="text-xs text-blue-700 mt-0.5">
                Upload the multi-sheet SAP BOM file (same format as the example). Only sheets with a
                7-digit numeric name are parsed as FG SKUs. Existing SKUs are updated; new ones are added.
              </div>
            </div>
            <button onClick={() => setImportOpen(false)} className="text-blue-400 hover:text-blue-700 text-lg leading-none">✕</button>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-blue-300 bg-white text-blue-800 hover:border-blue-500 transition-colors"
            >
              Choose File
            </button>
            {importPreview.length > 0 && (
              <span className="text-xs text-blue-700">{importPreview.length} SKU(s) ready to import</span>
            )}
          </div>

          {importErrors.length > 0 && (
            <div className="space-y-1">
              {importErrors.map((e, i) => (
                <div key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                  ⚠ {e}
                </div>
              ))}
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-blue-100 text-blue-900 text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">SKU Code</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Pkg (kg)</th>
                    <th className="px-3 py-2 text-right">EA/CAR</th>
                    <th className="px-3 py-2 text-left">Grade Pool</th>
                    <th className="px-3 py-2 text-left">Plant</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row, i) => (
                    <tr key={i} className="border-t border-blue-100">
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${row.isNew ? "bg-green-100 text-green-800 border-green-200" : "bg-amber-100 text-amber-800 border-amber-200"}`}>
                          {row.isNew ? "New" : "Update"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono tabular-nums">{row.skuCode}</td>
                      <td className="px-3 py-1.5 text-neutral-700">{row.skuDescription}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.packageWeightKg}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{row.unitsPerCarton}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${POOL_COLORS[row.gradePool]}`}>
                          {row.gradePool} · {GRADE_POOL_LABELS[row.gradePool]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-neutral-600">{row.plant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={applyImport}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-green text-white hover:bg-brand-green-dark transition-colors"
              >
                Apply {importPreview.length} SKU{importPreview.length !== 1 ? "s" : ""}
              </button>
              <button
                onClick={() => { setImportPreview([]); setImportErrors([]); }}
                className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* BOM table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-brand-green-tint text-brand-green-dark text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left font-semibold">SKU Code</th>
                <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pkg (kg)</th>
                <th className="px-3 py-2.5 text-right font-semibold">EA/CAR</th>
                <th className="px-3 py-2.5 text-left font-semibold">Grade Pool</th>
                <th className="px-3 py-2.5 text-right font-semibold" title="Carcass KG consumed per shipping carton = (pkg × EA) ÷ grade yield%">
                  Carcass KG/CAR ℹ
                </th>
                <th className="px-3 py-2.5 text-left font-semibold">Plant</th>
                <th className="px-3 py-2.5 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bomRecords.map((rec, i) =>
                editingId === rec.id ? (
                  <EditRow
                    key={rec.id}
                    draft={editDraft}
                    onChange={(p) => setEditDraft((d) => ({ ...d, ...p }))}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                  />
                ) : (
                  <tr
                    key={rec.id}
                    className={`border-t border-[var(--border-subtle)] ${i % 2 === 0 ? "bg-white" : "bg-neutral-50/50"} hover:bg-brand-green-tint/20 transition-colors`}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-neutral-800 tabular-nums">
                      {rec.skuCode}
                    </td>
                    <td className="px-3 py-2 text-neutral-700 max-w-xs truncate" title={rec.skuDescription}>
                      {rec.skuDescription}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                      {fmt2(rec.packageWeightKg)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                      {rec.unitsPerCarton}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold ${POOL_COLORS[rec.gradePool]}`}>
                        {rec.gradePool} · {GRADE_POOL_LABELS[rec.gradePool]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">
                      {fmt2(carcassKgPerCarton(rec, gradeYields))}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {rec.plant === "ALL" ? "All Plants" : `Plant ${rec.plant}`}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => startEdit(rec)}
                        className="text-xs text-brand-green-dark font-medium hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRow(rec.id)}
                        className="text-xs text-red-500 font-medium hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )}

              {/* Add new row inline form */}
              {addingRow && (
                <EditRow
                  draft={addDraft}
                  onChange={(p) => setAddDraft((d) => ({ ...d, ...p }))}
                  onSave={saveAdd}
                  onCancel={cancelAdd}
                />
              )}

              {bomRecords.length === 0 && !addingRow && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-400 text-sm">
                    No SKUs yet. Click <strong>＋ Add SKU</strong> or <strong>⬆ Import from SAP BOM</strong> to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {bomRecords.length > 0 && (
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] bg-neutral-50/80 flex items-center gap-6 flex-wrap text-xs text-neutral-500">
            {GRADE_POOLS.map((pool) => {
              const count = bomRecords.filter((r) => r.gradePool === pool).length;
              return count > 0 ? (
                <span key={pool} className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    pool === "930" ? "bg-green-500" : pool === "931" ? "bg-blue-500" : pool === "932" ? "bg-yellow-500" : "bg-orange-500"
                  }`} />
                  {GRADE_POOL_LABELS[pool]}: <strong className="text-neutral-700">{count}</strong>
                </span>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
