import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import clsx from "clsx";
import type { ApiRole } from "@/lib/rbacApi";

/**
 * Purpose-built rather than extending the shared SearchableSelect —
 * SearchableSelect is single-value and used elsewhere in the app (spec
 * builder, etc.); bolting a multi-select + "create new" affordance onto it
 * risked regressing those other call sites for a need specific to role
 * assignment. Same visual conventions (type-to-filter dropdown, click-
 * outside-to-close), separate component with a single responsibility.
 *
 * This component never creates a role itself — clicking "+ Create role"
 * just calls onRequestCreateRole(query) and lets the parent decide what
 * happens (in UsersPanel, that's a confirmation modal warning that a new
 * role starts with zero permissions granted, before anything is created).
 */
export function RolePicker({
  allRoles,
  selectedRoleIds,
  onChange,
  onRequestCreateRole,
  disabled,
}: {
  allRoles: ApiRole[];
  selectedRoleIds: number[];
  onChange: (roleIds: number[]) => void;
  onRequestCreateRole: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRoles = allRoles.filter((r) => selectedRoleIds.includes(r.id));

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

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => allRoles.filter((r) => !selectedRoleIds.includes(r.id) && r.name.toLowerCase().includes(q)),
    [allRoles, selectedRoleIds, q]
  );

  // Only offer "create" when the typed text doesn't exactly match any
  // role that already exists (selected or not) — no point offering to
  // create "Sales Manager" again just because it's already assigned.
  const exactMatchExists = allRoles.some((r) => r.name.toLowerCase() === q);
  const canOfferCreate = q.length > 0 && !exactMatchExists;

  function pick(roleId: number) {
    onChange([...selectedRoleIds, roleId]);
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(roleId: number) {
    onChange(selectedRoleIds.filter((id) => id !== roleId));
  }

  function requestCreate() {
    onRequestCreateRole(query.trim());
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      {selectedRoles.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selectedRoles.map((role) => (
            <span
              key={role.id}
              className="flex items-center gap-1 rounded-full bg-pine-50 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-pine-800 border border-pine-100"
            >
              {role.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(role.id)}
                  className="rounded-full p-0.5 hover:bg-pine-100"
                  aria-label={`Remove ${role.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2 text-left text-sm hover:border-paper-300 focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100 disabled:opacity-50"
      >
        <span className="truncate text-paper-400">
          {selectedRoles.length > 0 ? "Add another role…" : "Search roles…"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-paper-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-paper-200 bg-white shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-1.5 border-b border-paper-100 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-paper-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter or name a new role…"
              className="w-full text-xs focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && !canOfferCreate && (
              <p className="px-3 py-2 text-xs text-paper-400">No matches.</p>
            )}
            {filtered.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => pick(role.id)}
                className="block w-full truncate px-3 py-1.5 text-left text-xs text-paper-700 hover:bg-paper-50"
              >
                {role.name}
              </button>
            ))}
            {canOfferCreate && (
              <button
                type="button"
                onClick={requestCreate}
                className={clsx(
                  "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-manifest-700 hover:bg-manifest-50",
                  filtered.length > 0 && "border-t border-paper-100"
                )}
              >
                <Plus className="h-3 w-3 shrink-0" /> Create role "{query.trim()}"
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
