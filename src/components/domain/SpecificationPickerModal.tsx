import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { DataTableModal } from "@/components/ui/DataTableModal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { findEquivalentSpec, nextSpecCode } from "@/lib/specMaster";
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
  excludeCodes = [],
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  material: string;
  netType: string;
  /** Replace mode: picking a code swaps one existing row, so only one may be selected. */
  singleSelect?: boolean;
  /** Codes already on the parent item, which are hidden rather than offered a second time. */
  excludeCodes?: string[];
  onConfirm: (rows: SpecMasterRow[]) => void;
}) {
  const { specMaster, addSpecMasterRow, recordSpecUsage, pushToast } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
  /** Which existing item the draft was copied from, purely so the panel can say so. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  /** The code this specification will be issued, shown before saving so it is never a surprise. */
  const assignedCode = nextSpecCode(specMaster, material, netType);

  useEffect(() => {
    if (open) {
      setSelected([]);
      setCreating(false);
      setCopiedFrom(null);
      setDraft({ twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
    }
  }, [open]);

  /**
   * Filtered to the parent item, listed by code.
   *
   * Deliberately a stable, predictable order. The list is something you scan and search; the order
   * things end up on the quotation is decided by the order you tick them, which is handled in
   * `confirm` below.
   */
  const forThisItem = useMemo(
    () =>
      specMaster
        .filter((r) => r.material === material && r.netType === netType)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [specMaster, material, netType]
  );

  /**
   * What is left to choose from.
   *
   * Codes already on the parent item are dropped: offering one again only invites a duplicate row
   * on the quotation. How many were dropped is reported below the list, because a list that is
   * quietly shorter than the catalog reads as missing data rather than as a filter doing its job.
   */
  const rows = useMemo(
    () => forThisItem.filter((r) => !excludeCodes.includes(r.code)),
    [forThisItem, excludeCodes]
  );
  const alreadyOnItem = forThisItem.length - rows.length;

  function toggle(code: string) {
    if (singleSelect) {
      setSelected((prev) => (prev.includes(code) ? [] : [code]));
      return;
    }
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function confirm() {
    /**
     * Emitted in the order they were ticked, not the order the table happens to list them.
     *
     * `selected` is appended to on each click, so it already holds the click sequence. Tick 1599,
     * then 1501, then 1535 and they land on the quotation in exactly that order. The person picking
     * is building the document as they go, and having the rows re-sorted underneath them means
     * dragging them back into place afterwards.
     */
    const picked = selected
      .map((code) => rows.find((r) => r.code === code))
      .filter((r): r is SpecMasterRow => Boolean(r));
    recordSpecUsage(picked.map((r) => r.code));
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
      twine: row.twine,
      meshSize: row.meshSize === "-" ? "" : row.meshSize,
      meshDepth: row.meshDepth === "-" ? "" : row.meshDepth,
      length: row.length === "-" ? "" : row.length,
      weightPerPc: String(row.weightPerPc),
    });
    setCopiedFrom(row.code);
    setCreating(true);
  }

  function saveNewSpec() {
    const weight = Number(draft.weightPerPc);
    if (!draft.twine.trim() || !Number.isFinite(weight) || weight <= 0) {
      pushToast({ tone: "warning", title: "Twine and a positive weight/pc are required" });
      return;
    }

    /**
     * Nothing changed, so nothing is created.
     *
     * Copying an item and saving it untouched means the net already exists on file. Minting a
     * second code for it would leave two codes describing one product, and quotations that no
     * longer reconcile against each other. The existing code is simply selected instead.
     */
    const twin = findEquivalentSpec(specMaster, {
      material,
      netType,
      twine: draft.twine.trim(),
      meshSize: draft.meshSize.trim() || "-",
      meshDepth: draft.meshDepth.trim() || "-",
      length: draft.length.trim() || "-",
      weightPerPc: weight,
    });
    if (twin) {
      setSelected((prev) => (prev.includes(twin.code) ? prev : [...prev, twin.code]));
      setCreating(false);
      setCopiedFrom(null);
      setDraft({ twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
      pushToast({
        tone: "info",
        title: `${twin.code} already covers this`,
        description: "Nothing was changed, so the existing item has been ticked instead of a duplicate created.",
      });
      return;
    }

    const row: SpecMasterRow = {
      // Issued here, not taken from the form. Recomputed at save rather than reusing what was
      // displayed, so two items created without closing the picker cannot land on one code.
      code: nextSpecCode(specMaster, material, netType),
      description: `${material} ${netType}`.toUpperCase(),
      material,
      netType,
      twine: draft.twine.trim(),
      meshSize: draft.meshSize.trim() || "-",
      meshDepth: draft.meshDepth.trim() || "-",
      length: draft.length.trim() || "-",
      weightPerPc: weight,
    };
    addSpecMasterRow(row);
    setSelected((prev) => [...prev, row.code]);
    setCreating(false);
    setCopiedFrom(null);
    setDraft({ twine: "", meshSize: "", meshDepth: "", length: "", weightPerPc: "" });
    pushToast({ tone: "success", title: "Specification created", description: `${row.code} added to the master.` });
  }

  return (
    <DataTableModal<SpecMasterRow>
      open={open}
      onClose={onClose}
      title={singleSelect ? "Replace Item" : "Item Selection"}
      subtitle={
        material && netType
          ? `${singleSelect ? "Pick the replacement. " : ""}Filtered to ${material} ${netType}` +
            (alreadyOnItem > 0
              ? ` · ${alreadyOnItem} already on this quotation ${alreadyOnItem === 1 ? "is" : "are"} not shown`
              : "")
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
        {
          key: "code",
          header: "Code",
          width: "w-28",
          render: (r) => {
            // The pick number, shown as you go. Without it the order is invisible until the rows
            // land on the quotation, which is too late to notice two were ticked the wrong way
            // round.
            const pickedAt = selected.indexOf(r.code);
            return (
              <span className="flex items-center gap-1.5">
                {pickedAt >= 0 && !singleSelect && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-manifest-600 text-[9px] font-bold text-white">
                    {pickedAt + 1}
                  </span>
                )}
                <span className="font-mono text-pine-800">{r.code}</span>
              </span>
            );
          },
        },
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
      // While the create panel is open, clicking a row copies it into the form instead of ticking
      // it. Building a new net almost always means "one of these, but longer", and retyping five
      // fields to change one is both slow and where wrong numbers come from. The checkboxes still
      // select, so nothing is taken away.
      onRowClick={creating ? startFrom : undefined}
      onConfirm={confirm}
      confirmLabel={singleSelect ? "Replace Item" : "Add Item"}
      emptyMessage={
        forThisItem.length === 0
          ? "No items on file for this material and net type. Create one below."
          : rows.length === 0
            ? "Every item on file for this material and net type is already on this quotation. Create a new one to add something else."
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
          <p className="mb-1 text-[11px] font-semibold text-manifest-900">
            New specification for {material} {netType}
          </p>
          {!copiedFrom && (
            <p className="mb-2 text-[11px] leading-snug text-manifest-800">
              Click any item in the list below to copy its details up here, then change what differs. Use the
              checkboxes if you meant to select one instead.
            </p>
          )}
          {copiedFrom && (
            <p className="mb-2 text-[11px] leading-snug text-manifest-800">
              Copied from <span className="font-mono font-semibold">{copiedFrom}</span>. Change whatever differs. The
              code is issued for you. {copiedFrom} itself is not altered, and if you change nothing it will simply be
              reused rather than duplicated.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input value={draft.twine} onChange={(e) => setDraft({ ...draft, twine: e.target.value })} placeholder="Twine" className={miniInput} />
            <input value={draft.meshSize} onChange={(e) => setDraft({ ...draft, meshSize: e.target.value })} placeholder="Mesh size" className={miniInput} />
            <input value={draft.meshDepth} onChange={(e) => setDraft({ ...draft, meshDepth: e.target.value })} placeholder="Mesh depth" className={miniInput} />
            <input value={draft.length} onChange={(e) => setDraft({ ...draft, length: e.target.value })} placeholder="Length" className={miniInput} />
            <input value={draft.weightPerPc} onChange={(e) => setDraft({ ...draft, weightPerPc: e.target.value })} placeholder="Weight/pc" type="number" min={0} step="0.01" className={miniInput} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            {/* The code is issued, not typed, so it is shown rather than asked for. Anyone about
                to save can see what they are about to create. */}
            <span className="mr-auto text-[11px] text-manifest-800">
              Will be saved as <span className="font-mono font-semibold">{assignedCode}</span>
            </span>
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
