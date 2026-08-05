import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { useStore } from "@/lib/store";
import { SPEC_MATERIALS, SPEC_NET_TYPES } from "@/lib/specOptions";
import type { LacingCatalogRow, SpecMasterRow } from "@/lib/specMaster";

// Master data maintenance. The specification catalog and the lacing catalog drive every price and
// weight on a quotation, so the client needs to add, correct and retire rows themselves rather than
// waiting on a developer — that is the whole point of the self-service brief.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const label = "mb-1 block text-xs font-medium text-paper-600";

type Tab = "specs" | "lacing";

const EMPTY_SPEC: SpecMasterRow = {
  code: "",
  description: "",
  material: "Nylon",
  netType: "Braided Net",
  twine: "",
  meshSize: "",
  meshDepth: "",
  length: "",
  weightPerPc: 0,
};

const EMPTY_LACING: LacingCatalogRow = { code: "", description: "", kind: "twine", defaultRate: 2.5 };

export function MasterDataPage() {
  const [tab, setTab] = useState<Tab>("specs");

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Master Data"]}
        eyebrow="Catalog Maintenance"
        title="Master Data"
        description="The specification and lacing catalogs behind every quotation. Add, edit and retire rows here — changes apply immediately and are saved in this browser."
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-paper-200 bg-white p-1">
        {(
          [
            ["specs", "Item Specifications"],
            ["lacing", "Lacing Catalog"],
          ] as [Tab, string][]
        ).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === key ? "bg-pine-700 text-white" : "text-paper-600 hover:bg-paper-50"
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "specs" ? <SpecTab /> : <LacingTab />}

      <div className="mt-5">
        <ProcessDiscoveryNote
          items={[
            "Specification codes beyond N-1595…N-1603 are extrapolated from the families in the item master — the factory's real export should replace them before any live use.",
            "Deleting a specification does not touch quotations that already reference it; their saved lines keep their own weight and price snapshot.",
            "Lacing rates default to 2.50/kg from the simulation sample; a per-code rate card is still to be confirmed.",
          ]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Item specifications
// ---------------------------------------------------------------------------------------------

function SpecTab() {
  const { specMaster, addSpecMasterRow, updateSpecMasterRow, removeSpecMasterRow, pushToast } = useStore();
  const [search, setSearch] = useState("");
  const [material, setMaterial] = useState("");
  const [netType, setNetType] = useState("");
  const [editing, setEditing] = useState<SpecMasterRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SpecMasterRow | null>(null);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return specMaster.filter((r) => {
      if (material && r.material !== material) return false;
      if (netType && r.netType !== netType) return false;
      if (!needle) return true;
      return `${r.code} ${r.description} ${r.twine} ${r.meshSize} ${r.meshDepth} ${r.length}`.toLowerCase().includes(needle);
    });
  }, [specMaster, search, material, netType]);

  function save(row: SpecMasterRow) {
    if (!row.code.trim() || !row.twine.trim()) {
      pushToast({ tone: "warning", title: "Code and twine are required" });
      return;
    }
    if (!Number.isFinite(row.weightPerPc) || row.weightPerPc <= 0) {
      pushToast({ tone: "warning", title: "Weight/pc must be greater than zero" });
      return;
    }
    const normalized: SpecMasterRow = {
      ...row,
      code: row.code.trim().toUpperCase(),
      description: `${row.material} ${row.netType}`.toUpperCase(),
    };
    if (isNew) {
      if (specMaster.some((r) => r.code === normalized.code)) {
        pushToast({ tone: "warning", title: "That code already exists" });
        return;
      }
      addSpecMasterRow(normalized);
      pushToast({ tone: "success", title: "Specification added", description: normalized.code });
    } else {
      updateSpecMasterRow(normalized.code, normalized);
      pushToast({ tone: "success", title: "Specification updated", description: normalized.code });
    }
    setEditing(null);
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Item Specifications"
          eyebrow={`${specMaster.length} codes on file`}
          subtitle="Each code carries the WEIGHT/PC that drives a quotation line's weight and price per piece."
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setIsNew(true);
                setEditing({ ...EMPTY_SPEC });
              }}
            >
              Add Specification
            </Button>
          }
        />

        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, twine, mesh…"
              className={clsx(input, "pl-8")}
            />
          </div>
          <select value={material} onChange={(e) => setMaterial(e.target.value)} className="rounded-lg border border-paper-200 bg-white px-2 py-2 text-xs">
            <option value="">All materials</option>
            {SPEC_MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={netType} onChange={(e) => setNetType(e.target.value)} className="rounded-lg border border-paper-200 bg-white px-2 py-2 text-xs">
            <option value="">All net types</option>
            {SPEC_NET_TYPES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-paper-200">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                <th className="w-24 px-2 py-2">Code</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Twine</th>
                <th className="w-24 px-2 py-2">Mesh size</th>
                <th className="w-24 px-2 py-2">Mesh depth</th>
                <th className="w-32 px-2 py-2">Length</th>
                <th className="w-24 px-2 py-2 text-right">Weight/pc</th>
                <th className="w-20 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-paper-400">
                    No specifications match those filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-paper-100 last:border-0 hover:bg-paper-50">
                  <td className="px-2 py-1.5 font-mono text-pine-800">{r.code}</td>
                  <td className="px-2 py-1.5 text-paper-600">{r.description}</td>
                  <td className="px-2 py-1.5 font-mono text-paper-600">{r.twine}</td>
                  <td className="px-2 py-1.5 text-paper-600">{r.meshSize}</td>
                  <td className="px-2 py-1.5 text-paper-600">{r.meshDepth}</td>
                  <td className="px-2 py-1.5 text-paper-600">{r.length}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.weightPerPc.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setIsNew(false);
                          setEditing({ ...r });
                        }}
                        className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-manifest-700"
                        aria-label={`Edit ${r.code}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                        aria-label={`Delete ${r.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-paper-400">
          Showing {rows.length} of {specMaster.length}
        </p>
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "Add specification" : `Edit ${editing?.code}`}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => editing && save(editing)}>
              {isNew ? "Add specification" : "Save changes"}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Code</label>
              <input
                value={editing.code}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                className={clsx(input, !isNew && "bg-paper-50 text-paper-500")}
                placeholder="N-1596"
              />
              {!isNew && <p className="mt-1 text-[10.5px] text-paper-400">Codes are the catalog key and can't be renamed.</p>}
            </div>
            <div>
              <label className={label}>Weight / pc (kg)</label>
              <input
                type="number"
                step="0.01"
                value={editing.weightPerPc}
                onChange={(e) => setEditing({ ...editing, weightPerPc: Number(e.target.value) })}
                className={input}
              />
            </div>
            <div>
              <label className={label}>Material</label>
              <select value={editing.material} onChange={(e) => setEditing({ ...editing, material: e.target.value })} className={input}>
                {SPEC_MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Net type</label>
              <select value={editing.netType} onChange={(e) => setEditing({ ...editing, netType: e.target.value })} className={input}>
                {SPEC_NET_TYPES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Twine</label>
              <input value={editing.twine} onChange={(e) => setEditing({ ...editing, twine: e.target.value })} className={input} placeholder="NO.120(210/22x16)" />
            </div>
            <div>
              <label className={label}>Mesh size</label>
              <input value={editing.meshSize} onChange={(e) => setEditing({ ...editing, meshSize: e.target.value })} className={input} placeholder={'3-1/2"STR'} />
            </div>
            <div>
              <label className={label}>Mesh depth</label>
              <input value={editing.meshDepth} onChange={(e) => setEditing({ ...editing, meshDepth: e.target.value })} className={input} placeholder="122MD" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Length</label>
              <input value={editing.length} onChange={(e) => setEditing({ ...editing, length: e.target.value })} className={input} placeholder="70FL(1656ML)" />
            </div>
            <p className="sm:col-span-2 rounded-lg bg-paper-50 px-3 py-2 text-[11px] text-paper-500">
              Mesh depth and length also drive the MD and Depth-Way pricing lookups, so keep the "122MD" / "70FL" figures
              in them.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.code}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirmDelete) {
                  removeSpecMasterRow(confirmDelete.code);
                  pushToast({ tone: "info", title: "Specification deleted", description: confirmDelete.code });
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          It will stop appearing in the Add Specification picker. Quotations that already use it keep their own saved
          weight and pricing.
        </p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Lacing catalog
// ---------------------------------------------------------------------------------------------

function LacingTab() {
  const { lacingCatalog, addLacingRow, updateLacingRow, removeLacingRow, pushToast } = useStore();
  const [editing, setEditing] = useState<LacingCatalogRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LacingCatalogRow | null>(null);

  function save(row: LacingCatalogRow) {
    if (!row.code.trim() || !row.description.trim()) {
      pushToast({ tone: "warning", title: "Code and description are required" });
      return;
    }
    const normalized = { ...row, code: row.code.trim().toUpperCase(), description: row.description.trim() };
    if (isNew) {
      if (lacingCatalog.some((r) => r.code === normalized.code)) {
        pushToast({ tone: "warning", title: "That code already exists" });
        return;
      }
      addLacingRow(normalized);
      pushToast({ tone: "success", title: "Lacing row added", description: normalized.code });
    } else {
      updateLacingRow(normalized.code, normalized);
      pushToast({ tone: "success", title: "Lacing row updated", description: normalized.code });
    }
    setEditing(null);
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Lacing Catalog"
          eyebrow={`${lacingCatalog.length} codes on file`}
          subtitle="Twine rows bill KGS × rate and add to Total Weight. Charge rows are a flat amount and add no weight."
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setIsNew(true);
                setEditing({ ...EMPTY_LACING });
              }}
            >
              Add Lacing Code
            </Button>
          }
        />

        <div className="overflow-x-auto rounded-lg border border-paper-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                <th className="w-28 px-2 py-2">Code</th>
                <th className="px-2 py-2">Description</th>
                <th className="w-28 px-2 py-2">Type</th>
                <th className="w-28 px-2 py-2 text-right">Default rate</th>
                <th className="w-20 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lacingCatalog.map((r) => (
                <tr key={r.code} className="border-b border-paper-100 last:border-0 hover:bg-paper-50">
                  <td className="px-2 py-1.5 font-mono text-pine-800">{r.code}</td>
                  <td className="px-2 py-1.5 text-paper-600">{r.description}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        r.kind === "twine" ? "bg-pine-100 text-pine-800" : "bg-paper-100 text-paper-600"
                      )}
                    >
                      {r.kind === "twine" ? "Twine · adds weight" : "Charge · no weight"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.defaultRate.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setIsNew(false);
                          setEditing({ ...r });
                        }}
                        className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-manifest-700"
                        aria-label={`Edit ${r.code}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                        aria-label={`Delete ${r.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "Add lacing code" : `Edit ${editing?.code}`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => editing && save(editing)}>
              {isNew ? "Add lacing code" : "Save changes"}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div>
              <label className={label}>Code</label>
              <input
                value={editing.code}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                className={clsx(input, !isNew && "bg-paper-50 text-paper-500")}
                placeholder="LC-007"
              />
            </div>
            <div>
              <label className={label}>Description</label>
              <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Type</label>
              <select
                value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as LacingCatalogRow["kind"] })}
                className={input}
              >
                <option value="twine">Twine — priced by the kilo, adds to Total Weight</option>
                <option value="charge">Charge — flat amount, adds no weight</option>
              </select>
            </div>
            <div>
              <label className={label}>{editing.kind === "twine" ? "Default rate per kg" : "Default charge amount"}</label>
              <input
                type="number"
                step="0.01"
                value={editing.defaultRate}
                onChange={(e) => setEditing({ ...editing, defaultRate: Number(e.target.value) })}
                className={input}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.code}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirmDelete) {
                  removeLacingRow(confirmDelete.code);
                  pushToast({ tone: "info", title: "Lacing row deleted", description: confirmDelete.code });
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          It will stop appearing in the Lacing Selection picker. Existing quotation lines are unaffected.
        </p>
      </Modal>
    </>
  );
}
