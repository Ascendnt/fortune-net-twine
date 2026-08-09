import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PackageCheck, Search, Plus, Trash2, Lock, Unlock, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { reconcilePacking, sectionTotals, verifyPacking } from "@/lib/packing";
import type { PackingList, ShipmentScope } from "@/lib/types";
import clsx from "clsx";

// Packing is a verification screen, not a carton designer. Its job is to answer one question before
// the goods leave: does what we are shipping match what the customer bought? The plant sends its
// details in whatever shape the job took, so the rows are free-form and grouped into sections the
// user names, and the reconciliation against the order is what the screen actually asserts.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

const SCOPES: { id: ShipmentScope; label: string; help: string }[] = [
  { id: "full", label: "Full shipment", help: "Everything on the order goes in this one load." },
  { id: "partial", label: "Partial shipment", help: "Part of the order now, the rest to follow." },
  { id: "final", label: "Final shipment", help: "The last load. Everything outstanding must be on it." },
];

export function PackingPage() {
  const {
    packingLists,
    salesOrders,
    quotations,
    customers,
    createPackingList,
    updatePackingList,
    removePackingList,
    addPackingSection,
    updatePackingSection,
    removePackingSection,
    addPackingLine,
    updatePackingLine,
    removePackingLine,
    finalizePackingList,
    reopenPackingList,
    pushToast,
  } = useStore();

  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [openFilter, setOpenFilter] = useState<"all" | "open" | "closed">("all");
  const [creating, setCreating] = useState<{ salesOrderId: string; scope: ShipmentScope } | null>(null);
  const [confirmClose, setConfirmClose] = useState<PackingList | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PackingList | null>(null);

  /** Orders that have reached packing and are not yet completed. */
  const packableOrders = useMemo(
    () => salesOrders.filter((o) => o.currentStage === "packing" || o.currentStage === "deposit"),
    [salesOrders]
  );

  const orderItems = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const quotation = order?.quotationId ? quotations.find((q) => q.id === order.quotationId) : undefined;
    return quotation?.items ?? [];
  };

  /** Reconciliation counts every list on the order, so a partial is not mistaken for a shortfall. */
  const reconcileFor = (salesOrderId: string) =>
    reconcilePacking(
      orderItems(salesOrderId),
      packingLists.filter((p) => p.salesOrderId === salesOrderId)
    );

  const customerOf = (list: PackingList) => {
    const order = salesOrders.find((o) => o.id === list.salesOrderId);
    return customers.find((c) => c.id === (list.customerId || order?.customerId));
  };

  const visible = useMemo(() => {
    return packingLists.filter((l) => {
      if (openFilter === "open" && l.finalizedDate) return false;
      if (openFilter === "closed" && !l.finalizedDate) return false;
      const cust = customerOf(l);
      if (customerFilter !== "all" && cust?.id !== customerFilter) return false;
      if (query) {
        const haystack = `${l.id} ${l.salesOrderId} ${cust?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
    // eslint-disable-next-line
  }, [packingLists, openFilter, customerFilter, query, salesOrders, customers]);

  const stats = useMemo(() => {
    const open = packingLists.filter((l) => !l.finalizedDate).length;
    const gross = packingLists.reduce((s, l) => s + sectionTotals(l.sections ?? []).grossKg, 0);
    const partials = packingLists.filter((l) => l.scope === "partial" && !l.finalizedDate).length;
    return { open, gross, partials };
  }, [packingLists]);

  function handleClose(list: PackingList) {
    const verdict = verifyPacking(reconcileFor(list.salesOrderId), list.scope);
    if (!verdict.ok) {
      pushToast({ tone: "warning", title: "Cannot close this list", description: verdict.message });
      return;
    }
    setConfirmClose(list);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Outbound Preparation"
        title="Packing List"
        description="Record what is going in the container and check it against the order before it leaves."
      />

      <HowToUse
        id="packing-v2"
        steps={[
          "Press Create packing list on the order you are packing, and say whether this load is the full order, a partial, or the final one.",
          "Add sections in whatever shape the plant sent you: by container, by bundle, by batch. Name them however makes sense.",
          "Inside a section, press Add from order to pull a line off the order, or Add blank row to type one in by hand.",
          "Watch the Order check panel. It counts every list on this order together, so a partial shows what is still outstanding rather than reading as a shortfall.",
          "When the load is right, press Close list. A full or final list cannot close while it is short, and no list can close with more packed than ordered.",
          "Closing opens the inspection, where the goods are weighed and the order value is settled.",
        ]}
        note="Made a mistake after closing? Press Reopen, correct it, and close again."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Open packing lists" value={String(stats.open)} tone="amber" />
        <StatCard label="Partial loads open" value={String(stats.partials)} />
        <StatCard label="Total gross weight" value={`${stats.gross.toFixed(2)} KG`} />
      </div>

      {packableOrders.length > 0 && (
        <Card className="mb-4 border-manifest-200 bg-manifest-50/40">
          <CardHeader
            title="Orders ready to pack"
            eyebrow="Start here"
            subtitle="An order can have more than one list. Open another whenever a further load goes out."
          />
          <div className="space-y-2">
            {packableOrders.map((o) => {
              const rows = reconcileFor(o.id);
              const outstanding = rows.filter((r) => r.variance < 0).length;
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link to={`/orders/${o.id}`} className="font-mono text-xs font-semibold text-manifest-600 hover:underline">
                      {o.id}
                    </Link>
                    <span className="ml-2 text-sm text-paper-700">{o.consignee}</span>
                    <p className="text-[11px] text-paper-400">
                      {outstanding === 0
                        ? "Everything on this order is packed."
                        : `${outstanding} item${outstanding === 1 ? "" : "s"} still to pack.`}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setCreating({ salesOrderId: o.id, scope: outstanding === 0 ? "final" : "partial" })}
                  >
                    Create packing list
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search list, order or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          {(["all", "open", "closed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setOpenFilter(f)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                openFilter === f
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<PackageCheck className="h-5 w-5" />}
          title="No packing lists match your filters"
          description="Lists appear here once you create one against an order that has reached packing."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((list) => {
            const closed = Boolean(list.finalizedDate);
            const cust = customerOf(list);
            const rows = reconcileFor(list.salesOrderId);
            const verdict = verifyPacking(rows, list.scope);
            const totals = sectionTotals(list.sections ?? []);
            const items = orderItems(list.salesOrderId);
            return (
              <Card key={list.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-paper-400">
                      {list.id} · {SCOPES.find((s) => s.id === list.scope)?.label ?? list.scope}
                      {closed && ` · closed ${formatDate(list.finalizedDate)}`}
                    </p>
                    <p className="text-sm font-semibold text-paper-900">
                      <Link to={`/orders/${list.salesOrderId}`} className="font-mono text-manifest-600 hover:underline">
                        {list.salesOrderId}
                      </Link>{" "}
                      {cust?.name ?? "—"}
                    </p>
                    <p className="text-[11px] text-paper-400">
                      Packed by {list.packedBy} · {totals.pieces} pcs · net {totals.netKg.toFixed(2)} KG · gross{" "}
                      {totals.grossKg.toFixed(2)} KG
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {closed ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Unlock className="h-3.5 w-3.5" />}
                        onClick={() => reopenPackingList(list.id)}
                      >
                        Reopen
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Lock className="h-3.5 w-3.5" />}
                          onClick={() => handleClose(list)}
                        >
                          Close list
                        </Button>
                        <button
                          onClick={() => setConfirmDelete(list)}
                          className="rounded p-1.5 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                          aria-label={`Delete ${list.id}`}
                          title="Delete this packing list"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* The check that justifies this screen existing. Shown before the rows, because it
                    is the answer the user came for. */}
                <div
                  className={clsx(
                    "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                    verdict.ok ? "border-pine-200 bg-pine-50 text-pine-800" : "border-amber-200 bg-amber-50 text-amber-800"
                  )}
                >
                  {verdict.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{verdict.message}</span>
                </div>

                <details className="mb-3 rounded-lg border border-paper-200">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-paper-600">
                    Order check — every list on {list.salesOrderId} counted together
                  </summary>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-t border-paper-100 text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                        <th className="px-3 py-1.5">Item</th>
                        <th className="w-20 px-2 py-1.5 text-right">Ordered</th>
                        <th className="w-20 px-2 py-1.5 text-right">Packed</th>
                        <th className="w-24 px-2 py-1.5 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.itemId} className="border-t border-paper-100">
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-pine-800">{r.itemCode}</span>
                            {r.orderedQty === 0 && (
                              <span className="ml-2 rounded bg-alert-100 px-1.5 py-0.5 text-[10px] text-alert-700">
                                not on this order
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.orderedQty}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.packedQty}</td>
                          <td
                            className={clsx(
                              "px-2 py-1.5 text-right font-mono",
                              r.variance < 0 && "text-amber-700",
                              r.variance > 0 && "font-semibold text-alert-600",
                              r.variance === 0 && "text-pine-700"
                            )}
                          >
                            {r.variance === 0 ? "—" : r.variance > 0 ? `+${r.variance}` : r.variance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>

                <div className="space-y-3">
                  {(list.sections ?? []).map((section) => (
                    <div key={section.id} className="rounded-lg border border-paper-200">
                      <div className="flex items-center gap-2 border-b border-paper-100 bg-paper-50/70 px-2.5 py-1.5">
                        <input
                          value={section.title}
                          disabled={closed}
                          onChange={(e) => updatePackingSection(list.id, section.id, e.target.value)}
                          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-paper-800 hover:border-paper-200 focus:border-manifest-400 focus:bg-white focus:outline-none disabled:hover:border-transparent"
                        />
                        {!closed && (
                          <button
                            onClick={() => removePackingSection(list.id, section.id)}
                            className="rounded p-1 text-paper-400 hover:bg-white hover:text-alert-600"
                            aria-label="Remove section"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                            <th className="w-40 px-2 py-1.5">Item code</th>
                            <th className="px-2 py-1.5">Mark / description</th>
                            <th className="w-16 px-2 py-1.5 text-right">Pcs</th>
                            <th className="w-24 px-2 py-1.5 text-right">Net KG</th>
                            <th className="w-24 px-2 py-1.5 text-right">Gross KG</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {section.lines.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-2 py-3 text-center text-[11px] text-paper-400">
                                Nothing in this section yet.
                              </td>
                            </tr>
                          )}
                          {section.lines.map((line) => (
                            <tr key={line.id} className="border-t border-paper-100">
                              <td className="px-2 py-1">
                                <input
                                  value={line.itemCode}
                                  disabled={closed}
                                  onChange={(e) =>
                                    updatePackingLine(list.id, section.id, line.id, { itemCode: e.target.value })
                                  }
                                  className={clsx(input, "font-mono")}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  value={line.description}
                                  disabled={closed}
                                  onChange={(e) =>
                                    updatePackingLine(list.id, section.id, line.id, { description: e.target.value })
                                  }
                                  className={input}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={line.qtyPcs}
                                  disabled={closed}
                                  onChange={(e) =>
                                    updatePackingLine(list.id, section.id, line.id, {
                                      qtyPcs: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className={clsx(input, "text-right font-mono")}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.netWeightKg}
                                  disabled={closed}
                                  onChange={(e) =>
                                    updatePackingLine(list.id, section.id, line.id, {
                                      netWeightKg: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className={clsx(input, "text-right font-mono")}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.grossWeightKg}
                                  disabled={closed}
                                  onChange={(e) =>
                                    updatePackingLine(list.id, section.id, line.id, {
                                      grossWeightKg: Math.max(0, Number(e.target.value) || 0),
                                    })
                                  }
                                  className={clsx(input, "text-right font-mono")}
                                />
                              </td>
                              <td className="px-1 py-1">
                                {!closed && (
                                  <button
                                    onClick={() => removePackingLine(list.id, section.id, line.id)}
                                    className="rounded p-1 text-paper-400 hover:text-alert-600"
                                    aria-label="Remove row"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {!closed && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-paper-100 px-2.5 py-2">
                          <span className="text-[11px] text-paper-400">Add from order:</span>
                          {items.length === 0 && <span className="text-[11px] text-paper-300">No order lines found.</span>}
                          {items.map((li) => (
                            <button
                              key={li.id}
                              onClick={() =>
                                addPackingLine(list.id, section.id, {
                                  itemId: li.id,
                                  itemCode: li.itemCode,
                                  description: li.description,
                                  qtyPcs: 0,
                                  netWeightKg: 0,
                                  grossWeightKg: 0,
                                })
                              }
                              className="rounded-full border border-paper-200 px-2 py-1 font-mono text-[10.5px] text-pine-800 hover:border-manifest-400 hover:bg-manifest-50"
                            >
                              + {li.itemCode}
                            </button>
                          ))}
                          <button
                            onClick={() =>
                              addPackingLine(list.id, section.id, {
                                itemCode: "",
                                description: "",
                                qtyPcs: 0,
                                netWeightKg: 0,
                                grossWeightKg: 0,
                              })
                            }
                            className="ml-auto rounded-full border border-dashed border-paper-300 px-2.5 py-1 text-[10.5px] text-paper-500 hover:border-manifest-400 hover:text-manifest-700"
                          >
                            + Add blank row
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!closed && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => addPackingSection(list.id, "")}
                    >
                      Add section
                    </Button>
                    <select
                      value={list.scope}
                      onChange={(e) => updatePackingList(list.id, { scope: e.target.value as ShipmentScope })}
                      className="rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-xs"
                      title="What this load covers"
                    >
                      {SCOPES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <input
                  value={list.remarks ?? ""}
                  disabled={closed}
                  onChange={(e) => updatePackingList(list.id, { remarks: e.target.value })}
                  placeholder="Packing remarks, marks and numbers, strapping…"
                  className="mt-3 w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                />
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={creating !== null}
        onClose={() => setCreating(null)}
        title="Create packing list"
        subtitle={creating ? `Against ${creating.salesOrderId}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreating(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!creating) return;
                const id = createPackingList(creating.salesOrderId, creating.scope);
                pushToast({ tone: "success", title: "Packing list created", description: id });
                setCreating(null);
              }}
            >
              Create list
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-paper-500">What does this load cover?</p>
          {SCOPES.map((s) => (
            <label
              key={s.id}
              className={clsx(
                "flex cursor-pointer items-start gap-2 rounded-lg border p-3",
                creating?.scope === s.id ? "border-manifest-400 bg-manifest-50/50" : "border-paper-200"
              )}
            >
              <input
                type="radio"
                checked={creating?.scope === s.id}
                onChange={() => setCreating((c) => (c ? { ...c, scope: s.id } : c))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-paper-800">{s.label}</span>
                <span className="block text-[11px] text-paper-500">{s.help}</span>
              </span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={confirmClose !== null}
        onClose={() => setConfirmClose(null)}
        title={`Close ${confirmClose?.id}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmClose(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (confirmClose) {
                  finalizePackingList(confirmClose.id);
                  pushToast({
                    tone: "success",
                    title: "Packing list closed",
                    description: "Inspection is open. Weigh the goods there to settle the order value.",
                  });
                }
                setConfirmClose(null);
              }}
            >
              Close list
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          The weights on this list are the ones printed on the invoice and the bill of lading. Closing opens the
          inspection for this order, where the goods are weighed and the order value is settled. You can reopen the list
          afterwards if something needs correcting.
        </p>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.id}?`}
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
                  removePackingList(confirmDelete.id);
                  pushToast({ tone: "info", title: "Packing list deleted", description: confirmDelete.id });
                }
                setConfirmDelete(null);
              }}
            >
              Delete list
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Everything recorded on this list is removed, and the quantities on it stop counting towards the order.
        </p>
      </Modal>
    </div>
  );
}
