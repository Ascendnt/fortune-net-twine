import React from "react";
import clsx from "clsx";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-paper-200 bg-white shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-paper-200 bg-paper-50/80">{children}</tr>
    </thead>
  );
}

export function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-paper-500",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TR({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        "border-b border-paper-100 last:border-0 transition-colors",
        onClick && "cursor-pointer hover:bg-pine-50/50",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { children: React.ReactNode; className?: string }) {
  return (
    <td className={clsx("px-4 py-3 align-middle text-paper-800", className)} {...rest}>
      {children}
    </td>
  );
}
