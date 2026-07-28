import type { ValidationIssue } from "@/lib/types";

export function ValidationBanner({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <div className="border-b border-[var(--border-subtle)] bg-white px-6 py-2 space-y-1 max-h-32 overflow-y-auto">
      {errors.map((issue, i) => (
        <div key={`e${i}`} className="text-xs flex items-start gap-2 text-brand-alert">
          <span className="font-semibold shrink-0">ERROR · {issue.step}</span>
          <span>{issue.message}</span>
        </div>
      ))}
      {warnings.map((issue, i) => (
        <div key={`w${i}`} className="text-xs flex items-start gap-2 text-brand-gold">
          <span className="font-semibold shrink-0">WARNING · {issue.step}</span>
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}
