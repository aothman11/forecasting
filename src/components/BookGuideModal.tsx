"use client";

import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

/** Simulated browser chrome bar above each screenshot */
function ScreenChrome() {
  return (
    <div style={{ background: "#0b1e30", height: 24, display: "flex", alignItems: "center", padding: "0 10px", gap: 5 }}>
      {["#ef4444","#f59e0b","#22c55e"].map((c, i) => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
      ))}
    </div>
  );
}

function Screen({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <div className="guide-screen-wrap">
      <ScreenChrome />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} style={{ display: "block", width: "100%", height: "auto" }} loading="lazy" />
      <div className="guide-screen-caption">{caption}</div>
    </div>
  );
}

function MBanner({ badge, badgeColor, label, title, sub }: { badge: string; badgeColor: string; label: string; title: string; sub?: string }) {
  return (
    <div className="guide-m-banner" style={{ background: badgeColor }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span className="guide-m-badge">{badge}</span>
        <span className="guide-m-label">{label}</span>
      </div>
      <div className="guide-m-title">{title}</div>
      {sub && <div className="guide-m-sub">{sub}</div>}
    </div>
  );
}

function ChapterBanner({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="guide-chapter-banner">
      <div className="guide-chapter-num">{num}</div>
      <div className="guide-chapter-title">{title}</div>
      {desc && <div className="guide-chapter-desc">{desc}</div>}
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="guide-step-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className="guide-step-num">{i + 1}</span>
          <span dangerouslySetInnerHTML={{ __html: item }} />
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="guide-bullet-list">
      {items.map((item, i) => (
        <li key={i}><span dangerouslySetInnerHTML={{ __html: item }} /></li>
      ))}
    </ul>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="guide-note"><span>ℹ</span><span>{children}</span></div>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="guide-tip"><span>★</span><span>{children}</span></div>;
}

function ParamTable({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0" }}>
      <table className="guide-param-table">
        <thead><tr><th>Parameter</th><th>What it controls</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td>{k}</td><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="guide-two-col">{children}</div>;
}
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="guide-info-card">
      <div className="guide-info-card-title">{title}</div>
      {children}
    </div>
  );
}

export function BookGuideModal({ onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <>
      {/* ── Print + component styles ── */}
      <style>{`
        /* ── Core tokens ─────────────────────────────────────── */
        :root {
          --guide-green:#047836; --guide-green-dk:#025929;
          --guide-green-tint:#eaf5ee; --guide-green-mid:#c6e8d3;
          --guide-navy:#0b1e30;  --guide-amber:#996600;
          --guide-amber-bg:#fffbeb;
          --guide-fg:#374151; --guide-fg-head:#111827; --guide-fg-muted:#6b7280;
          --guide-surface:#ffffff; --guide-border:#e2e8e4; --guide-border-dk:#c5d1c9;
        }

        /* ── Overlay / modal ─────────────────────────────────── */
        .book-guide-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: #f7fbf8;
          display: flex; flex-direction: column;
          font-family: system-ui,-apple-system,'Segoe UI',sans-serif;
          color: var(--guide-fg);
          overflow: hidden;
        }

        /* toolbar */
        .book-guide-toolbar {
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 24px;
          background: var(--guide-navy); color: #fff;
          font-size: 12px; gap: 12px;
          flex-shrink: 0;
        }
        .book-guide-toolbar-title { font-weight: 700; letter-spacing: .08em; opacity: .9; }
        .book-guide-toolbar-actions { display: flex; align-items: center; gap: 8px; }
        .book-guide-btn-pdf {
          display: flex; align-items: center; gap: 6px;
          background: var(--guide-green); color: #fff;
          border: none; border-radius: 6px;
          padding: 7px 16px; font-size: 12px; font-weight: 700;
          cursor: pointer; letter-spacing: .04em; transition: opacity .15s;
        }
        .book-guide-btn-pdf:hover { opacity: .85; }
        .book-guide-btn-close {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 6px;
          border: 1px solid rgba(255,255,255,.2); background: transparent;
          color: #fff; cursor: pointer; font-size: 16px; line-height: 1;
          transition: background .15s;
        }
        .book-guide-btn-close:hover { background: rgba(255,255,255,.1); }

        /* scrollable body */
        .book-guide-body {
          flex: 1; overflow-y: auto; padding: 0 20px 60px;
        }
        .book-guide-inner { max-width: 960px; margin: 0 auto; }

        /* ── Cover ───────────────────────────────────────────── */
        .guide-cover {
          background: var(--guide-green); border-radius: 12px;
          padding: 64px 56px 56px; color: #fff;
          min-height: 440px; display: flex; flex-direction: column;
          justify-content: space-between;
          position: relative; overflow: hidden;
          margin-top: 32px;
        }
        .guide-cover::before {
          content:''; position: absolute; inset: 0;
          background: repeating-linear-gradient(-45deg,transparent,transparent 40px,rgba(255,255,255,.03) 40px,rgba(255,255,255,.03) 80px);
          pointer-events: none;
        }
        .guide-cover-eyebrow { font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;opacity:.65;margin-bottom:20px; }
        .guide-cover-title { font-family:Georgia,'Times New Roman',serif;font-size:clamp(32px,4vw,48px);font-weight:700;line-height:1.1;margin-bottom:14px; }
        .guide-cover-sub { font-size:15px;opacity:.75;max-width:480px;line-height:1.5; }
        .guide-cover-meta { display:flex;align-items:flex-end;justify-content:space-between;margin-top:40px;gap:20px;flex-wrap:wrap; }
        .guide-cover-logo { background:rgba(255,255,255,.1);border-radius:8px;padding:10px 18px; }
        .guide-cover-logo-text { font-size:20px;font-weight:900;letter-spacing:.06em; }
        .guide-cover-logo-sub { font-size:9px;letter-spacing:.15em;opacity:.7;text-transform:uppercase;margin-top:2px; }
        .guide-cover-version { font-size:12px;opacity:.5;letter-spacing:.06em; }

        /* ── TOC ─────────────────────────────────────────────── */
        .guide-toc-grid { display:grid;grid-template-columns:1fr 1fr;gap:6px 32px;margin-top:16px; }
        @media(max-width:600px){.guide-toc-grid{grid-template-columns:1fr}}
        .guide-toc-section-head { font-size:9.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--guide-green);margin-top:18px;margin-bottom:2px;grid-column:1/-1; }
        .guide-toc-item { display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px dotted var(--guide-border);font-size:13px; }
        .guide-toc-badge { flex-shrink:0;width:28px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:9px;font-weight:800;color:#fff; }

        /* ── Chapter banner ──────────────────────────────────── */
        .guide-chapter-banner { background:var(--guide-green);border-radius:10px;padding:26px 34px;color:#fff;margin:32px 0 20px; }
        .guide-chapter-num { font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;opacity:.6;margin-bottom:4px; }
        .guide-chapter-title { font-family:Georgia,'Times New Roman',serif;font-size:clamp(20px,3vw,28px);font-weight:700;line-height:1.15; }
        .guide-chapter-desc { margin-top:6px;font-size:14px;opacity:.8;max-width:600px;line-height:1.5; }

        /* ── Module banners ──────────────────────────────────── */
        .guide-m-banner { border-radius:10px;padding:18px 26px;color:#fff;margin:28px 0 16px; }
        .guide-m-badge { background:rgba(255,255,255,.2);font-size:11px;font-weight:800;letter-spacing:.06em;padding:3px 10px;border-radius:4px; }
        .guide-m-label { font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;opacity:.7; }
        .guide-m-title { font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;line-height:1.2;margin-top:4px; }
        .guide-m-sub { font-size:13px;opacity:.75;margin-top:4px; }

        /* ── Screenshots ─────────────────────────────────────── */
        .guide-screen-wrap { border-radius:10px;border:1px solid var(--guide-border-dk);overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.07);margin:16px 0;background:var(--guide-surface); }
        .guide-screen-caption { background:var(--guide-green-tint);border-top:1px solid var(--guide-border);padding:7px 14px;font-size:11px;color:var(--guide-green-dk);font-weight:600;letter-spacing:.04em; }

        /* ── Text ────────────────────────────────────────────── */
        .guide-p { color:var(--guide-fg);margin-bottom:10px;font-size:14px;line-height:1.65; }
        .guide-p:last-child { margin-bottom:0; }

        /* ── Note / Tip ──────────────────────────────────────── */
        .guide-note,.guide-tip { display:flex;gap:10px;border-radius:8px;padding:12px 16px;font-size:13px;margin:12px 0;border-left:3px solid; }
        .guide-note { background:var(--guide-green-tint);border-color:var(--guide-green); }
        .guide-tip { background:var(--guide-amber-bg);border-color:var(--guide-amber); }

        /* ── Step / bullet lists ─────────────────────────────── */
        .guide-step-list { list-style:none;margin:12px 0;padding:0; }
        .guide-step-list li { display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--guide-fg);margin-bottom:8px; }
        .guide-step-num { flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--guide-green-tint);color:var(--guide-green-dk);font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:2px; }
        .guide-bullet-list { list-style:none;margin:10px 0;padding:0; }
        .guide-bullet-list li { display:flex;gap:8px;align-items:flex-start;font-size:13.5px;color:var(--guide-fg);margin-bottom:7px;padding-left:4px; }
        .guide-bullet-list li::before { content:'';flex-shrink:0;width:5px;height:5px;border-radius:50%;background:var(--guide-green);margin-top:8px; }

        /* ── Param table ─────────────────────────────────────── */
        .guide-param-table { width:100%;border-collapse:collapse;font-size:13px; }
        .guide-param-table thead th { text-align:left;padding:8px 12px;font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--guide-fg-muted);background:var(--guide-green-tint);border-bottom:2px solid var(--guide-border-dk); }
        .guide-param-table tbody tr { border-bottom:1px solid var(--guide-border); }
        .guide-param-table td { padding:9px 12px;vertical-align:top; }
        .guide-param-table td:first-child { font-weight:600;color:var(--guide-fg-head);font-size:12.5px;white-space:nowrap; }

        /* ── Two-col / Info card ─────────────────────────────── */
        .guide-two-col { display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0; }
        @media(max-width:640px){.guide-two-col{grid-template-columns:1fr}}
        .guide-info-card { background:var(--guide-surface);border:1px solid var(--guide-border);border-radius:8px;padding:14px; }
        .guide-info-card-title { font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--guide-green);margin-bottom:8px; }

        /* ── Workflow flow ───────────────────────────────────── */
        .guide-flow-row { display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:14px 0; }
        .guide-flow-step { border-radius:8px;border:1px solid var(--guide-border-dk);background:var(--guide-surface);padding:8px 12px;text-align:center; }
        .guide-flow-label { font-size:11.5px;font-weight:700;color:var(--guide-fg-head); }
        .guide-flow-sub { font-size:10px;color:var(--guide-fg-muted);margin-top:2px; }
        .guide-flow-arrow { color:var(--guide-border-dk);font-size:18px;font-weight:300; }

        /* ── Divider ─────────────────────────────────────────── */
        .guide-divider { border:none;border-top:2px solid var(--guide-green-tint);margin:22px 0; }

        /* ── Back cover ──────────────────────────────────────── */
        .guide-back-cover { margin-top:40px;margin-bottom:32px;padding:28px 32px;background:var(--guide-green-tint);border-radius:10px;border:1px solid var(--guide-green-mid); }

        /* Section label */
        .guide-section-label { font-size:9.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--guide-green);margin-bottom:4px; }
        .guide-section-title { font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:var(--guide-fg-head);border-bottom:2px solid var(--guide-green-tint);padding-bottom:7px;margin-bottom:10px; }

        /* ── PRINT ───────────────────────────────────────────── */
        @media print {
          @page { size: A4 portrait; margin: 15mm 14mm; }
          body > * { display: none !important; }
          .book-guide-overlay { display: block !important; position: static !important; overflow: visible !important; background: #fff !important; }
          .book-guide-toolbar { display: none !important; }
          .book-guide-body { overflow: visible !important; padding: 0 !important; }
          .guide-chapter-banner, .guide-m-banner, .guide-cover { break-after: avoid; page-break-after: avoid; }
          .guide-screen-wrap { break-inside: avoid; page-break-inside: avoid; }
          .guide-cover { background: #047836 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-height: auto; }
          .guide-chapter-banner, .guide-m-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .guide-section-break { break-before: page; page-break-before: always; margin-top: 0 !important; }
        }
      `}</style>

      <div className="book-guide-overlay" role="dialog" aria-modal="true" aria-label="AWP COP Planning Guide">
        {/* Toolbar */}
        <div className="book-guide-toolbar no-print">
          <span className="book-guide-toolbar-title">AWP COP · Planning Guide</span>
          <div className="book-guide-toolbar-actions">
            <button
              className="book-guide-btn-pdf"
              onClick={() => window.print()}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Save as PDF
            </button>
            <button className="book-guide-btn-close" onClick={onClose} aria-label="Close guide">✕</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="book-guide-body">
          <div className="book-guide-inner">

            {/* ── Cover ── */}
            <div className="guide-cover">
              <div>
                <div className="guide-cover-eyebrow">Al-Watania Poultry · Central Operational Planning</div>
                <div className="guide-cover-title">AWP COP<br/>Planning Guide</div>
                <div className="guide-cover-sub">A complete visual reference for the Central Operational Planning system — demand modules, production pipeline, and processing plan.</div>
              </div>
              <div className="guide-cover-meta">
                <div className="guide-cover-logo">
                  <div className="guide-cover-logo-text">AWP COP</div>
                  <div className="guide-cover-logo-sub">Central Operational Planning</div>
                </div>
                <div className="guide-cover-version">Version 1.0 · August 2026</div>
              </div>
            </div>

            {/* ── TOC ── */}
            <ChapterBanner num="Contents" title="Table of Contents" desc="" />
            <div className="guide-toc-grid">
              <div className="guide-toc-section-head">Introduction</div>
              {[["01","Home Dashboard"],["02","Recommended Workflow"],["03","Assumptions Configuration"]].map(([b,n])=>(
                <div key={b} className="guide-toc-item"><span className="guide-toc-badge" style={{background:"var(--guide-green)"}}>{b}</span><span>{n}</span></div>
              ))}
              <div className="guide-toc-section-head">COP Modules</div>
              {[["M1","Demand Plan"],["M2","Supply Requirements"],["M3","Reconciliation"],["M4","Demand-Driven Placement"],["M5","COP Report"]].map(([b,n])=>(
                <div key={b} className="guide-toc-item"><span className="guide-toc-badge" style={{background:"var(--guide-amber)"}}>{b}</span><span>{n}</span></div>
              ))}
              <div className="guide-toc-section-head">Processing Plan</div>
              {[["PP","Carcass Requirement"],["BI","Broiler Intake Plan"],["WC","Whole Carcass Balance"]].map(([b,n])=>(
                <div key={b} className="guide-toc-item"><span className="guide-toc-badge" style={{background:"var(--guide-navy)"}}>{b}</span><span>{n}</span></div>
              ))}
              <div className="guide-toc-section-head">Production Pipeline</div>
              {[["ST","Short-Term Planning"],["S1","Catching Plan"],["S2","Live Bird Forecast"],["S3","Carcass Yield & Grade Split"],["S4","Product Family Allocation"],["S5","FPP Cut Plan"],["S6","Processing Plan by Plant"],["S7","Farm Distribution"]].map(([b,n])=>(
                <div key={b} className="guide-toc-item"><span className="guide-toc-badge" style={{background:"var(--guide-green)"}}>{b}</span><span>{n}</span></div>
              ))}
              <div className="guide-toc-section-head">Other Modules & Tools</div>
              {[["🔺","Breeding Cycle"],["⇄","Saved Plans & Scenarios"],["BOM","Product BOM"]].map(([b,n])=>(
                <div key={b} className="guide-toc-item"><span className="guide-toc-badge" style={{background:"var(--guide-navy)",fontSize:10}}>{b}</span><span>{n}</span></div>
              ))}
            </div>

            {/* ── Ch 1 — Home ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 1" title="Home Dashboard" desc="The landing page — KPI summary, monthly overview, and quick access to all modules." />
              <Screen src="/guide-screens/01-home.jpg" alt="Home Dashboard" caption="Home Dashboard — KPI cards, monthly overview table, and COP Modules quick-access panel" />
              <p className="guide-p">The Home Dashboard shows the current plan state at a glance. KPI cards display total chicks placed, slaughtered birds, carcass weight, production kg, total demand, and weeks over capacity — all drawn live from the active plan.</p>
              <p className="guide-p">The <strong>Monthly Overview</strong> table aggregates the pipeline by month. The <strong>COP Modules</strong> section provides direct click-through to each module. The top toolbar gives access to <strong>Save Plan</strong>, <strong>Export Excel</strong>, <strong>Export Summary PDF</strong>, and <strong>Assumptions</strong> from any screen.</p>
              <TwoCol>
                <InfoCard title="Navigation — Sidebar">
                  <p className="guide-p" style={{fontSize:13}}>The left sidebar organises all modules by group: <strong>COP Modules</strong> (M1–M5), <strong>Processing Plan</strong> (PP, BI, WC), <strong>Production Pipeline</strong> (ST, Steps 1–7), <strong>Breeding Cycle</strong>, <strong>Tools</strong>, and <strong>Master Data</strong>. Collapse the sidebar with the ‹ tab on its right edge to gain screen width.</p>
                </InfoCard>
                <InfoCard title="Recommended First Steps">
                  <Steps items={[
                    "Open <strong>Assumptions</strong> (top toolbar) and configure your plan parameters.",
                    "Enter demand in <strong>M1 Demand Plan</strong>.",
                    "Build the placement calendar in <strong>Step 1</strong> or use <strong>M4</strong> to auto-populate it.",
                  ]} />
                </InfoCard>
              </TwoCol>
            </div>

            {/* ── Ch 2 — Workflow ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 2" title="Recommended Workflow" desc="Follow this sequence for a complete COP planning cycle." />
              <p className="guide-p">AWP COP has two parallel tracks. The <strong>COP Modules track (M1–M5)</strong> handles demand. The <strong>Production Pipeline track (Steps 1–7)</strong> handles supply. Both tracks recalculate live.</p>
              <div className="guide-flow-row">
                {[
                  ["Assumptions","Set parameters"],["M1 Demand Plan","Enter demand"],["Step 1 Placement","Build calendar"],
                  ["M2 Supply Req.","Review gaps"],["M3 Reconcile","Confirm balance"],["M4 Apply DDP","Write to calendar"],
                  ["M5 COP Report","Review & export"],["Step 7 Farms","SAP MEQ1 export"],
                ].map(([label, sub], i, arr) => (
                  <div key={label} style={{display:"flex",alignItems:"center",gap:6}}>
                    <div className="guide-flow-step"><div className="guide-flow-label">{label}</div><div className="guide-flow-sub">{sub}</div></div>
                    {i < arr.length - 1 && <span className="guide-flow-arrow">›</span>}
                  </div>
                ))}
              </div>
              <Note>You can use the Production Pipeline independently — enter placement quantities and see plant output without entering any demand data.</Note>
            </div>

            {/* ── Ch 3 — Assumptions ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 3" title="Assumptions Configuration" desc="Open Assumptions from the top toolbar before anything else. Every pipeline calculation depends on these values." />
              <Screen src="/guide-screens/02-assumptions.jpg" alt="Assumptions Panel" caption="Assumptions panel — slide-in drawer accessible from the top-right toolbar on every screen" />
              <ParamTable rows={[
                ["Plan Start Date","The Monday of Week 1. All YYYY.MMM.Wk week labels derive from this."],
                ["Planning Horizon","Number of months in the plan (default 4). Displayed as a calendar range wherever the horizon appears."],
                ["House Count","Houses placing chicks per eligible working day."],
                ["Cycle Length (days)","Grow-out cycle. Sets the harvest-to-placement week offset used everywhere."],
                ["Mortality / DOA / Culled / Reject","Attrition rates applied in the Harvest & Slaughter Losses section of Step 2."],
                ["Avg Carcass Weight (kg)","Used by size-distribution and supply calculations."],
                ["Grade Split A / B / C","% of carcass weight per grade — must sum to 100%."],
                ["Carcass Size Distribution","Eleven weight-class buckets (500g – 1500g) — must sum to 100%."],
                ["Product Family Allocation","Per grade: % of carcass to WC Fresh / WC Frozen / Cuts."],
                ["Cuts → FPP Routing","Per cut: % routed into FPP production (e.g. Trim/Mince 100%, Boneless Breast 30%)."],
                ["Opening Balance (frozen)","Frozen WC stock on hand at start of Week 1 (kg). Feeds the Frozen Stock Balance in M3."],
                ["Plant Shares & Capacities","Allocation % and daily bird limits for Plants 1, 2, and 3."],
                ["Friday Off","When on, Friday placement and harvest days are zeroed automatically."],
              ]} />
            </div>

            {/* ── M1 ── */}
            <div className="guide-section-break">
              <MBanner badge="M1" badgeColor="#996600" label="COP Modules" title="M1 · Demand Plan" sub="Weekly demand by product × sales channel" />
              <Screen src="/guide-screens/03-m1-demand-plan.jpg" alt="M1 Demand Plan" caption="M1 Demand Plan — channel tabs, weekly demand grid, and revenue KPI cards" />
              <p className="guide-p">Enter how much of each product each sales channel will sell, week by week. M1 drives all downstream COP modules. Products cover Whole Chicken (by weight bucket, Grade A/B, Fresh/Frozen), Cuts, FPP, and Eggs. Channels include DIST, EXPO, FOOD, MODT, SIST, TRAD, WHOL, and ECOM.</p>
              <Steps items={[
                "Select a channel tab (or stay on <em>All</em> for a combined view).",
                "Click any cell and type the quantity — tons for meat, trays for eggs.",
                "Use <strong>Copy Week Forward</strong> to propagate a week's values across remaining weeks.",
                "Use <strong>% Adjust</strong> to apply a percentage change across a product or date range.",
                "Click <strong>💰 Prices</strong> to set a selling price per product — Revenue KPIs appear automatically.",
              ]} />
              <Tip><strong>SAP Import:</strong> Click <em>Import Sales Plan</em> to upload a SAP export (.xlsx/.csv). Map each row type to a catalog product and each channel value to a channel key. Mappings are saved for future imports.</Tip>
            </div>

            {/* ── M2 ── */}
            <div className="guide-section-break">
              <MBanner badge="M2" badgeColor="#996600" label="COP Modules" title="M2 · Supply Requirements" sub="Reverse BOM: demand → carcass → chicks to place" />
              <Screen src="/guide-screens/04-m2-supply-req.jpg" alt="M2 Supply Requirements" caption="M2 Supply Requirements — color-coded deficit/tight/surplus table and harvest deferral panel" />
              <p className="guide-p">M2 reverse-engineers required carcass kg, harvestable birds, and chicks-to-place per week from M1 demand. Rows are color-coded: <strong style={{color:"#b91c1c"}}>red = deficit</strong> (&gt;2% below required), <strong style={{color:"#996600"}}>amber = tight</strong> (within 5%), <strong style={{color:"#047836"}}>green = surplus</strong> (&gt;5% above).</p>
              <p className="guide-p">When deficit weeks are detected, a <strong>✦ Suggest Deferrals</strong> button appears — it calculates optimal birds to shift from surplus to deficit weeks. Use the amber <em>Defer →</em> column to enter or fine-tune the bird count to shift. This is a simulation overlay only — the base plan is not modified.</p>
            </div>

            {/* ── M3 ── */}
            <div className="guide-section-break">
              <MBanner badge="M3" badgeColor="#996600" label="COP Modules" title="M3 · Reconciliation" sub="Demand vs supply gap · align the sales plan to production" />
              <Screen src="/guide-screens/05-m3-reconciliation.jpg" alt="M3 Reconciliation" caption="M3 Reconciliation — demand vs pipeline supply, frozen stock balance, and KPI cards" />
              <p className="guide-p">Side-by-side weekly view of total demand (M1) against total planned supply (pipeline). The <strong>⚖ Align Sales Plan to Production</strong> button scales demand down pro-rata wherever demand exceeds plant output, preserving channel shares.</p>
              <p className="guide-p">The <strong>Frozen Stock Balance</strong> table shows: opening stock + frozen production − frozen WC demand = closing stock per week (red when negative).</p>
            </div>

            {/* ── M4 ── */}
            <div className="guide-section-break">
              <MBanner badge="M4" badgeColor="#996600" label="COP Modules" title="M4 · Demand-Driven Placement" sub="Translate demand requirements into a placement calendar" />
              <Screen src="/guide-screens/06-m4-ddp.jpg" alt="M4 DDP" caption="M4 Demand-Driven Placement — required houses per week vs current capacity, with Apply button" />
              <p className="guide-p">M4 closes the COP loop. It calculates required houses per day per placement week to fulfil M1 demand, then writes those numbers directly into the Step 1 Catching Plan.</p>
              <Steps items={[
                "Review the <strong>Placement Week Preview</strong> — current vs required houses/day, over-capacity weeks flagged in red.",
                "If over-capacity: raise house count in Assumptions or reduce demand in M1.",
                "Click <strong>Apply to Placement Plan</strong> to write the values to Step 1.",
              ]} />
              <Tip>Weeks with no demand are set to zero on apply — not carried over from prior quick-fill values.</Tip>
            </div>

            {/* ── M5 ── */}
            <div className="guide-section-break">
              <MBanner badge="M5" badgeColor="#996600" label="COP Modules" title="M5 · COP Report" sub="Traffic-light weekly review for COP meetings" />
              <Screen src="/guide-screens/07-m5-cop-report.jpg" alt="M5 COP Report" caption="M5 COP Report — board-ready traffic-light summary with deficit/tight/surplus weeks highlighted" />
              <p className="guide-p">Board-ready summary generated automatically from the plan. Deficit weeks appear in red, tight weeks in amber. Shows supply vs demand totals, plant capacity utilisation, and a placement action list. Export directly as PDF via <strong>Export Summary PDF</strong> in the top toolbar.</p>
            </div>

            {/* ── PP ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 5 · Processing Plan" title="PP · Carcass Requirement" desc="Grade-pool demand by plant and week, translated from the Demand Plan." />
              <Screen src="/guide-screens/08-pp-carcass.jpg" alt="PP Carcass Requirement" caption="PP Carcass Requirement — grade pools 930–933 broken down by plant (P1/P2/P3) and ISO week" />
              <p className="guide-p">Translates M1 Demand Plan into carcass KG requirements per grade pool per plant per ISO week. Grade pools: <strong>930</strong> (Fresh A-Grade WC + fresh cuts), <strong>931</strong> (Frozen A-Grade WC), <strong>932</strong> (B-Grade WC + frozen cuts), <strong>933</strong> (FPP). Click any cell to see the per-product breakdown; the popup has an ↓ Export button.</p>
              <Note>The Processing Plan always reads from the Demand Plan catalog. An imported SAP sales plan feeds M3 reconciliation only — it does not override the carcass requirement shown here.</Note>
            </div>

            {/* ── BI ── */}
            <div className="guide-section-break">
              <MBanner badge="BI" badgeColor="#0b1e30" label="Processing Plan" title="BI · Broiler Intake Plan" sub="Pipeline supply vs processing demand — by plant × week" />
              <Screen src="/guide-screens/09-bi-broiler-intake.jpg" alt="Broiler Intake Plan" caption="BI Broiler Intake Plan — required vs available carcass KG/birds per plant per week, with coverage badges" />
              <p className="guide-p">Central supply-demand matching view. Shows required carcass KG and birds (from Demand Plan) alongside available KG and birds (from Placement Pipeline) per plant per week. Coverage badge: ✓ green ≥100%, amber 80–99%, red &lt;80%.</p>
              <Bullets items={[
                "Click any <em>Required</em> cell to see the per-grade-pool SKU breakdown.",
                "Click any <em>Pipeline</em> birds cell to see the per-size-bucket breakdown.",
                "When coverage is red → go to Step 1 and increase houses/day, or use M4 automatically.",
                "<strong>Export Excel</strong> — full plant × week table with KG/birds/gap/coverage.",
              ]} />
            </div>

            {/* ── WC ── */}
            <div className="guide-section-break">
              <MBanner badge="WC" badgeColor="#0b1e30" label="Processing Plan" title="WC · Whole Carcass Balance" sub="WC production vs demand reconciliation by weight class" />
              <Screen src="/guide-screens/10-wc-balance.jpg" alt="Whole Carcass Balance" caption="WC Whole Carcass Balance — WC production vs demand surplus/deficit by weight class and week" />
              <p className="guide-p">Shows the surplus or deficit of whole carcass production relative to demand for each weight class each week. Use this view to identify which size buckets are over- or under-supplied, and adjust the Carcass Size Distribution in Assumptions accordingly.</p>
            </div>

            {/* ── ST ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 6 · Production Pipeline" title="ST · Short-Term Planning" desc="Catching plan — week-level operational execution view." />
              <Screen src="/guide-screens/11-st-short-term.jpg" alt="Short-Term Planning" caption="Short-Term Planning — catching schedule with daily detail and operational parameters" />
              <p className="guide-p">The Short-Term Planning module provides a near-term operational view of catching activity at daily resolution, helping field teams coordinate catching operations with the placement calendar.</p>
            </div>

            {/* ── Step 1 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 1" badgeColor="#047836" label="Production Pipeline" title="Step 1 · Catching Plan" sub="Day-by-day chick placement calendar — the primary supply input" />
              <Screen src="/guide-screens/13-step1-catching.jpg" alt="Step 1 Catching Plan" caption="Step 1 Catching Plan — daily placement calendar with Quick Fill and Apply from M4" />
              <p className="guide-p">The Catching Plan is the foundation of the Production Pipeline. Every downstream step recomputes automatically from this calendar.</p>
              <Bullets items={[
                "<strong>Quick Fill</strong> — fills all working days at the flat rate from Assumptions.",
                "<strong>Manual editing</strong> — click any cell to override. Friday rows are auto-zeroed when Friday Off is on.",
                "<strong>Apply from M4</strong> — demand-driven placement writes directly into this calendar.",
                "<strong>Delete Plan</strong> — clears all quantities to zero (requires confirmation).",
              ]} />
            </div>

            {/* ── Step 2 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 2" badgeColor="#047836" label="Production Pipeline" title="Step 2 · Live Bird Forecast & Harvest Yield" sub="Harvest projections and slaughter losses by week" />
              <Screen src="/guide-screens/14-step2-livebird.jpg" alt="Step 2 Live Bird Forecast" caption="Step 2 Live Bird Forecast — full weekly pipeline from placed birds through to carcass weight" />
              <p className="guide-p">Auto-computed from the placement calendar. Shows the complete weekly pipeline: <strong>Placed → Harvestable → Dispatched → Electronic Count → Slaughtered → Carcass Weight</strong>. The Harvest &amp; Slaughter Losses section summarises where birds are lost between catching and carcass. Weeks exceeding plant capacity are flagged in red.</p>
            </div>

            {/* ── Step 3 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 3" badgeColor="#047836" label="Production Pipeline" title="Step 3 · Carcass Yield & Grade Split" sub="Carcass weight by grade and weight class" />
              <Screen src="/guide-screens/15-step3-carcass.jpg" alt="Step 3 Carcass Yield" caption="Step 3 Carcass Yield — Grade A/B/C split and carcass size distribution (Total / By Week / By Month)" />
              <p className="guide-p">Weekly carcass weight split into Grade A, B, and C (editable % on screen). The Carcass Size Distribution table offers three views: <strong>Total</strong> (horizon totals with editable distribution %), <strong>By Week</strong> (size rows × week columns), and <strong>By Month</strong> (weeks aggregated into calendar months).</p>
            </div>

            {/* ── Step 4 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 4" badgeColor="#047836" label="Production Pipeline" title="Step 4 · Product Family Allocation" sub="WC Fresh / WC Frozen / Cuts split by grade" />
              <Screen src="/guide-screens/16-step4-family.jpg" alt="Step 4 Product Family" caption="Step 4 Product Family Allocation — Fresh/Frozen/Cuts split per grade with donut chart" />
              <p className="guide-p">Allocates each grade&apos;s carcass to WC Fresh, WC Frozen, and Cuts based on the family allocation % in Assumptions. Grade C flows entirely to the cutting line. FPP is produced from cuts in Step 5. KPI cards show the average Fresh/Frozen share; a donut chart shows the horizon-level balance.</p>
            </div>

            {/* ── Step 5 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 5" badgeColor="#047836" label="Production Pipeline" title="Step 5 · FPP Cut Plan" sub="Cuts by type, then FPP produced from cuts" />
              <Screen src="/guide-screens/17-step5-cuts.jpg" alt="Step 5 Cut Plan" caption="Step 5 FPP Cut Plan — 9 cut types with FPP routing column and net saleable cuts" />
              <p className="guide-p">Applies cut yields (from Assumptions) to the Cuts volume from Step 4. Covers 9 cut types: breast, boneless breast, whole leg, drumstick, thigh, wings, back/neck, giblets, and trim/mince. A configurable share of each cut is routed into FPP production.</p>
            </div>

            {/* ── Step 6 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 6" badgeColor="#047836" label="Production Pipeline" title="Step 6 · Processing Plan by Plant" sub="Volume allocated across Plants 1, 2, and 3" />
              <Screen src="/guide-screens/18-step6-plant.jpg" alt="Step 6 Processing by Plant" caption="Step 6 Processing Plan — birds, carcass kg, and product family output per plant per week" />
              <p className="guide-p">Distributes carcass volume to each plant per their share % and daily capacity limits (from Assumptions). Shows birds, carcass kg, and product family output per plant per week. Over-capacity weeks are flagged in red — adjust plant shares or raise daily capacity limits in Assumptions to resolve.</p>
            </div>

            {/* ── Step 7 ── */}
            <div className="guide-section-break">
              <MBanner badge="Step 7" badgeColor="#047836" label="Production Pipeline" title="Step 7 · Farm Distribution by Cycle" sub="Assign weekly chick quotas to farms — SAP MEQ1 export" />
              <Screen src="/guide-screens/19-step7-farms.jpg" alt="Step 7 Farm Distribution" caption="Step 7 Farm Distribution — quota per farm per week with SAP MEQ1 Excel, TXT, and Farm Master export buttons" />
              <p className="guide-p">Distributes weekly placement totals across the farm roster in rotation order, respecting each farm&apos;s capacity ceiling. The output mirrors the SAP MEQ1 format. The <strong>Farm Master</strong> is fully editable here — farm code (VERID), sequence, capacity, cycle length, and a <em>Skip This Cycle</em> flag.</p>
              <Note><strong>Export options from Step 7:</strong> SAP MEQ1 Excel (for system upload), SAP MEQ1 TXT (plain-text format), and Farm Master Excel (roster archive).</Note>
            </div>

            {/* ── Breeding Cycle ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 7" title="Breeding Cycle" desc="GP → PS → Broiler DOC backward demand chain." />
              <Screen src="/guide-screens/12-breeding-cycle.jpg" alt="Breeding Cycle" caption="Biological Chain — 7-step backward demand calculation, GP flock fleet, and egg supply-vs-demand gap chart" />
              <p className="guide-p">The Biological Chain module traces the full upstream supply pyramid backward from your catching plan. Enter the catching volume and the system computes — step by step — the exact PS DOC placements, PS hatchery requirements, and GP rearing DOC needed to meet it.</p>

              <TwoCol>
                <InfoCard title="7-Step Backward Chain">
                  <Steps items={[
                    "<strong>Step 1 — AWP Broiler DOC:</strong> catching plan ÷ (1 − 5% mortality) = DOC placed 4 weeks before catching.",
                    "<strong>Step 2 — AWP Hatchery:</strong> broiler DOC ÷ (1 − 2% cull) ÷ 84% hatchability = PS settable eggs set 3 weeks prior.",
                    "<strong>Step 3 — PS Laying Hens:</strong> settable eggs ÷ 87% settable ratio = total eggs ÷ avg HDP curve × 7.",
                    "<strong>Step 4 — PS Rearing DOC:</strong> cohort logic; total DOC = female DOC ÷ 92% survival ÷ 90% female fraction.",
                    "<strong>Step 5 — GP Hatchery:</strong> PS DOC ÷ 80% GP proportion → GP eggs set = total hatch ÷ 80% GP hatchability.",
                    "<strong>Step 6 — GP Laying Hens:</strong> GP settable eggs ÷ 85% settable ratio = total eggs ÷ avg GP HDP × 7.",
                    "<strong>Step 7 — GP Rearing DOC:</strong> cohort logic; total GP DOC = female DOC ÷ 86% GP survival.",
                  ]} />
                </InfoCard>
                <InfoCard title="Confirmed Biological Parameters">
                  <Steps items={[
                    "<strong>PS lay-start age:</strong> 25 weeks · depop: 64 wks · laying period: 40 wks",
                    "<strong>PS rearing mortality:</strong> 8% · male ratio: 10% (9:1 F:M, Cobb 500)",
                    "<strong>PS settable ratio:</strong> 87% of total eggs to hatchery",
                    "<strong>PS hatchability (AWP):</strong> 84% · incubation: 3 wks · cull: 2%",
                    "<strong>GP lay-start age:</strong> 24 weeks · depop: 60 wks · laying period: 36 wks",
                    "<strong>GP rearing mortality:</strong> 14% · GP settable ratio: 85%",
                    "<strong>GP hatchability:</strong> 80% · self-replacement: 20% of total GP hatch",
                    "<strong>Broiler grow-out:</strong> 4 weeks (25.5 days)",
                  ]} />
                </InfoCard>
              </TwoCol>

              <InfoCard title="Production Curves — HDP by Age">
                <p className="guide-p" style={{fontSize:13}}>Both PS and GP use 3-segment Hen-Day Production (HDP) curves — a linear ramp-up phase, a flat peak, and a linear decline to depopulation. HDP = fraction of active hens laying one egg per day (total eggs; settable ratio applied separately).</p>
                <TwoCol>
                  <div>
                    <p className="guide-p" style={{fontSize:12,fontWeight:700,marginBottom:4}}>PS Production Curve</p>
                    <Steps items={[
                      "Ages 25–29: ramp from 40% → 83% HDP",
                      "Ages 30–35: peak at 85% HDP",
                      "Ages 36–64: decline from 84% → 47% HDP",
                      "Weighted average ≈ 69% (backward chain uses this)",
                    ]} />
                  </div>
                  <div>
                    <p className="guide-p" style={{fontSize:12,fontWeight:700,marginBottom:4}}>GP Production Curve</p>
                    <Steps items={[
                      "Ages 24–29: ramp from 35% → 79% HDP",
                      "Ages 30–34: peak at 81% HDP",
                      "Ages 35–60: decline from 80% → 42% HDP",
                      "Weighted average ≈ 65% (backward chain uses this)",
                    ]} />
                  </div>
                </TwoCol>
                <Note><strong>These curves are industry benchmarks.</strong> Update them in the Biological Chain Assumptions panel once AWP and the GP company confirm actual flock performance records from their farm management systems. The backward chain uses the weighted average HDP; the GP Flock Fleet forward supply calculation uses the curve per age-week for precision.</Note>
              </InfoCard>

              <InfoCard title="GP Flock Fleet Register">
                <p className="guide-p" style={{fontSize:13}}>The GP Flock Fleet Register lists every active and planned GP flock. Each row shows flock name, placement week, current age, status (Future / Rearing / Laying / Completed), and projected weekly settable egg supply. Inline editing lets you adjust flock counts or placement weeks directly in the table.</p>
                <p className="guide-p" style={{fontSize:13}}>The <strong>Supply vs Demand Gap chart</strong> below the table compares the fleet&apos;s forward egg supply (calculated week-by-week from each flock&apos;s age and production curve) against the backward chain&apos;s weekly egg demand. A persistent red gap means additional GP capacity is needed before that horizon.</p>
              </InfoCard>

              <Note><strong>KPI Summary Bar</strong> — the strip above the chain tables shows total PS DOC required, GP DOC required, total GP settable eggs demanded, and the plan horizon. These update live as you adjust any assumption in the Assumptions panel.</Note>
              <Note><strong>Inline cell overrides</strong> — each stage table supports direct cell editing. Click any value in a data row to override it; the cell turns amber to indicate a manual override. Clear it to revert to the calculated value. Overrides are useful for confirming a specific flock count or egg target when farm commitments are already fixed.</Note>
            </div>

            {/* ── Saved Plans + BOM ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 8" title="Tools — Saved Plans & Product BOM" desc="Plan snapshots for scenario comparison, and the SKU-level bill of materials." />

              <div className="guide-section-label">⇄ Saved Plans</div>
              <div className="guide-section-title">Scenarios — save and compare plan snapshots</div>
              <Screen src="/guide-screens/20-saved-plans.jpg" alt="Saved Plans" caption="Saved Plans — named plan snapshots for side-by-side KPI comparison" />
              <p className="guide-p">Save named snapshots of the current plan (parameters + placement calendar) and compare KPIs side by side before committing to a placement strategy. Scenarios are stored in the browser — <strong>export an Excel file as a durable backup</strong> before clearing browser data.</p>

              <hr className="guide-divider" />

              <div className="guide-section-label">BOM · Master Data</div>
              <div className="guide-section-title">Product BOM — SKU-level bill of materials</div>
              <Screen src="/guide-screens/21-product-bom.jpg" alt="Product BOM" caption="Product BOM — SKU records linking each product to its grade pool, package weight, and units per carton" />
              <p className="guide-p">Each BOM record maps one SKU to its grade pool (930/931/932/933), package weight (kg), units per carton, and plant. The Broiler Intake Plan uses the BOM to convert carton orders into required birds. Load the BOM via <strong>Import BOM from SAP Excel</strong> or add rows inline.</p>
            </div>

            {/* ── Export chapter ── */}
            <div className="guide-section-break">
              <ChapterBanner num="Chapter 9" title="Export Options" desc="Excel workbooks, SAP files, and PDF summaries available across the system." />
              <TwoCol>
                <InfoCard title="From the Top Toolbar">
                  <Bullets items={[
                    "<strong>Export Excel</strong> — multi-sheet workbook: placement, live bird, carcass, size distribution, product family, cut plan, plant breakdown, and demand plan.",
                    "<strong>Export Summary PDF</strong> — print-ready COP summary generated from M5 for management review.",
                  ]} />
                </InfoCard>
                <InfoCard title="From Individual Modules">
                  <Bullets items={[
                    "<strong>Step 7:</strong> SAP MEQ1 Excel, MEQ1 TXT, Farm Master Excel.",
                    "<strong>PP popup:</strong> ↓ Export per-product breakdown as Excel.",
                    "<strong>BI:</strong> Full plant × week supply-demand table as Excel.",
                    "<strong>BOM:</strong> Export current BOM as Excel.",
                  ]} />
                </InfoCard>
              </TwoCol>

              <div className="guide-back-cover">
                <div className="guide-section-label">Al-Watania Poultry · Central Operational Planning</div>
                <div style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:20,fontWeight:700,margin:"8px 0"}}>AWP COP Planning Guide</div>
                <p className="guide-p" style={{fontSize:12,color:"var(--guide-fg-muted)",maxWidth:500}}>For questions or support, contact your COP system administrator. The system supports both English and Arabic — use the EN/AR toggle in the in-app User Guide for bilingual reference.</p>
                <div style={{marginTop:12,fontSize:11,color:"var(--guide-fg-muted)"}}>Version 1.0 · August 2026 · Confidential — internal use only</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
