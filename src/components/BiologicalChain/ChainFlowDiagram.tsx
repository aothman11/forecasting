"use client";
/**
 * ChainFlowDiagram — SVG visualization of the full upstream biological supply chain.
 *
 * Two swim-lanes:
 *   GP lane   (top)  — GP Rearing → GP Laying → GP Hatchery
 *   AWP lane  (bottom) — AWP PS Rearing → AWP PS Laying → AWP Hatchery → AWP Broiler → Catching
 *
 * GP Hatchery connects DOWN to AWP PS Rearing (PS DOC delivery).
 * A self-replacement arc loops from GP Hatchery back to GP Rearing (above the GP lane).
 *
 * All lead-time labels are derived live from the `assumptions` prop so changing
 * a parameter in AssumptionsPanel instantly updates this diagram.
 */

import React from "react";
import { BioChainAssumptions } from "@/lib/biologicalChain/types";
import { totalLeadWeeks } from "@/lib/biologicalChain/calculations";

// ─── Layout constants ──────────────────────────────────────────────────────────

const VB_W = 1200;   // viewBox width
const VB_H = 400;    // viewBox height

// Stage box dimensions
const BOX_W  = 110;
const BOX_H  = 48;
const RADIUS = 7;   // corner radius

// Lane y-centers
const GP_Y  = 118;   // center-y for GP boxes
const AWP_Y = 298;   // center-y for AWP boxes

// Stage x-centers (left→right = earliest in time → latest)
// Gaps between box edges: GP side ≥50px, AWP side ≥20px
const XS = {
  gpRearing:    90,
  gpLaying:     265,
  gpHatchery:   460,
  awpPsRearing: 460,   // same x as gpHatchery (vertical connection)
  awpPsLaying:  640,
  awpHatchery:  795,
  awpBroiler:   940,
  catching:     1080,
};

// Arrow marker id
const ARROW_ID = "bc-arrow";
const ARROW_DASHED_ID = "bc-arrow-dashed";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Box top-left x given center-x */
const bx = (cx: number) => cx - BOX_W / 2;
/** Box top-left y given center-y */
const by = (cy: number) => cy - BOX_H / 2;

interface BoxProps {
  cx: number;
  cy: number;
  label: string;
  subLabel?: string;
  fill: string;
  stroke: string;
  textColor?: string;
}

function StageBox({ cx, cy, label, subLabel, fill, stroke, textColor = "#fff" }: BoxProps) {
  return (
    <g>
      <rect
        x={bx(cx)} y={by(cy)} width={BOX_W} height={BOX_H} rx={RADIUS}
        fill={fill} stroke={stroke} strokeWidth={1.5}
      />
      <text
        x={cx} y={cy + (subLabel ? -7 : 2)}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={11.5} fontWeight={700} fill={textColor} fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
      {subLabel && (
        <text
          x={cx} y={cy + 9}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={9.5} fontWeight={400} fill={textColor} fontFamily="system-ui,sans-serif"
          opacity={0.85}
        >
          {subLabel}
        </text>
      )}
    </g>
  );
}

interface HArrowProps {
  x1: number; y: number; x2: number;
  label: string; dashed?: boolean;
}

