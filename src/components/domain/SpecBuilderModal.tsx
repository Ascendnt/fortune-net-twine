import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  SPEC_MATERIALS,
  SPEC_NET_TYPES,
  SPEC_KNOTS,
  SPEC_SELVAGES,
  SPEC_STRETCHING,
  SPEC_REINFORCEMENT,
  SPEC_OTHERS,
  SPEC_COLORS,
  SPEC_WEIGHT_UNITS,
  EMPTY_SPEC_SELECTION,
  buildSpecString,
  type SpecSelection,
} from "@/lib/specOptions";

const selectClass =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

function Picker({
  label,
  step,
  value,
  options,
  onChange,
  required,
}: {
  label: string;
  step: number;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-paper-600">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-pine-100 font-mono text-[9px] font-semibold text-pine-700">
          {step}
        </span>
        {label}
        {required && <span className="text-vermillion-600">*</span>}
      </label>
      {options.length > 10 ? (
        <SearchableSelect
          value={value}
          onChange={onChange}
          placeholder="— none —"
          options={options.map((o) => ({ value: o, label: o }))}
        />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          <option value="">— none —</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Composes a specification string from the export description-flow option set (Material -> Net
// Type -> Knots -> Selvages -> Stretching -> Reinforcement -> Others -> Color -> Weight unit), per
// the discovery doc's item-building concept. Only Material is required — real items on the source
// list rarely use every category.
export function SpecBuilderModal({
  open,
  onClose,
  onApply,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (spec: string) => void;
  initial?: string;
}) {
  const [sel, setSel] = useState<SpecSelection>(EMPTY_SPEC_SELECTION);

  useEffect(() => {
    if (open) setSel(EMPTY_SPEC_SELECTION);
  }, [open]);

  const preview = buildSpecString(sel);
  const patch = (p: Partial<SpecSelection>) => setSel((prev) => ({ ...prev, ...p }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Build Specification"
      subtitle="Compose a spec from the export description-flow option set instead of a fixed catalog row."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!sel.material} onClick={() => preview && onApply(preview)}>
            Apply to line
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Picker label="Material" step={1} value={sel.material} options={SPEC_MATERIALS} onChange={(v) => patch({ material: v })} required />
        <Picker label="Type of net" step={2} value={sel.netType} options={SPEC_NET_TYPES} onChange={(v) => patch({ netType: v })} />
        <Picker label="Type of knots" step={3} value={sel.knots} options={SPEC_KNOTS} onChange={(v) => patch({ knots: v })} />
        <Picker label="Selvages" step={4} value={sel.selvages} options={SPEC_SELVAGES} onChange={(v) => patch({ selvages: v })} />
        <Picker label="Stretching" step={5} value={sel.stretching} options={SPEC_STRETCHING} onChange={(v) => patch({ stretching: v })} />
        <Picker label="Reinforcement" step={6} value={sel.reinforcement} options={SPEC_REINFORCEMENT} onChange={(v) => patch({ reinforcement: v })} />
        <Picker label="Others" step={7} value={sel.others} options={SPEC_OTHERS} onChange={(v) => patch({ others: v })} />
        <Picker label="Color" step={8} value={sel.color} options={SPEC_COLORS} onChange={(v) => patch({ color: v })} />
        <Picker label="Weight unit" step={9} value={sel.weightUnit} options={SPEC_WEIGHT_UNITS} onChange={(v) => patch({ weightUnit: v })} />
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-paper-200 bg-paper-50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-paper-400">Generated specification</p>
        <p className="mt-1 text-xs text-paper-700">
          {preview || <span className="text-paper-400">Pick a material to start building the spec string…</span>}
        </p>
        {initial && (
          <p className="mt-2 text-[11px] text-paper-400">
            Current line specification: <span className="font-mono">{initial}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}
