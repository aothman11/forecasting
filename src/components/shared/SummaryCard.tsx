interface SummaryCardProps {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "green" | "gold" | "alert" | "neutral";
}

const accentClasses: Record<NonNullable<SummaryCardProps["accent"]>, string> = {
  green: "text-brand-green",
  gold: "text-brand-gold",
  alert: "text-brand-alert",
  neutral: "text-foreground",
};

export function SummaryCard({ label, value, sublabel, accent = "neutral" }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3 min-w-[180px]">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${accentClasses[accent]}`}>{value}</div>
      {sublabel && <div className="text-xs text-neutral-400 mt-0.5">{sublabel}</div>}
    </div>
  );
}