/** Horizontal arrow between two boxes with a centered lead-time label. */
function HArrow({ x1, y, x2, label, dashed }: HArrowProps) {
  const mx = (x1 + x2) / 2;
  return (
    <g>
      <line
        x1={x1} y1={y} x2={x2 - 10} y2={y}
        stroke="#94a3b8" strokeWidth={1.5}
        strokeDasharray={dashed ? "5 3" : undefined}
        markerEnd={`url(#${dashed ? ARROW_DASHED_ID : ARROW_ID})`}
      />
      <rect x={mx - 22} y={y - 14} width={44} height={16} rx={4} fill="var(--diagram-bg)" />
      <text
        x={mx} y={y - 6}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={9.5} fontWeight={600} fill="#64748b" fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

interface VArrowProps {
  x: number; y1: number; y2: number; label: string;
}

/** Vertical arrow from GP Hatchery down to AWP PS Rearing. */
function VArrow({ x, y1, y2, label }: VArrowProps) {
  const my = (y1 + y2) / 2;
  return (
    <g>
      <line
        x1={x} y1={y1} x2={x} y2={y2 - 10}
        stroke="#94a3b8" strokeWidth={1.5}
        markerEnd={`url(#${ARROW_ID})`}
      />
      <rect x={x + 6} y={my - 9} width={46} height={16} rx={4} fill="var(--diagram-bg)" />
      <text
        x={x + 29} y={my - 1}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={9.5} fontWeight={600} fill="#64748b" fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface ChainFlowDiagramProps {
  assumptions: BioChainAssumptions;
}

export function ChainFlowDiagram({ assumptions: a }: ChainFlowDiagramProps) {
  const lead = totalLeadWeeks(a);

  // ── Colors ────────────────────────────────────────────────────────────────
  const GP_FILL   = "#b45309";   // amber-700 — GP company
  const GP_STROKE = "#92400e";
  const AWP_FILL  = "#15803d";   // green-700 — AWP company
  const AWP_STROKE = "#166534";
  const CATCH_FILL = "#1d4ed8";  // blue-700 — Catching Plan (fixed)
  const CATCH_STROKE = "#1e40af";

  const GP_LANE_BG  = "rgba(245,158,11,0.07)";
  const AWP_LANE_BG = "rgba(34,197,94,0.07)";

  // ── Derived lead-time strings ─────────────────────────────────────────────
  const wk = (n: number) => `${n}wk${n !== 1 ? "s" : ""}`;
  const gpLayToHatch  = a.eggCollectionLeadWeeks + a.incubationWeeks;
  const awpLayToHatch = a.eggCollectionLeadWeeks + a.incubationWeeks;

  // Self-replacement arc: from top of GP Hatchery box, curves above, ends at top of GP Rearing
  const arcSY  = by(GP_Y);                  // top of GP Hatchery (start)
  const arcEY  = by(GP_Y);                  // top of GP Rearing  (end)
  const arcTop = arcSY - 52;                // how high the arc goes above the lane
  const arcSX  = XS.gpHatchery;
  const arcEX  = XS.gpRearing;
  const arcPath = `M ${arcSX} ${arcSY} C ${arcSX} ${arcTop}, ${arcEX} ${arcTop}, ${arcEX} ${arcEY}`;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        style={{ minWidth: 680, fontFamily: "system-ui,sans-serif" }}
        aria-label="Biological supply chain flow diagram"
      >
        {/* ── Defs: arrowhead markers ──────────────────────────────────── */}
        <defs>
          <marker id={ARROW_ID} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
          <marker id={ARROW_DASHED_ID} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* ── Lane backgrounds ──────────────────────────────────────────── */}
        {/* GP lane — spans from left margin to right edge of GP Hatchery */}
        <rect x={18} y={by(GP_Y) - 28} width={XS.gpHatchery + BOX_W / 2 + 20 - 18} height={BOX_H + 56}
          rx={10} fill={GP_LANE_BG} />
        {/* AWP lane — full width */}
        <rect x={18} y={by(AWP_Y) - 28} width={VB_W - 36} height={BOX_H + 56}
          rx={10} fill={AWP_LANE_BG} />

        {/* ── Lane labels ───────────────────────────────────────────────── */}
        <text x={18} y={by(GP_Y) - 12} fontSize={10} fontWeight={700} fill="#b45309"
          fontFamily="system-ui,sans-serif" letterSpacing={0.5}>
          GP (Grandparent)
        </text>
        <text x={18} y={by(AWP_Y) - 12} fontSize={10} fontWeight={700} fill="#15803d"
          fontFamily="system-ui,sans-serif" letterSpacing={0.5}>
          AWP (Parent + Broiler)
        </text>

        {/* ── GP → GP arrows (horizontal) ──────────────────────────────── */}
        <HArrow
          x1={XS.gpRearing + BOX_W / 2} y={GP_Y}
          x2={XS.gpLaying  - BOX_W / 2}
          label={wk(a.gpRearingWeeks)}
        />
        <HArrow
          x1={XS.gpLaying   + BOX_W / 2} y={GP_Y}
          x2={XS.gpHatchery - BOX_W / 2}
          label={wk(gpLayToHatch)}
        />

        {/* ── AWP arrows (horizontal) ───────────────────────────────────── */}
        <HArrow
          x1={XS.awpPsRearing + BOX_W / 2} y={AWP_Y}
          x2={XS.awpPsLaying  - BOX_W / 2}
          label={wk(a.psRearingWeeks)}
        />
        <HArrow
          x1={XS.awpPsLaying + BOX_W / 2} y={AWP_Y}
          x2={XS.awpHatchery - BOX_W / 2}
          label={wk(awpLayToHatch)}
        />
        <HArrow
          x1={XS.awpHatchery + BOX_W / 2} y={AWP_Y}
          x2={XS.awpBroiler  - BOX_W / 2}
          label={wk(a.incubationWeeks)}
        />
        <HArrow
          x1={XS.awpBroiler + BOX_W / 2} y={AWP_Y}
          x2={XS.catching   - BOX_W / 2}
          label={wk(a.broilerGrowoutWeeks)}
        />

        {/* ── Vertical: GP Hatchery → AWP PS Rearing ───────────────────── */}
        <VArrow
          x={XS.gpHatchery}
          y1={by(GP_Y) + BOX_H}
          y2={by(AWP_Y)}
          label={wk(a.gpHatcheryToAwpDeliveryWeeks)}
        />

        {/* ── Self-replacement arc ──────────────────────────────────────── */}
        <path d={arcPath}
          fill="none" stroke="#b45309" strokeWidth={1.5} strokeDasharray="5 3"
          markerEnd="url(#bc-arrow-self)"
        />
        <defs>
          <marker id="bc-arrow-self" markerWidth="8" markerHeight="8" refX="1" refY="3" orient="auto">
            <path d="M8,0 L8,6 L0,3 z" fill="#b45309" />
          </marker>
        </defs>
        {/* Self-replace label */}
        <rect
          x={(arcSX + arcEX) / 2 - 32} y={arcTop - 20}
          width={64} height={32} rx={5} fill="var(--diagram-bg)"
        />
        <text
          x={(arcSX + arcEX) / 2} y={arcTop - 9}
          textAnchor="middle" fontSize={9} fontWeight={700} fill="#b45309"
          fontFamily="system-ui,sans-serif"
        >
          Self-replace
        </text>
        <text
          x={(arcSX + arcEX) / 2} y={arcTop + 3}
          textAnchor="middle" fontSize={9} fill="#b45309"
          fontFamily="system-ui,sans-serif"
        >
          {(a.gpSelfreplacementRatio * 100).toFixed(0)}% of GP hatch
        </text>

        {/* ── Stage boxes — GP lane ─────────────────────────────────────── */}
        <StageBox cx={XS.gpRearing}  cy={GP_Y} fill={GP_FILL} stroke={GP_STROKE}
          label="GP Rearing"      subLabel={`${a.gpRearingWeeks}wk rearing`} />
        <StageBox cx={XS.gpLaying}   cy={GP_Y} fill={GP_FILL} stroke={GP_STROKE}
          label="GP Laying"       subLabel={`HDP ${(a.gpHenDayProduction * 100).toFixed(0)}%`} />
        <StageBox cx={XS.gpHatchery} cy={GP_Y} fill={GP_FILL} stroke={GP_STROKE}
          label="GP Hatchery"     subLabel={`${(a.hatchabilityGp * 100).toFixed(0)}% hatch`} />

        {/* ── Stage boxes — AWP lane ────────────────────────────────────── */}
        <StageBox cx={XS.awpPsRearing} cy={AWP_Y} fill={AWP_FILL} stroke={AWP_STROKE}
          label="AWP PS Rearing"  subLabel={`${a.psRearingWeeks}wk rearing`} />
        <StageBox cx={XS.awpPsLaying}  cy={AWP_Y} fill={AWP_FILL} stroke={AWP_STROKE}
          label="AWP PS Laying"   subLabel={`HDP ${(a.henDayProduction * 100).toFixed(0)}%`} />
        <StageBox cx={XS.awpHatchery}  cy={AWP_Y} fill={AWP_FILL} stroke={AWP_STROKE}
          label="AWP Hatchery"    subLabel={`${(a.hatchabilityPs * 100).toFixed(0)}% hatch`} />
        <StageBox cx={XS.awpBroiler}   cy={AWP_Y} fill={AWP_FILL} stroke={AWP_STROKE}
          label="AWP Broiler"     subLabel={`${a.broilerGrowoutWeeks}wk grow-out`} />
        <StageBox cx={XS.catching}     cy={AWP_Y} fill={CATCH_FILL} stroke={CATCH_STROKE}
          label="Catching Plan"   subLabel="fixed target" />

        {/* ── Total lead-time callout ───────────────────────────────────── */}
        <rect x={VB_W / 2 - 80} y={VB_H - 38} width={160} height={30} rx={6}
          fill="var(--diagram-badge-bg)" stroke="var(--diagram-badge-border)"
          strokeWidth={1}
        />
        <text x={VB_W / 2} y={VB_H - 22} textAnchor="middle"
          fontSize={11} fontWeight={700} fill="var(--diagram-badge-text)"
          fontFamily="system-ui,sans-serif"
        >
          Total lead time: {lead} weeks
        </text>
      </svg>

      {/* CSS tokens injected inline so the SVG can reference them */}
      <style>{`
        :root {
          --diagram-bg: #ffffff;
          --diagram-badge-bg: #f1f5f9;
          --diagram-badge-border: #cbd5e1;
          --diagram-badge-text: #1e293b;
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) {
            --diagram-bg: #0f172a;
            --diagram-badge-bg: #1e293b;
            --diagram-badge-border: #334155;
            --diagram-badge-text: #e2e8f0;
          }
        }
        :root[data-theme="dark"] {
          --diagram-bg: #0f172a;
          --diagram-badge-bg: #1e293b;
          --diagram-badge-border: #334155;
          --diagram-badge-text: #e2e8f0;
        }
        :root[data-theme="light"] {
          --diagram-bg: #ffffff;
          --diagram-badge-bg: #f1f5f9;
          --diagram-badge-border: #cbd5e1;
          --diagram-badge-text: #1e293b;
        }
      `}</style>
    </div>
  );
}
