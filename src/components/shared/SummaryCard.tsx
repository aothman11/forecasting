interface SummaryCardProps {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "green" | "gold" | "alert" | "neutral";
  icon?: string;
}

const borderCls: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green:   "border-l-brand-green",
  gold:    "border-l-amber-400",
  alert:   "border-l-red-400",
  neutral: "border-l-neutral-300",
};

const valueCls: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green:   "text-brand-green-dark",
  gold:    "text-amber-700",
  alert:   "text-red-600",
  neutral: "text-neutral-800",
};

const defaultIcons: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green:   "📈",
  gold:    "⚖️",
  alert:   "⚠️",
  neutral: "📊",
};

export function SummaryCard({ label, value, sublabel, accent = "neutral", icon }: SummaryCardProps) {
  return (
    <div className={`rounded-xl border border-[var(--border-subtle)] border-l-4 ${borderCls[accent]} bg-white shadow-sm p-4 flex flex-col gap-1.5 min-w-[160px]`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 leading-tight">{label}</span>
        <span className="text-base leading-none">{icon ?? defaultIcons[accent]}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-tight ${valueCls[accent]}`}>{value}</div>
      {sublabel && <div className="text-[11px] text-neutral-400 font-medium">{sublabel}</div>}
    </div>
  );
}
