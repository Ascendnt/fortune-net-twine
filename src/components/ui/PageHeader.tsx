import React from "react";
import { ChevronRight } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  breadcrumb,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  breadcrumb?: string[];
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {breadcrumb && (
          <div className="mb-1.5 flex items-center gap-1 text-xs text-paper-400">
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {b}
              </span>
            ))}
          </div>
        )}
        {eyebrow && (
          <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-pine-600">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[22px] font-bold tracking-tight text-paper-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-paper-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sublabel,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "neutral" | "pine" | "amber" | "alert" | "manifest";
  icon?: React.ReactNode;
}) {
  const toneText: Record<string, string> = {
    neutral: "text-paper-900",
    pine: "text-pine-700",
    amber: "text-amber-700",
    alert: "text-alert-700",
    manifest: "text-manifest-700",
  };
  return (
    <div className="rounded-xl border border-paper-200 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-paper-500">{label}</p>
        {icon && <span className="text-paper-300">{icon}</span>}
      </div>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight ${toneText[tone]}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-paper-400">{sublabel}</p>}
    </div>
  );
}
