import React from "react";
import clsx from "clsx";

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-paper-200 bg-white shadow-[var(--shadow-card)]",
        padded && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-paper-500">
            {eyebrow}
          </div>
        )}
        <h3 className="text-[15px] font-semibold text-paper-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-paper-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function KeyValue({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-paper-500">{label}</span>
      <span className={clsx("text-right font-medium text-paper-900", mono && "font-mono text-[13px]")}>{value}</span>
    </div>
  );
}
