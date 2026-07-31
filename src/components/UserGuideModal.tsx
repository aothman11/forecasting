"use client";

import { useState } from "react";

type Lang = "en" | "ar";

interface Props {
  onClose: () => void;
}

// ─── Content ────────────────────────────────────────────────────────────────

const T = {
  en: {
    eyebrow: "Al-Watania Poultry · S&OP Tool",
    title: "AWP Production Forecast — User Guide",
    langLabel: "EN",
    altLangLabel: "AR",

    sections: {
      intro: {
        label: "Introduction",
        title: "What this tool does",
        body: [
          "AWP Production Forecast is a demand-first S&OP planning tool. Start from what the market needs — by product, channel, and week — and the system works backward to tell you how many chicks to place, then forward to show exactly what comes out of the plant.",
          "The tool has two parallel tracks: <strong>S&OP Modules (M1–M5)</strong> for the demand side — capture demand, reverse-engineer supply needs, identify gaps, and write placements into the calendar — and the <strong>Production Pipeline (Steps 1–7)</strong> for the supply side — build a placement calendar and follow the bird from chick-in to carcass, grades, cuts, and plant allocations. All calculations update live; there is no recalculate button.",
        ],
      },
      workflow: {
        label: "Getting Started",
        title: "Recommended workflow",
        intro: "Follow this sequence for a complete S&OP cycle.",
        steps: [
          { label: "Assumptions", sub: "Set parameters" },
          { label: "M1 Demand Plan", sub: "Enter demand" },
          { label: "Step 1 Placement", sub: "Build calendar" },
          { label: "M2 Supply Req.", sub: "Review gaps" },
          { label: "M3 Reconcile", sub: "Confirm balance" },
          { label: "M4 Apply DDP", sub: "Write to calendar" },
          { label: "M5 S&OP Report", sub: "Review & export" },
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
          ["Planning Horizon", "Number of weeks in the plan (default 16)."],
          ["House Count", "Houses placing chicks per eligible working day."],
          ["Cycle Length (days)", "Grow-out cycle. Sets the harvest-to-placement week offset used everywhere."],
          ["Mortality / DOA / Culled / Reject rates", "Processing funnel attrition rates shown in Step 2."],
          ["Avg Carcass Weight (kg)", "Used by size-distribution and supply calculations."],
          ["Grade Split A / B / C", "% of carcass weight per grade — must sum to 100%."],
          ["Carcass Size Distribution", "Eleven weight-class buckets (500g–1500g) — must sum to 100%."],
          ["Plant Shares & Capacities", "Allocation % and daily bird limits for Plants 1–3."],
          ["Friday Off", "When on, Friday placement and harvest days are zeroed automatically."],
        ] as [string, string][],
      },
      m1: {
        label: "S&OP Modules",
        badge: "M1",
        title: "M1 · Demand Plan",
        subtitle: "Weekly demand by product × sales channel",
        body: "Enter how much of each product each channel will sell, week by week. This drives all downstream S&OP modules.",
        products: "Products: Whole Chicken (by weight bucket, Grade A/B, Fresh/Frozen), Cuts, FPP (with yield %), and Eggs (in trays).",
        channels: "Channels: DIST, EXPO, FOOD, MODT, SIST, TRAD, WHOL, ECOM — select the tab or use All for a combined view.",
        steps: [
          "Open M1 from the sidebar or the Home dashboard.",
          "Select a channel tab.",
          "Click any cell and type the quantity (tons for meat, trays for eggs).",
          "Use <strong>Copy Week Forward</strong> to propagate a week across remaining weeks.",
          "Use <strong>% Adjust</strong> to apply a % change across a product or date range.",
        ],
        tip: "<strong>Import from SAP:</strong> click Import to upload a SAP sales plan CSV. Map each distinct row signature to a product and each Channels value to a channel key — the mapping is saved for future imports.",
      },
      m2: {
        label: "S&OP Modules",
        badge: "M2",
        title: "M2 · Supply Requirements",
        subtitle: "Reverse BOM: demand → carcass → chicks to place",
        body: "Reverse-engineers required carcass kg, harvestable birds, and chicks per week from your M1 demand. Rows are color-coded: red = deficit (>2% below required), amber = tight (within 5%), green = surplus (>5% above).",
        note: "The 'Place in Wk' column shows the placement week = harvest week minus the grow-out offset. Weeks mapping before the plan start show as pre-plan and must be placed manually.",
      },
      m3: {
        label: "S&OP Modules",
        badge: "M3",
        title: "M3 · Reconciliation",
        subtitle: "Demand vs supply gap by product category",
        body: "Side-by-side weekly view of total demand (M1) against total planned supply (pipeline). Gaps shown in tons and %. Week labels use YYYY.MMM.Wk format to immediately show which calendar month each week belongs to.",
      },
      m4: {
        label: "S&OP Modules",
        badge: "M4",
        title: "M4 · Demand-Driven Placement",
        subtitle: "Translate demand requirements into a placement calendar",
        body: "Closes the S&OP loop. Calculates required houses per day per placement week to fulfil M1 demand, then writes those numbers directly into the Step 1 Placement Plan.",
        steps: [
          "Review the <strong>Placement Week Preview</strong> table — current vs required houses/day, flagging over-capacity weeks.",
          "If over-capacity: raise house count in Assumptions or reduce demand in M1.",
          "Click <strong>Apply to Placement Plan</strong> to write the values to Step 1.",
        ],
        tip: "Placement weeks with <strong>no demand</strong> are set to zero on apply — not carried over from prior quick-fill values. Only weeks with actual demand get populated.",
      },
      m5: {
        label: "S&OP Modules",
        badge: "M5",
        title: "M5 · S&OP Report",
        subtitle: "Traffic-light weekly review for S&OP meetings",
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
        ],
      },
      step2: {
        label: "Production Pipeline",
        badge: "Step 2",
        title: "Step 2 · Live Bird Forecast",
        subtitle: "Harvest projections through the processing funnel",
        body: "Auto-computed from the placement calendar. Shows the full funnel week by week: placed → harvestable → dispatched → electronic count → slaughtered → carcass weight. Attrition rates come from Assumptions. Weeks exceeding plant capacity are flagged in red.",
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
        subtitle: "WC Fresh / WC Frozen / FPP split",
        body: "Allocates Grade A carcass to WC Fresh, WC Frozen, and FPP based on the family allocation % in Assumptions. Grade B goes to WC Frozen; Grade C goes to FPP. A donut chart shows the horizon-level balance.",
      },
      step5: {
        label: "Production Pipeline",
        badge: "Step 5",
        title: "Step 5 · FPP Cut Plan",
        subtitle: "Further-processed output by cut type",
        body: "Applies cut yields (set in Assumptions) to the FPP volume from Step 4 — a weekly table of breast, boneless, whole leg, drumstick, thigh, wings, back/neck, giblets, and trim/mince. Yields are editable in Assumptions and take effect immediately.",
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
          "<strong>Export Summary PDF</strong> — print-ready S&OP summary for management review.",
          "<strong>Step 7 exports</strong> — SAP MEQ1 Excel, TXT, and Farm Master Excel, from within Step 7.",
        ],
      },
    },
    paramHeader: ["Parameter", "What it controls"],
    noteIcon: "ℹ",
    tipIcon: "★",
  },

  ar: {
    eyebrow: "الوطنية للدواجن · أداة التخطيط التشغيلي",
    title: "AWP Production Forecast — دليل المستخدم",
    langLabel: "AR",
    altLangLabel: "EN",

    sections: {
      intro: {
        label: "مقدمة",
        title: "ماذا تفعل هذه الأداة",
        body: [
          "AWP Production Forecast هي أداة تخطيط تشغيلي (S&OP) تبدأ من الطلب. ابدأ بما يحتاجه السوق — حسب المنتج والقناة والأسبوع — وسيعمل النظام عكسيًا ليخبرك بعدد الكتاكيت التي يجب تربيتها، ثم للأمام ليُظهر ما سيُنتج في المصنع.",
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
          ["أفق التخطيط", "عدد الأسابيع في الخطة (الافتراضي 16)."],
          ["عدد البيوت", "عدد البيوت التي يتم تربية الكتاكيت فيها يوميًا."],
          ["مدة الدورة (أيام)", "دورة التربية. تحدد الفارق الزمني بين الحصاد والتوطين."],
          ["معدلات النفوق / الوفيات / الاستبعاد / الرفض", "معدلات الاستنزاف في مسار المعالجة (الخطوة 2)."],
          ["متوسط وزن الذبيحة (كجم)", "يُستخدم في حسابات توزيع الحجم والتوريد."],
          ["توزيع الدرجات A / B / C", "نسبة وزن الذبيحة لكل درجة — يجب أن يبلغ مجموعها 100%."],
          ["توزيع أحجام الذبائح", "أحد عشر فئة وزنية (500جم–1500جم) — يجب أن يبلغ مجموعها 100%."],
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
        ],
        tip: "<strong>استيراد من SAP:</strong> انقر على استيراد لرفع ملف CSV لخطة المبيعات. عيّن كل نمط صف مميز لمنتج وكل قيمة قناة لمفتاح قناة — يُحفظ التعيين للاستيرادات المستقبلية.",
      },
      m2: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M2",
        title: "M2 · متطلبات التوريد",
        subtitle: "BOM عكسي: الطلب ← الذبائح ← الكتاكيت",
        body: "يحسب الكمية المطلوبة من الذبائح بالكيلوجرام والطيور القابلة للحصاد والكتاكيت أسبوعيًا من طلب M1. الصفوف مرمّزة بألوان: أحمر = عجز (أكثر من 2% أقل)، كهرماني = قريب (ضمن 5%)، أخضر = فائض (أكثر من 5% زيادة).",
        note: "عمود «أسبوع التوطين» يساوي أسبوع الحصاد ناقص فترة التربية. الأسابيع التي تقع قبل بداية الخطة تظهر كـ pre-plan وتُعالج يدويًا.",
      },
      m3: {
        label: "وحدات التخطيط التشغيلي",
        badge: "M3",
        title: "M3 · المطابقة",
        subtitle: "فجوة الطلب مقابل التوريد حسب فئة المنتج",
        body: "عرض أسبوعي جنبًا إلى جنب لإجمالي الطلب (M1) مقابل التوريد المخطط (خط الإنتاج). الفجوات بالأطنان والنسب المئوية. تسميات الأسابيع بصيغة YYYY.MMM.Wk للتعرف الفوري على الشهر.",
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
        subtitle: "مراجعة إشارات المرور الأسبوعية لاجتماعات S&OP",
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
        ],
      },
      step2: {
        label: "خط الإنتاج",
        badge: "الخطوة 2",
        title: "الخطوة 2 · توقعات الطيور الحية",
        subtitle: "توقعات الحصاد عبر مسار المعالجة",
        body: "تُحسب تلقائيًا من تقويم التوطين. تُظهر المسار الكامل أسبوعيًا: موطَّن ← قابل للحصاد ← مشحون ← العدد الإلكتروني ← مذبوح ← وزن الذبيحة. معدلات الاستنزاف من الافتراضات. الأسابيع التي تتجاوز طاقة المصنع تُميَّز بالأحمر.",
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
        subtitle: "تقسيم دجاج طازج / مجمد / FPP",
        body: "يخصص درجة A للدجاج الطازج والمجمد ومنتجات المعالجة الإضافية وفق نسب التخصيص في الافتراضات. درجة B تذهب للمجمد؛ درجة C تذهب لـ FPP. مخطط الدائرة يُظهر التوازن على مستوى الأفق.",
      },
      step5: {
        label: "خط الإنتاج",
        badge: "الخطوة 5",
        title: "الخطوة 5 · خطة قطع FPP",
        subtitle: "مخرجات المعالجة الإضافية حسب نوع القطعة",
        body: "يطبق معدلات مردود القطع (من الافتراضات) على حجم FPP من الخطوة 4 — جدول أسبوعي يشمل: الصدر، الصدر بلا عظم، الفخذ الكامل، الساق، الفخذ، الأجنحة، الظهر والرقبة، المصارين، والمفرمة. المعدلات قابلة للتعديل في الافتراضات وتسري فورًا.",
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
          "<strong>تصدير PDF</strong> — ملخص S&OP جاهز للطباعة للمراجعة الإدارية.",
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
