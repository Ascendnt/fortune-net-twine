import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useStore } from "@/lib/store";
import {
  EMPTY_SPEC_SELECTION,
  SPEC_CATEGORIES,
  SPEC_COLORS,
  SPEC_KNOTS,
  SPEC_MATERIALS,
  SPEC_NET_TYPES,
  SPEC_OTHERS,
  SPEC_QTY_UNITS,
  SPEC_REINFORCEMENT,
  SPEC_SELVAGES,
  SPEC_STRETCHING,
  SPEC_WEIGHT_UNITS,
  SPEC_NONE,
  buildSpecString,
} from "@/lib/specOptions";
import type { SpecSelection } from "@/lib/specOptions";

// Item Selection (doc §3.3). Eleven cascading pick-lists whose choices concatenate into the item's
// specification sentence. Replaces the old SpecBuilderModal, which composed the same string but was
// wired as a per-line override rather than as the step that creates an item.
//
// Every list is a type-to-filter combobox: Others has ~66 entries and Color ~67, which a plain
// <select> handles badly.

// `optional` fields carry an explicit "-" choice. Material and Net Type are required (they drive
// which item codes exist), and the two UOMs must resolve to a real unit or the document prints a
// blank column, so none of those four offer it.
const FIELDS: { key: keyof SpecSelection; label: string; options: readonly string[]; optional?: boolean }[] = [
  { key: "category", label: "Category", options: SPEC_CATEGORIES, optional: true },
  { key: "material", label: "Material", options: SPEC_MATERIALS },
  { key: "netType", label: "Net Type", options: SPEC_NET_TYPES },
  { key: "knots", label: "Knots Type", options: SPEC_KNOTS, optional: true },
  { key: "selvages", label: "Selvages", options: SPEC_SELVAGES, optional: true },
  { key: "stretching", label: "Stretching", options: SPEC_STRETCHING, optional: true },
  { key: "reinforcement", label: "Reinforcement", options: SPEC_REINFORCEMENT, optional: true },
  { key: "others", label: "Others", options: SPEC_OTHERS, optional: true },
  { key: "color", label: "Color", options: SPEC_COLORS, optional: true },
  { key: "weightUnit", label: "Weight", options: SPEC_WEIGHT_UNITS },
  { key: "qtyUnit", label: "Quantity UOM", options: SPEC_QTY_UNITS },
];

export function ItemSelectionModal({
  open,
  onClose,
  initial,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  initial?: SpecSelection;
  onConfirm: (selection: SpecSelection, specification: string) => void;
}) {
  const { specMaster } = useStore();
  const [sel, setSel] = useState<SpecSelection>(initial ?? EMPTY_SPEC_SELECTION);

  // Reset only on the closed-to-open transition. The previous version also depended on `initial`,
  // which the caller builds as a fresh object literal on every render, so while the modal was open
  // the effect re-ran on each keystroke and wiped the selection straight back to its starting
  // value. That is why Category appeared impossible to change.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setSel(initial ?? EMPTY_SPEC_SELECTION);
    wasOpen.current = open;
  }, [open, initial]);

  // Doc §3.3: "Selecting Material dynamically populates Net Type (cascading dependency confirmed)."
  // The real dependency table isn't available, so the cascade is derived from the specification
  // master, so a material only offers net types that actually have codes on file, which also
  // guarantees the Add Specification picker can never open empty. When a material has no codes yet
  // (a newly added one, say), the full list is offered rather than a dead end.
  const netTypeOptions = useMemo(() => {
    if (!sel.material) return SPEC_NET_TYPES;
    const available = Array.from(
      new Set(specMaster.filter((r) => r.material === sel.material).map((r) => r.netType))
    ).sort();
    return available.length > 0 ? available : SPEC_NET_TYPES;
  }, [sel.material, specMaster]);

  // Changing material can strand a net type that the new material doesn't carry.
  useEffect(() => {
    if (sel.netType && !netTypeOptions.includes(sel.netType)) {
      setSel((prev) => ({ ...prev, netType: "" }));
    }
  }, [netTypeOptions, sel.netType]);

  const preview = buildSpecString(sel);
  // Material and Net Type are the two fields the specification picker filters on, so an item
  // without them would open an empty Add Specification list.
  const ready = Boolean(sel.material && sel.netType);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Specification Selection"
      subtitle="Each choice is appended to the specification, in order."
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" disabled={!ready} onClick={() => onConfirm(sel, preview)}>
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-[150px_1fr] items-center gap-3">
            <label className="font-mono text-[11px] font-semibold uppercase tracking-wide text-paper-500">
              {f.label}
              {(f.key === "material" || f.key === "netType") && <span className="text-alert-600"> *</span>}
            </label>
            <SearchableSelect
              value={sel[f.key]}
              clearable={f.optional}
              onChange={(value) => setSel((prev) => ({ ...prev, [f.key]: value }) as SpecSelection)}
              placeholder={`Select ${f.label.toLowerCase()}…`}
              options={[
                ...(f.optional ? [{ value: SPEC_NONE, label: SPEC_NONE }] : []),
                ...(f.key === "netType" ? netTypeOptions : f.options).map((o) => ({ value: o, label: o })),
              ]}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-paper-300 bg-paper-50 px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Item specification</p>
        <p className="mt-1 text-[12px] font-semibold uppercase leading-snug text-pine-800">
          {preview || <span className="font-normal normal-case text-paper-400">Pick a material and net type to begin.</span>}
        </p>
        {ready && (
          <p className="mt-1.5 text-[11px] text-paper-500">
            Items will be filtered to {sel.material} {sel.netType}.
          </p>
        )}
        {ready && initial && (initial.material !== sel.material || initial.netType !== sel.netType) && (
          <p className="mt-1.5 text-[11px] font-medium text-amber-700">
            Material or net type changed. Any items already listed under this specification will be removed on confirm.
          </p>
        )}
      </div>
    </Modal>
  );
}
