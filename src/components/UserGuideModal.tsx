"use client";

import { useState } from "react";

type Lang = "en" | "ar";

interface Props {
  onClose: () => void;
}

// ─── Content ────────────────────────────────────────────────────────────────

const T = {
  en: {
    eyebrow: "Al-Watania Poultry · Central Operations Planning",
    title: "AWP COP — Planning Guide",
    langLabel: "EN",
    altLangLabel: "AR",

    sections: {
      intro: {
        label: "Introduction",
        title: "What this tool does",
        body: [
          "AWP COP (Central Operations Planning) is a demand-first planning tool. Start from what the market needs — by product, channel, and week — and the system works backward to tell you how many chicks to place, then forward to show exactly what comes out of the plant.",
          "The tool has two parallel tracks: <strong>COP Modules (M1–M5)</strong> for the demand side — capture demand, reverse-engineer supply needs, identify gaps, and write placements into the calendar — and the <strong>Production Pipeline (Steps 1–7)</strong> for the supply side — build a placement calendar and follow the bird from chick-in to carcass, grades, cuts, and plant allocations. All calculations update live; there is no recalculate button.",
        ],
      },
      workflow: {
        label: "Getting Started",
        title: "Recommended workflow",
        intro: "Follow this sequence for a complete COP cycle.",
        steps: [
          { label: "Assumptions", sub: "Set parameters" },
          { label: "M1 Demand Plan", sub: "Enter demand" },
          { label: "Step 1 Placement", sub: "Build calendar" },
          { label: "M2 Supply Req.", sub: "Review gaps" },
          { label: "M3 Reconcile", sub: "Confirm balance" },
          { label: "M4 Apply DDP", sub: "Write to calendar" },
          { label: "M5 COP Report", sub: "Review & export" },
          { label: "Step 7 Quotas", sub: "SAP MEQ1 export" },
        ],
        note: "You can use the Production Pipeline independently without entering demand — to model a placement scenario and see its plant-level output.",
      },
      assumptions: {
        label: "Configuration",
        title: "Assumptions panel",
        intro: "Open <strong>Assumptions</strong> (top-right toolbar) before doing anything else. All pipeline calculations depend on these values.",
        params: [
          ["Plan Start Date", "The Monday of Week 1. All YYYY.MMM.Wk week labels derive from this."],
          ["Planning Horizon", "Number of months in the plan (default 4). Displayed as a calendar range (e.g. Aug 2026 – Nov 2026) wherever the horizon appears."],
          ["House Count", "Houses placing chicks per eligible working day."],
          ["Cycle Length (days)", "Grow-out cycle. Sets the harvest-to-placement week offset used everywhere."],
          ["Mortality / DOA / Culled / Reject rates", "Attrition rates applied in the Harvest & Slaughter Losses section of Step 2."],
          ["Avg Carcass Weight (kg)", "Used by size-distribution and supply calculations."],
          ["Grade Split A / B / C", "% of carcass weight per grade — must sum to 100%."],
          ["Carcass Size Distribution", "Eleven weight-class buckets (500g–1500g) — must sum to 100%."],
          ["Product Family Allocation", "Per grade: % of carcass to WC Fresh / WC Frozen / Cuts. FPP is no longer allocated directly — it is produced from cuts."],
          ["Cuts → FPP Routing", "Per cut: % of that cut's output routed into FPP production (e.g. Trim/Mince 100%, Boneless Breast 30%). The rest is sold as cuts."],
          ["Opening balance (frozen)", "Frozen WC stock on hand at the start of Week 1 (kg). Feeds the Frozen Stock Balance in M3 Reconciliation."],
          ["Plant Shares & Capacities", "Allocation % and daily bird limits for Plants 1–3."],
          ["Friday Off", "When on, Friday placement and harvest days are zeroed automatically."],
        ] as [string, string][],
      },
      m1: {
        label: "COP Modules",
        badge: "M1",
        title: "M1 · Demand Plan",
        subtitle: "Weekly demand by product × sales channel",
        body: "Enter how much of each product each channel will sell, week by week. This drives all downstream COP modules.",
        products: "Products: Whole Chicken (by weight bucket, Grade A/B, Fresh/Frozen), Cuts, FPP (with yield %), and Eggs (in trays).",
        channels: "Channels: DIST, EXPO, FOOD, MODT, SIST, TRAD, WHOL, ECOM — select the tab or use All for a combined view.",
        steps: [
          "Open M1 from the sidebar or the Home dashboard.",
          "Select a channel tab.",
          "Click any cell and type the quantity (tons for meat, trays for eggs).",
          "Use <strong>Copy Week Forward</strong> to propagate a week across remaining weeks.",
          "Use <strong>% Adjust</strong> to apply a % change across a product or date range.",
          "<strong>💰 Prices</strong> — set a selling price per product (SAR per ton; eggs per tray). Once any price is set, the Revenue KPI card, a Revenue by Channel summary, and a Revenue column on the Home dashboard's channel table appear automatically.",
          "<strong>Delete Plan</strong> — clears all demand quantities to zero (requires confirmation). Use to reset demand without changing the product catalog or parameters.",
        ],
        tip: "<strong>Import from SAP:</strong> click Import Sales Plan to upload a SAP export (.xlsx / .csv). The panel shows each row's Material Code, description, Weight of Carton, GSV CAR, and GSV UoM so you can verify before applying. Map each row type to a catalog product and each Channels value to a channel key. The week alignment table shows calendar labels (e.g. Aug W1) for both plan weeks and file weeks. Mappings are saved for future imports. On Apply, product selling prices are derived automatically from the file's <strong>Gross Sales Value (SAR)</strong> column (Σ value ÷ Σ quantity per product) and written into the Prices panel.",
      },
      m2: {
        label: "COP Modules",
        badge: "M2",
        title: "M2 · Supply Requirements",
        subtitle: "Reverse BOM: demand → carcass → chicks to place",
        body: "Reverse-engineers required carcass kg, harvestable birds, and chicks per week from your M1 demand. Rows are color-coded: red = deficit (>2% below required), amber = tight (within 5%), green = surplus (>5% above).",
        note: "The 'Place in Wk' column shows the placement week = harvest week minus the grow-out offset. Weeks mapping before the plan start show as pre-plan and must be placed manually.",
        deferralTitle: "Harvest Deferral (execution adjustment)",
        deferralBody: "When deficit weeks are detected, a <strong>✦ Suggest Deferrals</strong> button appears automatically — click it to let the system calculate the optimal birds to shift from each surplus week into its adjacent deficit week using a greedy algorithm. Review and fine-tune the suggested values manually if needed. Use the amber <strong>Defer → (birds)</strong> column to enter or adjust the number of birds to shift from Week N to Week N+1; the <strong>Adj. Carcass</strong> and <strong>Adj. Gap</strong> columns update immediately to show the impact. This is a simulation overlay — the base plan and pipeline are not modified. When deferrals are active, an amber banner shows the total birds shifted with a <strong>↻ Re-suggest</strong> button (recalculates from scratch) and a <strong>Clear All</strong> button. Typical use: a catching day has birds at 25.5 weeks age but demand is low that week — defer to the following week rather than harvesting early.",
      },
      m3: {
        label: "COP Modules",
        badge: "M3",
        title: "M3 · Reconciliation",
        subtitle: "Demand vs supply gap · align the sales plan to production",
        body: "Side-by-side weekly view of total demand (M1) against total planned supply (pipeline). Gaps shown in kg and %. Week labels use YYYY.MMM.Wk format to immediately show which calendar month each week belongs to. Production is the anchor: the <strong>⚖️ Align Sales Plan to Production</strong> button scales demand cells down pro-rata (per category × week) wherever demand exceeds what the plants deliver — channel shares are preserved, and surplus weeks are left untouched. The page also shows a <strong>Frozen Stock Balance</strong> table (opening + frozen production − frozen WC demand = closing, per week, red when negative) plus KPI cards for opening/ending frozen stock, stock-out weeks, and the average Fresh/Frozen production split.",
      },
      m4: {
        label: "COP Modules",
        badge: "M4",
        title: "M4 · Demand-Driven Placement",
        subtitle: "Translate demand requirements into a placement calendar",
        body: "Closes the COP loop. Calculates required houses per day per placement week to fulfil M1 demand, then writes those numbers directly into the Step 1 Placement Plan.",
        steps: [
          "Review the <strong>Placement Week Preview</strong> table — current vs required houses/day, flagging over-capacity weeks.",
          "If over-capacity: raise house count in Assumptions or reduce demand in M1.",
          "Click <strong>Apply to Placement Plan</strong> to write the values to Step 1.",
        ],
        tip: "Placement weeks with <strong>no demand</strong> are set to zero on apply — not carried over from prior quick-fill values. Only weeks with actual demand get populated.",
      },
      m5: {
        label: "COP Modules",
        badge: "M5",
        title: "M5 · COP Report",
        subtitle: "Traffic-light weekly review for COP meetings",
        body: "Board-ready summary: deficit and tight weeks highlighted in red and amber, supply vs demand totals, capacity utilization, and a placement action list. Export directly as PDF via Export Summary PDF in the top toolbar.",
      },
      step1: {
        label: "Production Pipeline",
        badge: "Step 1",
        title: "Step 1 · Placement Plan",
        subtitle: "Day-by-day chick placement calendar",
        body: "The primary supply-side input. Set houses placing and chicks per house per day — all downstream steps recompute from this calendar.",
        items: [
          "<strong>Quick Fill</strong> — fills working days at a flat rate from your Assumptions.",
          "<strong>Manual editing</strong> — click any cell to override. Friday rows are auto-zeroed when Friday Off is on.",
          "<strong>Apply from M4</strong> — demand-driven placement writes directly into this calendar.",
          "<strong>Delete Plan</strong> — clears all placement quantities to zero (requires confirmation). Use to start fresh without changing the horizon or parameters.",
        ],
      },
      step2: {
        label: "Production Pipeline",
        badge: "Step 2",
        title: "Step 2 · Live Bird Forecast & Harvest Yield",
        subtitle: "Harvest projections and slaughter losses by week",
        body: "Auto-computed from the placement calendar. Shows week-by-week: placed → harvestable → dispatched → electronic count → slaughtered → carcass weight. The <strong>Harvest & Slaughter Losses</strong> section below the table summarises where birds are lost between catching and carcass (harvest mortality, DOA, culled, plucking rejects) over the full horizon. Attrition rates come from Assumptions. Weeks exceeding plant capacity are flagged in red.",
      },
      step3: {
        label: "Production Pipeline",
        badge: "Step 3",
        title: "Step 3 · Carcass Yield & Grade Split",
        subtitle: "Carcass weight by grade and weight class",
        body: "Weekly carcass weight split into Grade A, B, and C (editable % on screen). The Carcass Size Distribution table offers three views:",
        items: [
          "<strong>Total</strong> — horizon totals with editable distribution %.",
          "<strong>By Week</strong> — size rows × week columns (kg), scrolls horizontally.",
          "<strong>By Month</strong> — weeks aggregated into calendar months.",
        ],
      },
      step4: {
        label: "Production Pipeline",
        badge: "Step 4",
        title: "Step 4 · Product Family Allocation",
        subtitle: "WC Fresh / WC Frozen / Cuts split",
        body: "Allocates each grade's carcass to WC Fresh, WC Frozen, and Cuts based on the family allocation % in Assumptions (Grade C flows entirely to the cutting line). FPP is not allocated here — it is produced downstream from cuts in Step 5. KPI cards include the average Fresh/Frozen share of WC production, and a donut chart shows the horizon-level balance.",
      },
      step5: {
        label: "Production Pipeline",
        badge: "Step 5",
        title: "Step 5 · Cut Plan (Cuts → FPP)",
        subtitle: "Cuts by type, then FPP produced from cuts",
        body: "Applies cut yields (set in Assumptions) to the Cuts volume from Step 4 — a weekly table of breast, boneless, whole leg, drumstick, thigh, wings, back/neck, giblets, and trim/mince. A configurable share of each cut (Assumptions → Cuts → FPP Routing) is then routed into FPP production: the <strong>→ FPP</strong> column shows the weekly FPP draw and <strong>Net Cuts</strong> shows what remains saleable as cuts. Yields and routing shares take effect immediately.",
      },
      step6: {
        label: "Production Pipeline",
        badge: "Step 6",
        title: "Step 6 · Processing Plan by Plant",
        subtitle: "Volume allocated across Plants 1, 2, and 3",
        body: "Distributes carcass volume to each plant per their share % and daily capacity limits. Shows birds, carcass kg, and product family output per plant per week. Over-capacity weeks are flagged in red — adjust plant shares or capacity in Assumptions to resolve.",
      },
      step7: {
        label: "Production Pipeline",
        badge: "Step 7",
        title: "Step 7 · Farm Quota Distribution",
        subtitle: "Assign weekly chick quotas to farms — SAP MEQ1 export",
        body: "Distributes weekly chick placement totals across your farm roster in rotation order, respecting each farm's capacity ceiling. Output mirrors the SAP MEQ1 format.",
        farmMaster: "The Farm Master is fully editable here — farm code (VERID in SAP), sequence position, capacity ceiling, cycle length, and a Skip This Cycle flag. Inactive and Under Maintenance farms are excluded automatically.",
        exports: "Export options: SAP MEQ1 Excel, TXT, and Farm Master Excel — all within Step 7.",
      },
      pp: {
        label: "Processing Plan",
        badge: "PP",
        title: "PP · Carcass Requirement",
        subtitle: "Grade-pool demand by plant and week from the Demand Plan",
        body: "Translates your Demand Plan into carcass KG requirements per grade pool (930 A-Grade Fresh WC, 931 A-Grade Frozen WC, 932 B-Grade/Cuts, 933 FPP) broken down by plant and ISO week. All data comes from the Demand Plan catalog — the same products and quantities you entered in M1.",
        items: [
          "<strong>Grade pools</strong> — 930: Fresh A-Grade whole chicken and fresh cuts; 931: Frozen A-Grade WC; 932: B-Grade WC, frozen cuts, and cuts routed off-grade; 933: FPP products.",
          "<strong>Plant columns</strong> — P1, P2, P3. Demand is distributed using the plant share % in Assumptions.",
          "<strong>Popup breakdown</strong> — click any cell to see the per-product contribution: product name, demand (tons), carcass KG, required birds, and share %.",
          "<strong>Export</strong> — the popup has an ↓ Export button to download the breakdown as Excel.",
          "<strong>Edit Demand Plan</strong> — the banner button navigates directly to M1 to adjust quantities.",
        ],
        tip: "The Processing Plan always reads from the Demand Plan catalog. The SAP Sales Plan (if imported) is used only for reconciliation in M3 — it does not override the carcass requirement shown here.",
      },
      bi: {
        label: "Processing Plan",
        badge: "BI",
        title: "BI · Broiler Intake Plan",
        subtitle: "Pipeline supply vs processing demand — by plant × week",
        body: "The central supply-demand matching view. Shows required carcass KG and birds (from Demand Plan) alongside available carcass KG and birds (from your Placement Plan pipeline) per plant per week, with a gap row and a coverage % badge.",
        items: [
          "<strong>Required (KG / birds)</strong> — from the Processing Plan, distributed by plant share. Click any cell to see the per-grade-pool SKU breakdown.",
          "<strong>Pipeline supply (KG / birds)</strong> — from the Production Pipeline (placement → grow-out → slaughter). Pipeline birds are size-adjusted using the Carcass Size Distribution in Assumptions. Click any birds cell to see the per-size-bucket breakdown.",
          "<strong>Gap (KG)</strong> — pipeline supply minus demand. Green = surplus, red = shortfall.",
          "<strong>Coverage badge</strong> — ✓ green ≥100 %, amber 80–99 %, red <80 %.",
          "<strong>KPI cards</strong> — total required carcass, total pipeline supply, overall gap, and shortfall week count across the horizon.",
          "<strong>Export Excel</strong> — downloads a full plant × week table with required KG/birds, available KG/birds, gap, and coverage %.",
        ],
        tip: "When coverage is red, go to Step 1 (Placement Plan) and increase houses/day for the corresponding placement weeks — the pipeline recalculates immediately. Use M4 (Demand-Driven Placement) to do this automatically.",
      },
      bom: {
        label: "Processing Plan",
        badge: "BOM",
        title: "BOM · Product BOM",
        subtitle: "SKU-level bill of materials for carcass back-calculation",
        body: "The Product BOM defines the weight and packaging data that the Broiler Intake Plan uses to convert carton orders into required birds when SAP sales plan rows are present. Each BOM record maps one SKU to its grade pool.",
        items: [
          "<strong>Fields per SKU</strong>: SKU Code, Description, Package Weight (kg), Units per Carton, Grade Pool (930/931/932/933), Plant (1100 / 1200 / 1300 / ALL).",
          "<strong>Carcass KG per carton</strong> is computed as (packageWeightKg × unitsPerCarton) ÷ gradeYield and shown in the table as a derived column.",
          "<strong>Add / Edit / Delete</strong> rows inline — changes take effect immediately without a save step.",
          "<strong>Import BOM from SAP Excel</strong> — upload a SAP BOM export. The parser reads Material, Material Description, Component net weight (kg), Quantity, Plnt, and grade pool from the file.",
          "<strong>Export BOM</strong> — download the current BOM as Excel for archiving or sharing.",
        ],
        note: "Load the BOM to enable the Req. Birds column and per-bird KPI cards in the Broiler Intake Plan — the system looks up each SKU's package weight and units-per-carton to convert carcass KG into bird counts. Without a BOM those columns are blank. The Processing Plan carcass requirement always comes from the Demand Plan regardless of whether a BOM is loaded.",
      },
      scenarios: {
        label: "Tools",
        badge: "Scenarios",
        title: "Scenarios",
        subtitle: "Save and compare named plan snapshots",
        body: "Save named snapshots of the current plan (parameters + placement calendar) and compare them side by side — base plan vs high-demand plan — before committing to a placement strategy.",
        steps: [
          "Click <strong>Scenarios</strong> in the left sidebar.",
          "Click <strong>Save Current Scenario</strong> and name it.",
          "Modify parameters or placement for your alternative.",
          "Load any saved scenario to restore it; compare KPIs side by side.",
        ],
        note: "Scenarios are stored in your browser. Export an Excel file as a durable backup before clearing browser data.",
      },
      export: {
        label: "Tools",
        badge: "Export",
        title: "Export",
        subtitle: "Excel workbook and PDF summary",
        items: [
          "<strong>Export Excel</strong> — full multi-sheet workbook: placement, live bird, carcass, size distribution, product allocation, cut plan, plant breakdown, and demand plan.",
          "<strong>Export Summary PDF</strong> — print-ready COP summary for management review.",
          "<strong>Step 7 exports</strong> — SAP MEQ1 Excel, TXT, and Farm Master Excel, from within Step 7.",
        ],
      },
    },
    paramHeader: ["Parameter", "What it controls"],
    noteIcon: "ℹ",
    tipIcon: "★",
  },

  ar: {
    eyebrow: "الوطنية للدواجن · التخطيط المركزي للعمليات",
    title: "AWP COP — دليل التخطيط",
    langLabel: "AR",
    altLangLabel: "EN",

    sections: {
      intro: {
        label: "مقدمة",
        title: "ماذا تفعل هذه الأداة",
        body: [
          "AWP COP (التخطيط المركزي للعمليات) هي أداة تخطيط تبدأ من الطلب. ابدأ بما يحتاجه السوق — حسب المنتج والقناة والأسبوع — وسيعمل النظام عكسيًا ليخبرك بعدد الكتاكيت التي يجب تربيتها، ثم للأمام ليُظهر ما سيُنتج في المصنع.",
          "تتكون الأداة من مسارين متوازيين: <strong>وحدات التخطيط التشغيلي (M1–M5)</strong> لجانب الطلب — التقاط الطلب، وهندسة متطلبات التوريد عكسيًا، وتحديد الفجوات، وكتابة خطط التوطين — و<strong>خط الإنتاج (الخطوات 1–7)</strong> لجانب التوريد — بناء تقويم التوطين ومتابعة الطيور من التوطين إلى الذبح والتصنيف والتقطيع وتوزيع المصنع. جميع الحسابات تتحدث لحظيًا.",
        ],
      },
      workflow: {
        label: "البدء",
        title: "سير العمل الموصى به",
        intro: "اتبع هذا التسلسل لإتمام دورة التخطيط التشغيلي كاملة.",
        steps: [
          { label: "الافتراضات", sub: "ضبط المعاملات" },
          { label: "M1 خطة الطلب", sub: "إدخال الطلب" },
          { label: "الخطوة 1 التوطين", sub: "بناء التقويم" },
          { label: "M2 متطلبات التوريد", sub: "مراجعة الفجوات" },
          { label: "M3 المطابقة", sub: "تأكيد التوازن" },
          { label: "M4 تطبيق DDP", sub: "الكتابة في التقويم" },
          { label: "M5 تقرير التخطيط", sub: "المراجعة والتصدير" },
          { label: "الخطوة 7 الحصص", sub: "تصدير SAP MEQ1" },
        ],
        note: "يمكنك استخدام خط الإنتاج بصورة مستقلة دون إدخال طلب — لنمذجة سيناريو توطين ورؤية المخرجات على مستوى المصنع.",
      },
      assumptions: {
        label: "الإعداد",
        title: "لوحة الافتراضات",
        intro: "افتح <strong>الافتراضات</strong> (شريط الأدوات العلوي الأيمن) قبل أي شيء آخر. جميع حسابات خط الإنتاج تعتمد على هذه القيم.",
        params: [
          ["تاريخ بدء الخطة", "الاثنين الأول من الأسبوع الأول. تشتق منه جميع تسميات الأسابيع بصيغة YYYY.MMM.Wk."],
          ["أفق التخطيط", "عدد الأشهر في الخطة (الافتراضي 4). يُعرض كنطاق تقويمي (مثل: أغسطس 2026 – نوفمبر 2026) في جميع أجزاء الأداة."],
          ["عدد البيوت", "عدد البيوت التي يتم تربية الكتاكيت فيها يوميًا."],
          ["مدة الدورة (أيام)", "دورة التربية. تحدد الفارق الزمني بين الحصاد والتوطين."],
          ["معدلات النفوق / الوفيات / الاستبعاد / الرفض", "معدلات الاستنزاف المُطبَّقة في قسم «خسائر الحصاد والذبح» بالخطوة 2."],
          ["متوسط وزن الذبيحة (كجم)", "يُستخدم في حسابات توزيع الحجم والتوريد."],
          ["توزيع الدرجات A / B / C", "نسبة وزن الذبيحة لكل درجة — يجب أن يبلغ مجموعها 100%."],
          ["توزيع أحجام الذبائح", "أحد عشر فئة وزنية (500جم–1500جم) — يجب أن يبلغ مجموعها 100%."],
          ["تخصيص عائلة المنتجات", "لكل درجة: نسبة الذبيحة إلى دجاج طازج / مجمد / قطع. لم يعد FPP يُخصص مباشرة — بل يُنتج من القطع."],
          ["توجيه القطع ← FPP", "لكل قطعة: نسبة إنتاجها الموجهة لتصنيع FPP (مثل: المفرمة 100%، الصدر بلا عظم 30%). الباقي يُباع كقطع."],
          ["الرصيد الافتتاحي (مجمد)", "مخزون الدجاج الكامل المجمد في بداية الأسبوع الأول (كجم). يغذي جدول رصيد المخزون المجمد في وحدة المطابقة M3."],
          ["حصص المصانع وطاقاتها", "نسبة التخصيص وحد الطيور اليومي للمصانع 1-3."],
          ["إيقاف الجمعة", "عند التفعيل، يتم تصفير أيام التوطين والحصاد الجمعة تلقائيًا."],
        ] as [string, string][],
      },
      m1: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M1",
        title: "M1 · خطة الطلب",
        subtitle: "الطلب الأسبوعي حسب المنتج × القناة البيعية",
        body: "أدخل كمية المبيعات المتوقعة لكل منتج في كل قناة بيعية، أسبوعًا بأسبوع. هذا هو المحرك الرئيسي لجميع وحدات التخطيط التشغيلي.",
        products: "المنتجات: دجاج كامل (حسب فئة الوزن، الدرجة A/B، طازج/مجمد)، قطع، منتجات معالجة إضافية FPP (بنسبة مردود)، وبيض (بالصينية).",
        channels: "القنوات: DIST، EXPO، FOOD، MODT، SIST، TRAD، WHOL، ECOM — اختر التبويب أو استخدم All للعرض الموحد.",
        steps: [
          "افتح M1 من الشريط الجانبي أو لوحة البداية.",
          "اختر تبويب القناة.",
          "انقر على أي خلية وأدخل الكمية (أطنان للحوم، صواني للبيض).",
          "استخدم <strong>نسخ الأسبوع للأمام</strong> لنقل قيم أسبوع إلى الأسابيع اللاحقة.",
          "استخدم <strong>تعديل %</strong> لتطبيق نسبة تغيير على منتج أو نطاق تاريخي.",
          "<strong>💰 الأسعار</strong> — حدد سعر بيع لكل منتج (ريال/طن؛ البيض ريال/صينية). بمجرد إدخال أي سعر، تظهر تلقائيًا بطاقة الإيرادات، وملخص الإيرادات حسب القناة، وعمود الإيرادات في جدول القنوات بلوحة البداية.",
          "<strong>حذف الخطة</strong> — يُصفر جميع كميات الطلب (بعد تأكيد). استخدمه لإعادة ضبط الطلب دون تغيير كتالوج المنتجات أو المعاملات.",
        ],
        tip: "<strong>استيراد من SAP:</strong> انقر على «استيراد خطة المبيعات» لرفع ملف SAP (.xlsx / .csv). تعرض اللوحة كود المادة والوصف ووزن الكرتون وحجم المبيعات الإجمالي (CAR وUoM) لكل نوع صف حتى تتمكن من التحقق قبل التطبيق. عيّن كل نوع صف لمنتج في الكتالوج وكل قيمة قناة لمفتاح قناة. يُظهر جدول محاذاة الأسابيع تسميات تقويمية (مثل: Aug W1) لأسابيع الخطة وملف البيانات. يُحفظ التعيين للاستيرادات المستقبلية. عند التطبيق، تُشتق أسعار بيع المنتجات تلقائيًا من عمود <strong>Gross Sales Value (SAR)</strong> في الملف (إجمالي القيمة ÷ إجمالي الكمية لكل منتج) وتُكتب في لوحة الأسعار.",
      },
      m2: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M2",
        title: "M2 · متطلبات التوريد",
        subtitle: "BOM عكسي: الطلب ← الذبائح ← الكتاكيت",
        body: "يحسب الكمية المطلوبة من الذبائح بالكيلوجرام والطيور القابلة للحصاد والكتاكيت أسبوعيًا من طلب M1. الصفوف مرمّزة بألوان: أحمر = عجز (أكثر من 2% أقل)، كهرماني = قريب (ضمن 5%)، أخضر = فائض (أكثر من 5% زيادة).",
        note: "عمود «أسبوع التوطين» يساوي أسبوع الحصاد ناقص فترة التربية. الأسابيع التي تقع قبل بداية الخطة تظهر كـ pre-plan وتُعالج يدويًا.",
        deferralTitle: "تأجيل الحصاد (تعديل تنفيذي)",
        deferralBody: "عند وجود أسابيع عجز، يظهر تلقائيًا زر <strong>✦ اقتراح التأجيلات</strong> — انقره ليحسب النظام تلقائيًا أمثل عدد من الطيور لنقلها من كل أسبوع فائض إلى أسبوع العجز المجاور. يمكنك مراجعة القيم المقترحة وضبطها يدويًا. استخدم عمود <strong>Defer → (birds)</strong> الكهرماني لإدخال عدد الطيور المراد تأجيلها أو تعديله من الأسبوع N إلى الأسبوع N+1؛ تتحدث أعمدة <strong>Adj. Carcass</strong> و<strong>Adj. Gap</strong> فورًا لإظهار التأثير. هذه طبقة محاكاة فقط — الخطة الأساسية وخط الإنتاج لا يتغيران. عند تفعيل التأجيلات، يظهر شريط كهرماني يُظهر إجمالي الطيور المنقولة مع زر <strong>↻ إعادة الاقتراح</strong> (إعادة الحساب من البداية) وزر <strong>مسح الكل</strong>. الاستخدام النموذجي: يوم صيد يحتوي طيورًا بعمر 25.5 أسبوع لكن الطلب منخفض تلك الأسبوع — أجّل إلى الأسبوع التالي بدلًا من الحصاد المبكر.",
      },
      m3: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M3",
        title: "M3 · المطابقة",
        subtitle: "فجوة الطلب مقابل التوريد · مواءمة خطة المبيعات مع الإنتاج",
        body: "عرض أسبوعي جنبًا إلى جنب لإجمالي الطلب (M1) مقابل التوريد المخطط (خط الإنتاج). الفجوات بالكيلوجرام والنسب المئوية. الإنتاج هو المرجع: زر <strong>⚖️ مواءمة خطة المبيعات مع الإنتاج</strong> يخفض خلايا الطلب بالتناسب (لكل فئة × أسبوع) حيثما تجاوز الطلب ما تسلمه المصانع — مع الحفاظ على حصص القنوات، ودون المساس بأسابيع الفائض. تعرض الصفحة أيضًا جدول <strong>رصيد المخزون المجمد</strong> (افتتاحي + إنتاج مجمد − طلب مجمد = ختامي، أسبوعيًا، بالأحمر عند السالب) مع بطاقات للمخزون الافتتاحي والختامي وأسابيع نفاد المخزون ومتوسط نسبة الطازج/المجمد من الإنتاج.",
      },
      m4: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M4",
        title: "M4 · التوطين القائم على الطلب",
        subtitle: "ترجمة متطلبات الطلب إلى تقويم توطين",
        body: "يُغلق حلقة التخطيط التشغيلي. يحسب عدد البيوت اليومية المطلوبة لكل أسبوع توطين لتلبية طلب M1، ثم يكتب هذه الأرقام مباشرة في خطة التوطين (الخطوة 1).",
        steps: [
          "راجع جدول <strong>معاينة أسبوع التوطين</strong> — البيوت الحالية مقابل المطلوبة، مع تمييز أسابيع تجاوز الطاقة.",
          "في حالة تجاوز الطاقة: ارفع عدد البيوت في الافتراضات أو قلل الطلب في M1.",
          "انقر <strong>تطبيق على خطة التوطين</strong> لكتابة القيم في الخطوة 1.",
        ],
        tip: "أسابيع التوطين التي لا يوجد لها طلب يُصفَّر فيها عدد البيوت عند التطبيق — لا تُحتفظ بقيم الملء السريع السابقة. فقط الأسابيع ذات الطلب الفعلي تُملأ.",
      },
      m5: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M5",
        title: "M5 · تقرير التخطيط التشغيلي",
        subtitle: "مراجعة إشارات المرور الأسبوعية لاجتماعات COP",
        body: "ملخص جاهز للمجلس: أسابيع العجز والمنطقة الضيقة بالأحمر والكهرماني، إجماليات التوريد مقابل الطلب، معدلات استغلال الطاقة، وقائمة إجراءات التوطين. يمكن تصديره مباشرة كـ PDF من خلال زر «تصدير PDF» في شريط الأدوات.",
      },
      step1: {
        label: "خط الإنتاج",
        badge: "الخطوة 1",
        title: "الخطوة 1 · خطة التوطين",
        subtitle: "تقويم التوطين اليومي للكتاكيت",
        body: "المدخل الرئيسي لجانب التوريد. حدد عدد البيوت والكتاكيت لكل يوم — جميع الخطوات اللاحقة تُعاد حسابها من هذا التقويم.",
        items: [
          "<strong>الملء السريع</strong> — يملأ أيام العمل بمعدل ثابت من إعدادات الافتراضات.",
          "<strong>التعديل اليدوي</strong> — انقر على أي خلية للتعديل. أيام الجمعة تُصفَّر تلقائيًا عند تفعيل «إيقاف الجمعة».",
          "<strong>التطبيق من M4</strong> — يكتب التوطين القائم على الطلب مباشرة في هذا التقويم.",
          "<strong>حذف الخطة</strong> — يُصفر جميع كميات التوطين (بعد تأكيد). استخدمه للبدء من جديد دون تغيير الأفق أو المعاملات.",
        ],
      },
      step2: {
        label: "خط الإنتاج",
        badge: "الخطوة 2",
        title: "الخطوة 2 · توقعات الطيور الحية وناتج الحصاد",
        subtitle: "توقعات الحصاد وخسائر الذبح الأسبوعية",
        body: "تُحسب تلقائيًا من تقويم التوطين. تُظهر المسار الكامل أسبوعيًا: موطَّن ← قابل للحصاد ← مشحون ← العدد الإلكتروني ← مذبوح ← وزن الذبيحة. يعرض قسم <strong>خسائر الحصاد والذبح</strong> الشلال الكامل: نفوق الحصاد، الوفيات، المستبعَدة، ورفض التنظيف. الأسابيع التي تتجاوز طاقة المصنع تُميَّز بالأحمر.",
      },
      step3: {
        label: "خط الإنتاج",
        badge: "الخطوة 3",
        title: "الخطوة 3 · مردود الذبائح وتصنيف الدرجات",
        subtitle: "وزن الذبيحة حسب الدرجة وفئة الوزن",
        body: "وزن الذبيحة الأسبوعي مقسمًا إلى درجات A وB وC (نسب قابلة للتعديل على الشاشة). جدول توزيع أحجام الذبائح يتيح ثلاثة عروض:",
        items: [
          "<strong>الإجمالي</strong> — إجماليات الأفق مع نسب التوزيع القابلة للتعديل.",
          "<strong>أسبوعي</strong> — صفوف الأحجام × أعمدة الأسابيع (كجم)، قابل للتمرير أفقيًا.",
          "<strong>شهري</strong> — الأسابيع مجمَّعة في أشهر تقويمية.",
        ],
      },
      step4: {
        label: "خط الإنتاج",
        badge: "الخطوة 4",
        title: "الخطوة 4 · تخصيص عائلة المنتجات",
        subtitle: "تقسيم دجاج طازج / مجمد / قطع",
        body: "يخصص ذبيحة كل درجة إلى دجاج طازج ومجمد وقطع وفق نسب التخصيص في الافتراضات (درجة C تذهب بالكامل لخط التقطيع). لا يُخصص FPP هنا — بل يُنتج لاحقًا من القطع في الخطوة 5. تشمل البطاقات متوسط نسبة الطازج/المجمد من إنتاج الدجاج الكامل، ومخطط الدائرة يُظهر التوازن على مستوى الأفق.",
      },
      step5: {
        label: "خط الإنتاج",
        badge: "الخطوة 5",
        title: "الخطوة 5 · خطة التقطيع (قطع ← FPP)",
        subtitle: "القطع حسب النوع، ثم إنتاج FPP من القطع",
        body: "يطبق معدلات مردود القطع (من الافتراضات) على حجم القطع من الخطوة 4 — جدول أسبوعي يشمل: الصدر، الصدر بلا عظم، الفخذ الكامل، الساق، الفخذ، الأجنحة، الظهر والرقبة، المصارين، والمفرمة. ثم تُوجَّه نسبة قابلة للضبط من كل قطعة (الافتراضات ← توجيه القطع ← FPP) إلى تصنيع FPP: عمود <strong>← FPP</strong> يُظهر السحب الأسبوعي للتصنيع وعمود <strong>صافي القطع</strong> يُظهر ما يتبقى للبيع كقطع. المعدلات ونسب التوجيه تسري فورًا.",
      },
      step6: {
        label: "خط الإنتاج",
        badge: "الخطوة 6",
        title: "الخطوة 6 · خطة التصنيع بالمصنع",
        subtitle: "توزيع الإنتاج على المصانع 1 و2 و3",
        body: "يوزع حجم الذبائح على كل مصنع وفق نسبة الحصة والحد اليومي للطيور. يُظهر الطيور والكيلوجرامات ومخرجات عائلة المنتجات لكل مصنع أسبوعيًا. الأسابيع التي تتجاوز الطاقة تُميَّز بالأحمر — عدّل الحصص أو رفع الطاقة في الافتراضات.",
      },
      step7: {
        label: "خط الإنتاج",
        badge: "الخطوة 7",
        title: "الخطوة 7 · توزيع حصص المزارع",
        subtitle: "تصدير SAP MEQ1",
        body: "يوزع إجماليات التوطين الأسبوعية على قائمة مزارعك بترتيب التناوب، مع مراعاة حد طاقة كل مزرعة. المخرج يطابق صيغة SAP MEQ1.",
        farmMaster: "سجل المزارع قابل للتعديل الكامل هنا — رمز المزرعة (VERID في SAP)، ترتيب التسلسل، حد الطاقة، مدة الدورة، وعلامة «تخطي هذه الدورة». المزارع غير النشطة وقيد الصيانة تُستبعد تلقائيًا.",
        exports: "خيارات التصدير: SAP MEQ1 Excel، TXT، وسجل المزارع Excel — جميعها من داخل الخطوة 7.",
      },
      pp: {
        label: "خطة التصنيع",
        badge: "PP",
        title: "PP · متطلبات الذبائح",
        subtitle: "الطلب على الذبائح حسب المجموعة والمصنع والأسبوع من خطة الطلب",
        body: "تترجم خطة الطلب إلى متطلبات كيلوجرامات الذبائح لكل مجموعة (930 درجة A طازج كامل، 931 درجة A مجمد كامل، 932 درجة B/قطع، 933 FPP) مقسمةً حسب المصنع وأسبوع ISO. جميع البيانات تأتي من كتالوج خطة الطلب.",
        items: [
          "<strong>المجموعات</strong> — 930: دجاج كامل طازج درجة A وقطع طازجة؛ 931: دجاج كامل مجمد درجة A؛ 932: دجاج كامل درجة B وقطع مجمدة؛ 933: منتجات FPP.",
          "<strong>أعمدة المصانع</strong> — P1، P2، P3. يُوزع الطلب باستخدام نسبة حصة المصنع في الافتراضات.",
          "<strong>تفاصيل النافذة المنبثقة</strong> — انقر أي خلية لرؤية مساهمة كل منتج: الاسم، الطلب (طن)، كيلوجرامات الذبيحة، الطيور المطلوبة، والحصة %.",
          "<strong>التصدير</strong> — تحتوي النافذة المنبثقة على زر ↓ تصدير لتنزيل التفاصيل كملف Excel.",
          "<strong>تعديل خطة الطلب</strong> — زر البانر يوجه مباشرةً إلى M1 لتعديل الكميات.",
        ],
        tip: "تقرأ خطة التصنيع دائمًا من كتالوج خطة الطلب. خطة مبيعات SAP (إن تم استيرادها) تُستخدم فقط للمطابقة في M3 ولا تؤثر على متطلبات الذبائح المعروضة هنا.",
      },
      bi: {
        label: "خطة التصنيع",
        badge: "BI",
        title: "BI · خطة استقبال الدواجن",
        subtitle: "توريد خط الإنتاج مقابل الطلب التصنيعي — حسب المصنع والأسبوع",
        body: "عرض المطابقة المركزي بين العرض والطلب. يُظهر كيلوجرامات الذبائح والطيور المطلوبة (من خطة الطلب) مقابل الكيلوجرامات والطيور المتاحة (من خط إنتاج خطة التوطين) لكل مصنع في كل أسبوع، مع صف الفجوة وشارة نسبة التغطية.",
        items: [
          "<strong>المطلوب (كجم / طيور)</strong> — من خطة التصنيع، موزعة حسب حصة المصنع. انقر أي خلية لرؤية تفاصيل كل مجموعة.",
          "<strong>توريد خط الإنتاج (كجم / طيور)</strong> — من خط إنتاج الإنتاج (توطين ← تربية ← ذبح). طيور خط الإنتاج معدَّلة حسب الحجم باستخدام توزيع أحجام الذبائح في الافتراضات.",
          "<strong>الفجوة (كجم)</strong> — توريد خط الإنتاج ناقص الطلب. أخضر = فائض، أحمر = عجز.",
          "<strong>شارة التغطية</strong> — ✓ أخضر ≥100%، كهرماني 80–99%، أحمر <80%.",
          "<strong>بطاقات المؤشرات</strong> — إجمالي الذبائح المطلوبة، إجمالي توريد خط الإنتاج، الفجوة الكلية، وعدد أسابيع العجز.",
          "<strong>تصدير Excel</strong> — تنزيل جدول كامل بالمصنع والأسبوع يشمل الكجم/الطيور المطلوبة والمتاحة والفجوة ونسبة التغطية.",
        ],
        tip: "عند ظهور تغطية حمراء، انتقل إلى الخطوة 1 (خطة التوطين) وزد عدد البيوت/اليوم لأسابيع التوطين المقابلة — يُعاد حساب خط الإنتاج فورًا. استخدم M4 (التوطين القائم على الطلب) للقيام بذلك تلقائيًا.",
      },
      bom: {
        label: "خطة التصنيع",
        badge: "BOM",
        title: "BOM · قائمة مواد المنتج",
        subtitle: "قائمة مواد على مستوى SKU للحساب العكسي للذبائح",
        body: "تُعرّف قائمة مواد المنتج بيانات الوزن والتعبئة التي تستخدمها خطة استقبال الدواجن لتحويل طلبيات الكراتين إلى طيور مطلوبة. كل سجل BOM يربط SKU واحدًا بمجموعة الدرجة الخاصة به.",
        items: [
          "<strong>الحقول لكل SKU</strong>: كود SKU، الوصف، وزن العبوة (كجم)، وحدات الكرتون، مجموعة الدرجة (930/931/932/933)، المصنع (1100/1200/1300/ALL).",
          "<strong>كجم الذبيحة لكل كرتون</strong> يُحسب كـ (وزن العبوة × وحدات الكرتون) ÷ ناتج الدرجة ويظهر كعمود مشتق في الجدول.",
          "<strong>إضافة / تعديل / حذف</strong> الصفوف بشكل مباشر — تسري التغييرات فورًا.",
          "<strong>استيراد BOM من SAP Excel</strong> — رفع ملف تصدير BOM من SAP. يقرأ المحلل: المادة، الوصف، وزن المكون الصافي، الكمية، المصنع، ومجموعة الدرجة.",
          "<strong>تصدير BOM</strong> — تنزيل BOM الحالي كملف Excel للأرشفة أو المشاركة.",
        ],
        note: "قم بتحميل BOM لتفعيل عمود 'الطيور المطلوبة' وبطاقات مؤشرات الطيور في خطة استقبال الدواجن — يبحث النظام عن وزن عبوة كل SKU وعدد الوحدات في الكرتون لتحويل كيلوجرامات الذبيحة إلى أعداد الطيور. بدون BOM تبقى هذه الأعمدة فارغة. متطلبات الذبائح في خطة التصنيع تأتي دائمًا من خطة الطلب بغض النظر عن وجود BOM.",
      },
      scenarios: {
        label: "الأدوات",
        badge: "السيناريوهات",
        title: "السيناريوهات",
        subtitle: "حفظ ومقارنة لقطات الخطة المسمّاة",
        body: "احفظ لقطات مسمّاة للخطة الحالية (المعاملات + تقويم التوطين) وقارن بينها جنبًا إلى جنب — خطة قاعدية مقابل خطة طلب مرتفع — قبل الالتزام باستراتيجية التوطين.",
        steps: [
          "انقر على <strong>السيناريوهات</strong> في الشريط الجانبي.",
          "انقر <strong>حفظ السيناريو الحالي</strong> وامنحه اسمًا.",
          "عدّل المعاملات أو التوطين للبديل.",
          "حمّل أي سيناريو محفوظ لاستعادته؛ قارن المؤشرات الرئيسية جنبًا إلى جنب.",
        ],
        note: "تُخزَّن السيناريوهات في متصفحك. صدّر ملف Excel كنسخة احتياطية قبل مسح بيانات المتصفح.",
      },
      export: {
        label: "الأدوات",
        badge: "التصدير",
        title: "التصدير",
        subtitle: "مصنف Excel وملخص PDF",
        items: [
          "<strong>تصدير Excel</strong> — مصنف متعدد الأوراق: التوطين، الطيور الحية، الذبائح، توزيع الأحجام، تخصيص المنتجات، خطة القطع، توزيع المصنع، وخطة الطلب.",
          "<strong>تصدير PDF</strong> — ملخص COP جاهز للطباعة للمراجعة الإدارية.",
          "<strong>تصديرات الخطوة 7</strong> — SAP MEQ1 Excel، TXT، وسجل المزارع Excel، من داخل الخطوة 7.",
        ],
      },
    },
    paramHeader: ["المعامل", "ما يتحكم فيه"],
    noteIcon: "ℹ",
    tipIcon: "★",
  },
} as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mt-8 mb-4">
      <div className="text-[9.5px] font-bold tracking-[0.15em] uppercase text-brand-green mb-1">{label}</div>
      <h2 className="text-base font-bold text-neutral-800 border-b border-[var(--border-subtle)] pb-2">{title}</h2>
    </div>
  );
}

