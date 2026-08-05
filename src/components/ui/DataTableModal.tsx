import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import clsx from "clsx";

// One searchable, filterable, paginated, multi-select table used by every picker in the quotation
// flow (specifications, lacing, and anything added later). Written once so the lists all behave the
// same way — the alternative was three near-identical implementations drifting apart.

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  /** The value this filter reads off a row. Options are derived from the data itself. */
  value: (row: T) => string;
}

export function DataTableModal<T>({
  open,
  onClose,
  title,
  subtitle,
  rows,
  rowKey,
  columns,
  searchText,
  filters = [],
  pageSize = 8,
  selectedKeys,
  onToggle,
  onConfirm,
  confirmLabel = "Confirm",
  headerAction,
  emptyMessage = "Nothing matches those filters.",
  width = "max-w-5xl",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];
  searchText: (row: T) => string;
  filters?: DataTableFilter<T>[];
  pageSize?: number;
  selectedKeys: string[];
  onToggle: (key: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  headerAction?: React.ReactNode;
  emptyMessage?: string;
  width?: string;
  /** Rendered between the toolbar and the table — used for inline "create new row" forms. */
  children?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // Reopening the picker should not inherit the last session's search and filters.
  useEffect(() => {
    if (open) {
      setSearch("");
      setActive({});
      setPage(1);
    }
  }, [open]);

  // Options come from the data rather than a hardcoded list, so a spec added through
  // "Create New Specs" is immediately filterable by its own mesh size.
  const filterOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      map[f.key] = Array.from(new Set(rows.map(f.value).filter(Boolean))).sort();
    }
    return map;
  }, [rows, filters]);

  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && !searchText(row).toLowerCase().includes(needle)) return false;
      return filters.every((f) => {
        const want = active[f.key];
        return !want || f.value(row) === want;
      });
    });
  }, [rows, search, active, filters, searchText]);

  const pageCount = Math.max(1, Math.ceil(matched.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = matched.slice((current - 1) * pageSize, current * pageSize);

  function setFilter(key: string, value: string) {
    setActive((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  const selectedCount = selectedKeys.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={width}
      footer={
        <>
          <span className="mr-auto text-xs text-paper-500">
            {selectedCount > 0 ? `${selectedCount} selected` : `${matched.length} of ${rows.length} shown`}
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={selectedCount === 0}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-8 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        {filters.map((f) => (
          <select
            key={f.key}
            value={active[f.key] ?? ""}
            onChange={(e) => setFilter(f.key, e.target.value)}
            className="rounded-lg border border-paper-200 bg-white px-2 py-2 text-xs text-paper-700 focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          >
            <option value="">All {f.label}</option>
            {(filterOptions[f.key] ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ))}
        {headerAction}
      </div>

      {children}

      <div className="overflow-x-auto rounded-lg border border-paper-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
              <th className="w-10 py-2 pl-3" />
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={clsx("px-2 py-2", c.width, c.align === "right" && "text-right")}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="py-8 text-center text-paper-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const key = rowKey(row);
              const checked = selectedKeys.includes(key);
              return (
                <tr
                  key={key}
                  onClick={() => onToggle(key)}
                  className={clsx(
                    "cursor-pointer border-b border-paper-100 last:border-0",
                    checked ? "bg-manifest-50" : "hover:bg-paper-50"
                  )}
                >
                  <td className="py-1.5 pl-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(key)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={clsx("px-2 py-1.5", c.align === "right" && "text-right font-mono")}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1">
          <PageBtn onClick={() => setPage(1)} disabled={current === 1} label="First">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </PageBtn>
          <PageBtn onClick={() => setPage(current - 1)} disabled={current === 1} label="Previous">
            <ChevronLeft className="h-3.5 w-3.5" />
          </PageBtn>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - current) <= 2 || p === 1 || p === pageCount)
            .map((p, i, arr) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-paper-300">…</span>}
                <button
                  onClick={() => setPage(p)}
                  className={clsx(
                    "min-w-[28px] rounded-md px-2 py-1 text-xs font-medium",
                    p === current ? "bg-pine-700 text-white" : "border border-paper-200 text-paper-600 hover:bg-paper-50"
                  )}
                >
                  {p}
                </button>
              </span>
            ))}
          <PageBtn onClick={() => setPage(current + 1)} disabled={current === pageCount} label="Next">
            <ChevronRight className="h-3.5 w-3.5" />
          </PageBtn>
          <PageBtn onClick={() => setPage(pageCount)} disabled={current === pageCount} label="Last">
            <ChevronsRight className="h-3.5 w-3.5" />
          </PageBtn>
        </div>
      )}
    </Modal>
  );
}

function PageBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md border border-paper-200 px-1.5 py-1 text-paper-500 disabled:opacity-40 enabled:hover:bg-paper-50"
    >
      {children}
    </button>
  );
}
