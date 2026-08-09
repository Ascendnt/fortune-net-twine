import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { DataTableModal } from "@/components/ui/DataTableModal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import type { SpecMasterRow } from "@/lib/specMaster";

// Item Specification picker (doc §3.4). Multi-select, searchable, paginated, and pre-filtered to
// the parent item's Material and Net Type, because "if I add specification it will be based on what
// was picked" in Item Selection. Picking NYLON with BRAIDED NET should not offer Hi-Ex rows.

const miniInput =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function SpecificationPickerModal({
  open,
  onClose,
  material,
  netType,
  singleSelect = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  material: string;
  netType: string;
  /** Replace mode: picking a code swaps one existing row, so only one may be selected. */
  singleSelect?: boolean;
  onConfirm: (rows: SpecMasterRow[]) => void;
}) {
  const { specMaster, addSpecMasterRow, recordSpecUsage, specUsage, pushToast } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ code: "", twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
  /** Which existing item the draft was copied from, purely so the panel can say so. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected([]);
      setCreating(false);
      setCopiedFrom(null);
      setDraft({ code: "", twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
    }
  }, [open]);

  /**
   * Filtered to the parent item, then ordered by how often each code has actually been picked.
   *
   * Sorting by code put whatever happens to start with a low number at the top, which is unrelated
   * to what this office quotes. A handful of specifications make up most of the work; those should
   * be the ones on the first page. Codes never used yet fall back to alphabetical, so the list is
   * still predictable rather than arbitrary.
   */
  const rows = useMemo(
    () =>
      specMaster
        .filter((r) => r.material === material && r.netType === netType)
        .sort((a, b) => (specUsage[b.code] ?? 0) - (specUsage[a.code] ?? 0) || a.code.localeCompare(b.code)),
    [specMaster, material, netType, specUsage]
  );

  function toggle(code: string) {
    if (singleSelect) {
      setSelected((prev) => (prev.includes(code) ? [] : [code]));
      return;
    }
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function confirm() {
    const picked = rows.filter((r) => selected.includes(r.code));
    // Counted before emitting, so the next quotation opens with these nearer the top.
    recordSpecUsage(picked.map((r) => r.code));
    // Emitted in the order the list shows them, so the rows land predictably rather than in
    // whatever order they happened to be clicked.
    onConfirm(picked);
  }

  /**
   * Opens the create panel pre-filled from an existing item.
   *
   * Most new items are a variant of one already on file: the same twine and mesh at a different
   * length, or the same panel a little heavier. Retyping six fields to change one is where wrong
   * numbers come from, so the pencil copies the row and leaves the code for the user to set. The
   * original is never touched, because it is quoted on documents that have already gone out.
   */
  function startFrom(row: SpecMasterRow) {
    setDraft({
      code: "",
      twine: row.twine,
      meshSize: row.meshSize === "—" ? "" : row.meshSize,
      meshDepth: row.meshDepth === "—" ? "" : row.meshDepth,
      length: row.length === "—" ? "" : row.length,
      weightPerPc: String(row.weightPerPc),
    });
    setCopiedFrom(row.code);
    setCreating(true);
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
    setCopiedFrom(null);
    setDraft({ code: "", twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
    pushToast({ tone: "success", title: "Specification created", description: `${row.code} added to the master.` });
  }

  return (
    <DataTableModal<SpecMasterRow>
      open={open}
      onClose={onClose}
      title={singleSelect ? "Replace Item" : "Item Selection"}
      subtitle={
        material && netType
          ? `${singleSelect ? "Pick the replacement. " : ""}Filtered to ${material} ${netType}`
          : undefined
      }
      rows={rows}
      rowKey={(r) => r.code}
      searchText={(r) => `${r.code} ${r.description} ${r.twine} ${r.meshSize} ${r.meshDepth} ${r.length}`}
      filters={[
        { key: "twine", label: "twines", value: (r) => r.twine },
        { key: "meshSize", label: "mesh sizes", value: (r) => r.meshSize },
        { key: "meshDepth", label: "mesh depths", value: (r) => r.meshDepth },
        { key: "length", label: "lengths", value: (r) => r.length },
      ]}
      columns={[
        { key: "code", header: "Code", render: (r) => <span className="font-mono text-pine-800">{r.code}</span>, width: "w-24" },
        // Description was dropped. The list is already filtered to one material and net type, so
        // every row carried the same sentence and the column bought nothing but width.
        { key: "twine", header: "Twine", render: (r) => <span className="font-mono">{r.twine}</span> },
        { key: "meshSize", header: "Mesh Size", render: (r) => r.meshSize, width: "w-24" },
        { key: "meshDepth", header: "Mesh Depth", render: (r) => r.meshDepth, width: "w-24" },
        { key: "length", header: "Length", render: (r) => r.length, width: "w-32" },
        { key: "weight", header: "Weight/PC", align: "right", render: (r) => r.weightPerPc.toFixed(2), width: "w-24" },
        {
          key: "edit",
          header: " ",
          width: "w-10",
          render: (r) => (
            <button
              onClick={(e) => {
                // Stops the row's own click, which would otherwise tick the checkbox as well.
                e.stopPropagation();
                startFrom(r);
              }}
              className="rounded p-1 text-paper-400 transition-colors hover:bg-white hover:text-manifest-700"
              title="Start a new item from this one"
              aria-label={`Start a new item from ${r.code}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ),
        },
      ]}
      selectedKeys={selected}
      onToggle={toggle}
      onConfirm={confirm}
      confirmLabel={singleSelect ? "Replace Item" : "Add Item"}
      emptyMessage={
        rows.length === 0
          ? "No items on file for this material and net type. Create one below."
          : "Nothing matches those filters."
      }
      headerAction={
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating((v) => !v)}>
          Create New Item
        </Button>
      }
    >
      {creating && (
        <div className="mb-3 rounded-lg border border-manifest-200 bg-manifest-50/50 p-3">
          <p className="mb-2 text-[11px] font-semibold text-manifest-900">
            New specification for {material} {netType}
          </p>
          {copiedFrom && (
            <p className="mb-2 text-[11px] leading-snug text-manifest-800">
              Copied from <span className="font-mono font-semibold">{copiedFrom}</span>. Change what differs and give it
              a new code. {copiedFrom} itself is not altered.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="Code" className={miniInput} />
            <input value={draft.twine} onChange={(e) => setDraft({ ...draft, twine: e.target.value })} placeholder="Twine" className={miniInput} />
            <input value={draft.meshSize} onChange={(e) => setDraft({ ...draft, meshSize: e.target.value })} placeholder="Mesh size" className={miniInput} />
            <input value={draft.meshDepth} onChange={(e) => setDraft({ ...draft, meshDepth: e.target.value })} placeholder="Mesh depth" className={miniInput} />
            <input value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} placeholder="Length" className={miniInput} />
            <input value={draft.weightPerPc} onChange={(e) => setDraft({ ...draft, weightPerPc: e.target.value })} placeholder="Weight/pc" type="number" min={0} step="0.01" className={miniInput} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setCopiedFrom(null);
              }}
            >
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
