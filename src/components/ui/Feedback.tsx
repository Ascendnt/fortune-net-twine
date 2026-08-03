import { CheckCircle2, Info, AlertTriangle, XCircle, X, Inbox } from "lucide-react";
import { useStore } from "@/lib/store";
import clsx from "clsx";
import React from "react";

const toneIcon = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
};

const toneClass = {
  success: "border-pine-200 bg-pine-50 text-pine-800 [&_svg]:text-pine-600",
  info: "border-manifest-200 bg-manifest-50 text-manifest-800 [&_svg]:text-manifest-600",
  warning: "border-amber-200 bg-amber-50 text-amber-800 [&_svg]:text-amber-600",
  danger: "border-alert-200 bg-alert-50 text-alert-800 [&_svg]:text-alert-600",
};

export function ToastStack() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="fixed bottom-5 right-5 left-5 z-[100] flex w-auto max-w-80 flex-col gap-2 no-print sm:left-auto">
      {toasts.map((t) => {
        const Icon = toneIcon[t.tone];
        return (
          <div
            key={t.id}
            className={clsx(
              "animate-toast-in flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-[var(--shadow-panel)]",
              toneClass[t.tone]
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs leading-snug opacity-90">{t.description}</p>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mesh-lattice flex flex-col items-center justify-center rounded-xl border border-dashed border-paper-300 px-6 py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-paper-100 text-paper-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold text-paper-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-paper-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
