import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DataTableModal } from "@/components/ui/DataTableModal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import type { SpecMasterRow } from "@/lib/specMaster";

// Item Specification picker (doc §3.4). Multi-select, searchable, paginated — and pre-filtered to
// the parent item's Material + Net Type, because "if I add specification it will be based on what
// was picked" in Item Selection. Picking NYLON + BRAIDED NET should not offer Hi-Ex rows.

const miniInput =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function SpecificationPickerModal({
  open,
  onClose,
  material,
  netType,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  material: string;
  netType: string;
  onConfirm: (rows: SpecMasterRow[]) => void;
}) {
  const { specMaster, addSpecMasterRow, pushToast } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ code: "", twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });

  useEffect(() => {
    if (open) {
      setSelected([]);
      setCreating(false);
      setDraft({ code: "", twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
    }
  }, [open]);

  const rows = useMemo(
    () => specMaster.filter((r) => r.material === material && r.netType === netType),
    [specMaster, material, netType]
  );

  function toggle(code: string) {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function confirm() {
    // Emit in the order the master lists them, so the rows land predictably rather than in
    // whatever order they happened to be clicked.
    onConfirm(rows.filter((r) => selected.includes(r.code)));
  }

  function saveNewSpec() {
    const weight = Number(draft.weightPerPc);
    if (!draft.code.trim() || !draft.twine.trim() || !Number.isFinite(weight) || weight <= 0) {
      pushToast({ tone: "warning", title: "Code, twine and a positive weight/pc are required" });
      return;
    }
    if (specMaster.some((r) => r.code.toLowerCase() === draft.code.trim().toLowerCase())) {
      pushToast({ tone: "warning", title: "That code already exists" });
      return;
    }
    const row: SpecMasterRow = {
      code: draft.code.trim().toUpperCase(),
      description: `${material} ${netType}`.toUpperCase(),
      material,
      netType,
      twine: draft.twine.trim(),
      meshSize: draft.meshSize.trim() || "—",
      meshDepth: draft.meshDepth.trim() || "—",
      length: draft.length.trim() || "—",
      weightPerPc: weight,
    };
    addSpecMasterRow(row);
    setSelected((prev) => [...prev, row.code]);
    setCreating(false);
    setDraft({ code: "", twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
    pushToast({ tone: "success", title: "Specification created", description: `${row.code} added to the master.` });
  }

  return (
    <DataTableModal<SpecMasterRow>
      open={open}
      onClose={onClose}
      title="Item Specification"
      subtitle={material && netType ? `Filtered to ${material} · ${netType}` : undefined}
      rows={rows}
      rowKey={(r) => r.code}
      searchText={(r) => `${r.code} ${r.description} ${r.twine} ${r.meshSize} ${r.meshDepth} ${r.length}`}
      filters={[
        { key: "meshSize", label: "mesh sizes", value: (r) => r.meshSize },
        { key: "meshDepth", label: "mesh depths", value: (r) => r.meshDepth },
        { key: "length", label: "lengths", value: (r) => r.length },
      ]}
      columns={[
        { key: "code", header: "Code", render: (r) => <span className="font-mono text-pine-800">{r.code}</span>, width: "w-24" },
        { key: "description", header: "Description", render: (r) => r.description },
        { key: "twine", header: "Twine", render: (r) => <span className="font-mono">{r.twine}</span> },
        { key: "meshSize", header: "Mesh Size", render: (r) => r.meshSize, width: "w-24" },
        { key: "meshDepth", header: "Mesh Depth", render: (r) => r.meshDepth, width: "w-24" },
        { key: "length", header: "Length", render: (r) => r.length, width: "w-32" },
        { key: "weight", header: "Weight/PC", align: "right", render: (r) => r.weightPerPc.toFixed(2), width: "w-24" },
      ]}
      selectedKeys={selected}
      onToggle={toggle}
      onConfirm={confirm}
      confirmLabel="Add Specification"
      emptyMessage={
        rows.length === 0
          ? "No specifications on file for this material and net type — create one below."
          : "Nothing matches those filters."
      }
      headerAction={
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating((v) => !v)}>
          Create New Specs
        </Button>
      }
    >
      {creating && (
        <div className="mb-3 rounded-lg border border-manifest-200 bg-manifest-50/50 p-3">
          <p className="mb-2 text-[11px] font-semibold text-manifest-900">
            New specification — {material} {netType}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="Code" className={miniInput} />
            <input value={draft.twine} onChange={(e) => setDraft({ ...draft, twine: e.target.value })} placeholder="Twine" className={miniInput} />
            <input value={draft.meshSize} onChange={(e) => setDraft({ ...draft, meshSize: e.target.value })} placeholder="Mesh size" className={miniInput} />
            <input value={draft.meshDepth} onChange={(e) => setDraft({ ...draft, meshDepth: e.target.value })} placeholder="Mesh depth" className={miniInput} />
            <input value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} placeholder="Length" className={miniInput} />
            <input value={draft.weightPerPc} onChange={(e) => setDraft({ ...draft, weightPerPc: e.target.value })} placeholder="Weight/pc" type="number" step="0.01" className={miniInput} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveNewSpec}>
              Save specification
            </Button>
          </div>
        </div>
      )}
    </DataTableModal>
  );
}
