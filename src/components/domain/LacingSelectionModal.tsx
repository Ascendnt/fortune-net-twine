import { useEffect, useState } from "react";
import { DataTableModal } from "@/components/ui/DataTableModal";
import { useStore } from "@/lib/store";
import type { LacingCatalogRow } from "@/lib/specMaster";

// Lacing Selection (doc §3.7). LC-001…LC-005 are twines priced by the kilo and add to Total
// Weight; LC-006 is a flat charge that adds an amount but no weight.
export function LacingSelectionModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: LacingCatalogRow[]) => void;
}) {
  const { lacingCatalog } = useStore();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  return (
    <DataTableModal<LacingCatalogRow>
      open={open}
      onClose={onClose}
      title="Lacing Selection"
      rows={lacingCatalog}
      rowKey={(r) => r.code}
      width="max-w-2xl"
      searchText={(r) => `${r.code} ${r.description}`}
      filters={[{ key: "kind", label: "types", value: (r) => (r.kind === "twine" ? "Twine" : "Charge") }]}
      columns={[
        { key: "code", header: "Code", render: (r) => <span className="font-mono text-pine-800">{r.code}</span>, width: "w-28" },
        { key: "description", header: "Description", render: (r) => r.description },
        {
          key: "kind",
          header: "Adds weight",
          align: "right",
          width: "w-28",
          render: (r) => <span className={r.kind === "twine" ? "text-pine-700" : "text-paper-400"}>{r.kind === "twine" ? "Yes" : "No"}</span>,
        },
      ]}
      selectedKeys={selected}
      onToggle={(code) => setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))}
      onConfirm={() => onConfirm(lacingCatalog.filter((r) => selected.includes(r.code)))}
      confirmLabel="Add Lacing"
    />
  );
}
