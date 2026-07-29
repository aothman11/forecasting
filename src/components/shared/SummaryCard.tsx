interface SummaryCardProps {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "green" | "gold" | "alert" | "neutral";
  icon?: string;
}

const accentClasses: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green: "text-brand-green",
  gold: "text-brand-gold",
  alert: "text-brand-alert",
  neutral: "text-foreground",
};

const chipClasses: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green: "bg-brand-green-tint text-brand-green",
  gold: "bg-[#fbf1da] text-brand-gold",
  alert: "bg-[#fbe6df] text-brand-alert",
  neutral: "bg-neutral-100 text-neutral-500",
};

const defaultIcons: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green: "📈",
  gold: "⚖️",
  alert: "⚠️",
  neutral: "📊",
};

export function SummaryCard({ label, value, sublabel, accent = "neutral", icon }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-white px-4 py-3 min-w-[180px] shadow-sm hover:shadow-md transition-shadow flex items-start gap-3">
      <div className={`flex items-center justify-center w-9 h-9 rounded-full text-base shrink-0 ${chipClasses[accent]}`}>
        {icon ?? defaultIcons[accent]}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${accentClasses[accent]}`}>{value}</div>
        {sublabel && <div className="text-xs text-neutral-400 mt-0.5">{sublabel}</div>}
      </div>
    </div>
  );
}
