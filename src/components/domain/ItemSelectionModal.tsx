import { useEffect, useMemo, useState } from "react";
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
  buildSpecString,
} from "@/lib/specOptions";
import type { SpecSelection } from "@/lib/specOptions";

// Item Selection (doc §3.3). Eleven cascading pick-lists whose choices concatenate into the item's
// specification sentence. Replaces the old SpecBuilderModal, which composed the same string but was
// wired as a per-line override rather than as the step that creates an item.
//
// Every list is a type-to-filter combobox: Others has ~66 entries and Color ~67, which a plain
// <select> handles badly.

const FIELDS: { key: keyof SpecSelection; label: string; options: readonly string[] }[] = [
  { key: "category", label: "Category", options: SPEC_CATEGORIES },
  { key: "material", label: "Material", options: SPEC_MATERIALS },
  { key: "netType", label: "Net Type", options: SPEC_NET_TYPES },
  { key: "knots", label: "Knots Type", options: SPEC_KNOTS },
  { key: "selvages", label: "Selvages", options: SPEC_SELVAGES },
  { key: "stretching", label: "Stretching", options: SPEC_STRETCHING },
  { key: "reinforcement", label: "Reinforcement", options: SPEC_REINFORCEMENT },
  { key: "others", label: "Others", options: SPEC_OTHERS },
  { key: "color", label: "Color", options: SPEC_COLORS },
  { key: "weightUnit", label: "Weight UOM", options: SPEC_WEIGHT_UNITS },
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

  useEffect(() => {
    if (open) setSel(initial ?? EMPTY_SPEC_SELECTION);
  }, [open, initial]);

  // Doc §3.3: "Selecting Material dynamically populates Net Type (cascading dependency confirmed)."
  // The real dependency table isn't available, so the cascade is derived from the specification
  // master — a material only offers net types that actually have codes on file, which also
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
      title="Item Selection"
      subtitle="Each choice is appended to the item's specification, in order."
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
              onChange={(value) => setSel((prev) => ({ ...prev, [f.key]: value }) as SpecSelection)}
              placeholder={`Select ${f.label.toLowerCase()}…`}
              options={(f.key === "netType" ? netTypeOptions : f.options).map((o) => ({ value: o, label: o }))}
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
            Specifications will be filtered to {sel.material} · {sel.netType}.
          </p>
        )}
      </div>
    </Modal>
  );
}
