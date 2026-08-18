import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import clsx from "clsx";
import { COUNTRIES } from "@/lib/countries";
import { flagEmoji } from "@/lib/flags";

/**
 * Purpose-built rather than reusing SearchableSelect — that component is
 * click-only (no keyboard handling at all beyond the native browser
 * behavior of a plain button), and the whole point here is "type and hit
 * Enter to select immediately," not "type, then reach for the mouse."
 * Same visual language as SearchableSelect (paper-200 border, manifest
 * focus ring) so it doesn't look like a foreign component bolted on.
 *
 * How the "immediate" part actually works: every keystroke re-filters AND
 * re-sorts (exact-start-of-name matches first, so typing "phi" puts
 * Philippines at the top, not somewhere in a "contains" list) and resets
 * the highlighted row to the top result. Enter selects whatever's
 * highlighted — so for the common case, typing a few letters and hitting
 * Enter is the entire interaction, no mouse required. Arrow keys still
 * move the highlight for the cases where the top match isn't the one
 * you meant.
 */
export function CountrySelect({
  value,
  onChange,
  placeholder = "Search countries…",
  className,
  clearable = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.name === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const startsWith = COUNTRIES.filter((c) => c.name.toLowerCase().startsWith(q));
    const contains = COUNTRIES.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    return [...startsWith, ...contains];
  }, [query]);

  // Re-highlight the top result on every keystroke — this is what makes
  // "type then Enter" work without ever touching an arrow key.
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      listRef.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted, open]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) pick(filtered[highlighted].name);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2 text-left text-sm hover:border-paper-300 focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
      >
        <span className={clsx("flex min-w-0 items-center gap-1.5 truncate", !selected && "text-paper-400")}>
          {selected && <span className="text-base leading-none">{flagEmoji(selected.code)}</span>}
          {selected ? selected.name : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              title="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="rounded p-0.5 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-paper-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-paper-200 bg-white shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-1.5 border-b border-paper-100 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-paper-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a country, press Enter to select…"
              className="w-full text-xs focus:outline-none"
            />
          </div>
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-paper-400">No matches.</p>}
            {filtered.map((c, i) => (
              <button
                key={c.code}
                data-index={i}
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => pick(c.name)}
                className={clsx(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                  i === highlighted ? "bg-manifest-50 text-manifest-800" : c.name === value ? "bg-pine-50 font-medium text-pine-800" : "text-paper-700"
                )}
              >
                <span className="text-sm leading-none">{flagEmoji(c.code)}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
