import React from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-paper-900/50 animate-fade-in" onClick={onClose} />
      <div
        className={`relative w-full ${width} animate-toast-in rounded-2xl border border-paper-200 bg-white shadow-[var(--shadow-pop)]`}
      >
        <div className="flex items-start justify-between border-b border-paper-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-paper-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-paper-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-paper-400 hover:bg-paper-100 hover:text-paper-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-paper-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
