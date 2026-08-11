import { useState } from "react";

/**
 * A number field that is allowed to be empty while you are typing.
 *
 * The problem this solves: a controlled `<input type="number">` bound straight to a number cannot
 * hold "nothing". Clearing it produces an empty string, which the handler turns into 0, which is
 * immediately written back — so the field refills with a zero the moment you delete the last
 * digit, and you end up typing around it. Worse, that zero is a real value: a price of 0 on a
 * quotation is indistinguishable from a price somebody meant.
 *
 * So the field keeps its own draft string while focused. Empty stays empty on screen and nothing
 * is committed. On blur, an empty field falls back to `fallback` — the value that is safe and
 * obviously provisional for that column, not necessarily zero.
 */
export function NumberInput({
  value,
  onCommit,
  fallback = 0,
  blankValue,
  integer = false,
  min = 0,
  max,
  step,
  className,
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  /** What an empty field becomes when focus leaves it. Ignored when `blankValue` is set. */
  fallback?: number;
  /**
   * The stored number that means "nothing entered yet", shown as an empty box.
   *
   * Some fields have no sensible default at all: a rate or a quantity nobody has typed is not
   * zero and not one, it is simply absent. Without this the field could only look empty while it
   * had focus, and snapped back to a number the moment you clicked away — which reads as the
   * system refusing to let you clear it.
   */
  blankValue?: number;
  /** Whole numbers only — quantities and piece counts. Weights and rates keep their decimals. */
  integer?: boolean;
  min?: number;
  max?: number;
  step?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  /** null means "not being edited" — show the committed value. */
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => {
    const bounded = Math.max(min, max === undefined ? n : Math.min(max, n));
    return integer ? Math.round(bounded) : bounded;
  };

  return (
    <input
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={step ?? (integer ? "1" : "0.01")}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={className}
      value={draft ?? (blankValue !== undefined && value === blankValue ? "" : String(value))}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Nothing is committed for an empty box. Committing a 0 here is what used to make the
        // field refill under the cursor.
        if (raw.trim() === "") return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onCommit(clamp(parsed));
      }}
      onBlur={() => {
        // An empty box settles to blankValue where the field is allowed to be empty, and to
        // fallback where it is not. Either way the draft is dropped so the stored value shows.
        if (draft !== null && draft.trim() === "") onCommit(blankValue ?? clamp(fallback));
        setDraft(null);
      }}
    />
  );
}
