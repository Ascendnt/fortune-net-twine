import { Check, AlertTriangle, Clock } from "lucide-react";
import clsx from "clsx";
import type { StageRecord } from "@/lib/types";
import { ORDER_STAGES } from "@/lib/types";
import { formatDate } from "@/lib/format";

export function LifecycleStepper({ stages }: { stages: StageRecord[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-start">
        {ORDER_STAGES.map((meta, idx) => {
          const rec = stages.find((s) => s.stage === meta.id);
          const status = rec?.status ?? "pending";
          const isLast = idx === ORDER_STAGES.length - 1;

          const circleClass =
            status === "completed"
              ? "bg-pine-600 border-pine-600 text-white"
              : status === "in_progress"
              ? "bg-manifest-600 border-manifest-600 text-white"
              : status === "blocked"
              ? "bg-alert-600 border-alert-600 text-white"
              : "bg-white border-paper-300 text-paper-400";

          // A connector on BOTH sides of every circle, rather than one trailing each. The circle
          // used to be centred with mx-auto while the line took the leftover space to its right,
          // so the auto margin on the next circle left an uncovered gap and the track appeared to
          // stop short of the final stage. Half-segments always meet.
          const prevStatus = idx === 0 ? undefined : stages.find((s) => s.stage === ORDER_STAGES[idx - 1].id)?.status;
          const leftLine = idx === 0 ? "bg-transparent" : prevStatus === "completed" ? "bg-pine-500" : "bg-paper-200";
          const rightLine = isLast ? "bg-transparent" : status === "completed" ? "bg-pine-500" : "bg-paper-200";

          return (
            <div key={meta.id} className="flex flex-col items-center" style={{ width: 108 }}>
              <div className="flex w-full items-center">
                <div className={clsx("h-0.5 flex-1", leftLine)} />
                <div className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2", circleClass)}>
                  {status === "completed" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : status === "blocked" ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : status === "in_progress" ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-[11px] font-semibold">{idx + 1}</span>
                  )}
                </div>
                <div className={clsx("h-0.5 flex-1", rightLine)} />
              </div>
              <div className="mt-2 text-center">
                <p
                  className={clsx(
                    "text-[11px] font-semibold leading-tight",
                    status === "pending" ? "text-paper-400" : "text-paper-800"
                  )}
                >
                  {meta.label}
                </p>
                <p className="mt-0.5 text-[10px] text-paper-400">
                  {rec?.completedDate ? formatDate(rec.completedDate) : status === "blocked" ? "Blocked" : status === "in_progress" ? "In progress" : "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
