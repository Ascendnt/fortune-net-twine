import { getStatusMeta, toneClasses } from "@/lib/statusMeta";
import clsx from "clsx";

export function Badge({
  status,
  label,
  stamp,
  className,
}: {
  status: string;
  label?: string;
  stamp?: boolean;
  className?: string;
}) {
  const meta = getStatusMeta(status);
  const tone = toneClasses[meta.tone];
  const useStamp = stamp ?? meta.stamp;

  if (useStamp) {
    return (
      <span
        className={clsx(
          "stamp text-[11px] font-semibold uppercase",
          tone.text,
          className
        )}
      >
        {label ?? meta.label}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone.bg,
        tone.text,
        tone.border,
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {label ?? meta.label}
    </span>
  );
}