function Card({ badge, module: isModule, title, subtitle, children }: {
  badge: string; module?: boolean; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm p-5 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <span className={`shrink-0 text-[10px] font-bold tracking-wide px-2 py-1 rounded ${
          isModule ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-brand-green-tint text-brand-green-dark"
        }`}>{badge}</span>
        <div>
          <div className="text-sm font-bold text-neutral-800">{title}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="text-[13px] text-neutral-600 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function Note({ tip, children }: { tip?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2 rounded-lg px-3 py-2.5 text-[12px] text-neutral-600 mt-2 border ${
      tip ? "bg-amber-50 border-amber-200 border-l-2 border-l-amber-400" : "bg-neutral-50 border-neutral-200 border-l-2 border-l-brand-green"
    }`}>
      <span className="shrink-0">{tip ? "★" : "ℹ"}</span>
      <div dangerouslySetInnerHTML={{ __html: children as string }} />
    </div>
  );
}

function StepList({ items }: { items: readonly string[] }) {
  return (
    <ol className="space-y-1.5 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] text-neutral-600">
          <span className="shrink-0 w-5 h-5 rounded-full bg-brand-green-tint text-brand-green-dark text-[10px] font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: item }} />
        </li>
      ))}
    </ol>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc pl-4 space-y-1 mt-1">
      {items.map((item, i) => (
        <li key={i} className="text-[13px] text-neutral-600" dangerouslySetInnerHTML={{ __html: item }} />
      ))}
    </ul>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function UserGuideModal({ onClose }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  const s = t.sections;
  const isAr = lang === "ar";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="relative ml-auto w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col"
        dir={isAr ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-brand-green-tint/50 shrink-0">
          <div>
            <div className="text-[9.5px] font-bold tracking-[0.15em] uppercase text-brand-green mb-0.5"
              dangerouslySetInnerHTML={{ __html: t.eyebrow }} />
            <h1 className="text-base font-bold text-neutral-800">{t.title}</h1>
          </div>
          <div className={`flex items-center gap-2 ${isAr ? "flex-row-reverse" : ""}`}>
            {/* Language toggle */}
            <div className="flex rounded-lg border border-[var(--border-subtle)] overflow-hidden text-[11px] font-bold">
              {(["en", "ar"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 transition-colors ${l === "ar" ? "border-l border-[var(--border-subtle)]" : ""} ${
                    lang === l ? "bg-brand-green text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 transition-colors text-lg"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Intro */}
          <SectionHeader label={s.intro.label} title={s.intro.title} />
          {s.intro.body.map((p, i) => (
            <p key={i} className="text-[13px] text-neutral-600 leading-relaxed mb-3"
              dangerouslySetInnerHTML={{ __html: p }} />
          ))}

          {/* Workflow */}
          <SectionHeader label={s.workflow.label} title={s.workflow.title} />
          <p className="text-[13px] text-neutral-600 mb-3">{s.workflow.intro}</p>
          <div className="flex flex-wrap gap-1.5 items-center mb-3">
            {s.workflow.steps.map((step, i, arr) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-2 text-center">
                  <div className="text-[12px] font-semibold text-neutral-700 whitespace-nowrap">{step.label}</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5 whitespace-nowrap">{step.sub}</div>
                </div>
                {i < arr.length - 1 && <span className="text-neutral-300 font-bold">{isAr ? "‹" : "›"}</span>}
              </div>
            ))}
          </div>
          <Note>{s.workflow.note}</Note>

          {/* Assumptions */}
          <SectionHeader label={s.assumptions.label} title={s.assumptions.title} />
          <p className="text-[13px] text-neutral-600 mb-3" dangerouslySetInnerHTML={{ __html: s.assumptions.intro }} />
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-[var(--border-subtle)]">
                  {t.paramHeader.map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-neutral-500 text-[10px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {s.assumptions.params.map(([param, desc]) => (
                  <tr key={param} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 font-semibold text-neutral-700 whitespace-nowrap">{param}</td>
                    <td className="px-3 py-2 text-neutral-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* M1 */}
          <SectionHeader label={s.m1.label} title={s.m1.title} />
          <Card badge={s.m1.badge} module title={s.m1.title} subtitle={s.m1.subtitle}>
            <p>{s.m1.body}</p>
            <p>{s.m1.products}</p>
            <p>{s.m1.channels}</p>
            <StepList items={s.m1.steps} />
            <Note tip>{s.m1.tip}</Note>
          </Card>

          {/* M2 */}
          <SectionHeader label={s.m2.label} title={s.m2.title} />
          <Card badge={s.m2.badge} module title={s.m2.title} subtitle={s.m2.subtitle}>
            <p>{s.m2.body}</p>
            <Note>{s.m2.note}</Note>
            {"deferralTitle" in s.m2 && (
              <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                <div className="text-[12px] font-semibold text-amber-700 mb-1">↪ {(s.m2 as { deferralTitle: string }).deferralTitle}</div>
                <p className="text-[13px] text-neutral-600" dangerouslySetInnerHTML={{ __html: (s.m2 as { deferralBody: string }).deferralBody }} />
              </div>
            )}
          </Card>

          {/* M3 */}
          <SectionHeader label={s.m3.label} title={s.m3.title} />
          <Card badge={s.m3.badge} module title={s.m3.title} subtitle={s.m3.subtitle}>
            <p>{s.m3.body}</p>
          </Card>

          {/* M4 */}
          <SectionHeader label={s.m4.label} title={s.m4.title} />
          <Card badge={s.m4.badge} module title={s.m4.title} subtitle={s.m4.subtitle}>
            <p>{s.m4.body}</p>
            <StepList items={s.m4.steps} />
            <Note tip>{s.m4.tip}</Note>
          </Card>

          {/* M5 */}
          <SectionHeader label={s.m5.label} title={s.m5.title} />
          <Card badge={s.m5.badge} module title={s.m5.title} subtitle={s.m5.subtitle}>
            <p>{s.m5.body}</p>
          </Card>

          {/* Step 1 */}
          <SectionHeader label={s.step1.label} title={s.step1.title} />
          <Card badge={s.step1.badge} title={s.step1.title} subtitle={s.step1.subtitle}>
            <p>{s.step1.body}</p>
            <BulletList items={s.step1.items} />
          </Card>

          {/* Step 2 */}
          <SectionHeader label={s.step2.label} title={s.step2.title} />
          <Card badge={s.step2.badge} title={s.step2.title} subtitle={s.step2.subtitle}>
            <p>{s.step2.body}</p>
          </Card>

          {/* Step 3 */}
          <SectionHeader label={s.step3.label} title={s.step3.title} />
          <Card badge={s.step3.badge} title={s.step3.title} subtitle={s.step3.subtitle}>
            <p>{s.step3.body}</p>
            <BulletList items={s.step3.items} />
          </Card>

          {/* Step 4 */}
          <SectionHeader label={s.step4.label} title={s.step4.title} />
          <Card badge={s.step4.badge} title={s.step4.title} subtitle={s.step4.subtitle}>
            <p>{s.step4.body}</p>
          </Card>

          {/* Step 5 */}
          <SectionHeader label={s.step5.label} title={s.step5.title} />
          <Card badge={s.step5.badge} title={s.step5.title} subtitle={s.step5.subtitle}>
            <p>{s.step5.body}</p>
          </Card>

          {/* Step 6 */}
          <SectionHeader label={s.step6.label} title={s.step6.title} />
          <Card badge={s.step6.badge} title={s.step6.title} subtitle={s.step6.subtitle}>
            <p>{s.step6.body}</p>
          </Card>

          {/* Step 7 */}
          <SectionHeader label={s.step7.label} title={s.step7.title} />
          <Card badge={s.step7.badge} title={s.step7.title} subtitle={s.step7.subtitle}>
            <p>{s.step7.body}</p>
            <p>{s.step7.farmMaster}</p>
            <p>{s.step7.exports}</p>
          </Card>

          {/* PP */}
          <SectionHeader label={s.pp.label} title={s.pp.title} />
          <Card badge={s.pp.badge} title={s.pp.title} subtitle={s.pp.subtitle}>
            <p>{s.pp.body}</p>
            <BulletList items={s.pp.items} />
            <Note tip>{s.pp.tip}</Note>
          </Card>

          {/* BI */}
          <SectionHeader label={s.bi.label} title={s.bi.title} />
          <Card badge={s.bi.badge} title={s.bi.title} subtitle={s.bi.subtitle}>
            <p>{s.bi.body}</p>
            <BulletList items={s.bi.items} />
            <Note tip>{s.bi.tip}</Note>
          </Card>

          {/* BOM */}
          <SectionHeader label={s.bom.label} title={s.bom.title} />
          <Card badge={s.bom.badge} title={s.bom.title} subtitle={s.bom.subtitle}>
            <p>{s.bom.body}</p>
            <BulletList items={s.bom.items} />
            <Note>{s.bom.note}</Note>
          </Card>

          {/* Scenarios */}
          <SectionHeader label={s.scenarios.label} title={s.scenarios.title} />
          <Card badge={s.scenarios.badge} title={s.scenarios.title} subtitle={s.scenarios.subtitle}>
            <p>{s.scenarios.body}</p>
            <StepList items={s.scenarios.steps} />
            <Note>{s.scenarios.note}</Note>
          </Card>

          {/* Export */}
          <SectionHeader label={s.export.label} title={s.export.title} />
          <Card badge={s.export.badge} title={s.export.title} subtitle={s.export.subtitle}>
            <BulletList items={s.export.items} />
          </Card>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
