import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import clsx from "clsx";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

// A type-to-filter combobox for selects backed by large option lists (customers, spec-builder
// categories, etc.) — a plain <select> becomes unwieldy once there are dozens/hundreds of options.
// Falls back to matching the visual style of the app's existing inputs (paper-200 border, manifest
// focus ring) rather than introducing a new look.
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Search…",
  className,
  clearable = false,
}: {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Shows an inline clear control once a value is picked, resetting the field to empty. */
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

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
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
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
        <span className={clsx("truncate", !selected && "text-paper-400")}>{selected ? selected.label : placeholder}</span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && value && (
            // A span rather than a nested button: buttons cannot legally nest, and this sits
            // inside the trigger.
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
              placeholder="Type to filter…"
              className="w-full text-xs focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-paper-400">No matches.</p>}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                className={clsx(
                  "block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-paper-50",
                  o.value === value ? "bg-pine-50 font-medium text-pine-800" : "text-paper-700"
                )}
              >
                {o.label}
                {o.sublabel && <span className="ml-1.5 text-paper-400">{o.sublabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
