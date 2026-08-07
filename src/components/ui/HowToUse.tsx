import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

// Plain-language instructions for the screen you are on.
//
// Open by default the first time, because the people who most need it are the least likely to go
// looking for a help button. Once dismissed the choice is remembered per screen, so it stops
// getting in the way of anyone who already knows the job.

export function HowToUse({ id, steps, note }: { id: string; steps: string[]; note?: string }) {
  const storageKey = `fnt.help.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) !== "closed";
    } catch {
      return true;
    }
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      /* storage unavailable; the panel simply reopens next time */
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-manifest-200 bg-manifest-50/50">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <HelpCircle className="h-4 w-4 shrink-0 text-manifest-700" />
        <span className="flex-1 text-sm font-semibold text-manifest-900">How to use this screen</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-manifest-700" />
        ) : (
          <ChevronDown className="h-4 w-4 text-manifest-700" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3.5">
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-2.5 text-[13px] leading-relaxed text-paper-700">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-manifest-600 text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          {note && <p className="mt-2.5 border-t border-manifest-200 pt-2.5 text-[12px] text-paper-600">{note}</p>}
        </div>
      )}
    </div>
  );
}
