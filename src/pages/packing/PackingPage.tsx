import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PackageCheck, Plus, Trash2, Lock, Search, Unlock } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { NON_NEGATIVE, NON_NEGATIVE_INT, toNonNegative } from "@/lib/num";

// Packing turns finished pieces into cartons with real weights. Those weights matter beyond this
// screen: the gross figure is what the shipment and the bill of lading carry, and the net is what
// the commercial invoice bills against. Quoted weights are estimates; these are measured.

const mini =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function PackingPage() {
  const {
    salesOrders,
    packingLists,
    customers,
    productionRuns,
    createPackingList,
    addCarton,
    removeCarton,
    updatePackingList,
    finalizePackingList,
    pushToast,
  } = useStore();

  const [draft, setDraft] = useState({ markNo: "", itemCode: "", qtyPcs: 1, netWeightKg: 0, grossWeightKg: 0 });
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const [filter, setFilter] = useState<"open" | "all" | "closed">("all");
  const [query, setQuery] = useState("");

  // Orders that are packing now, plus any that already have a list.
  const orders = useMemo(() => {
    const base = salesOrders.filter(
      (so) => so.currentStage === "packing" || packingLists.some((p) => p.salesOrderId === so.id)
    );
    return base.filter((so) => {
      const list = packingLists.find((p) => p.salesOrderId === so.id);
      if (filter === "open" && list?.finalizedDate) return false;
      if (filter === "closed" && !list?.finalizedDate) return false;
      if (!query) return true;
      const name = customers.find((c) => c.id === so.customerId)?.name ?? "";
      return `${so.id} ${name} ${list?.id ?? ""}`.toLowerCase().includes(query.toLowerCase());
    });
  }, [salesOrders, packingLists, filter, query, customers]);

  const stats = useMemo(() => {
    const open = packingLists.filter((p) => !p.finalizedDate).length;
    const cartons = packingLists.reduce((s, p) => s + p.cartons.length, 0);
    const gross = packingLists.reduce((s, p) => s + p.cartons.reduce((t, c) => t + c.grossWeightKg, 0), 0);
    return { open, cartons, gross };
  }, [packingLists]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Outbound Preparation"
        title="Packing"
        description="Cartons, marks and measured weights. These figures carry through to the invoice and the bill of lading."
      />

      <HowToUse
        id="packing"
        steps={[
          "Find the order. Orders appear here once Production has been completed.",
          "Press Create packing list, then Add carton for each carton or bale.",
          "For every carton, type the mark written on it, the item code, how many pieces are inside, and weigh it for the net and gross figures.",
          "When everything is packed, press Close list. The order then moves to Final Payment and an inspection is opened.",
        ]}
        note="Made a mistake after closing? Press Reopen, correct it, and close it again. The weights you enter here are the ones printed on the invoice and the bill of lading, so weigh rather than estimate."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Open packing lists" value={String(stats.open)} tone="amber" />
        <StatCard label="Cartons packed" value={String(stats.cartons)} />
        <StatCard label="Total gross weight" value={`${stats.gross.toFixed(2)} KG`} tone="pine" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order, customer or packing list…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              ["all", "All"],
              ["open", "Open"],
              ["closed", "Closed"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === id
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<PackageCheck className="h-5 w-5" />}
          title="Nothing waiting to be packed"
          description="Orders arrive here once production is completed on the Production screen."
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const list = packingLists.find((p) => p.salesOrderId === order.id);
            const runs = productionRuns.filter((r) => r.salesOrderId === order.id);
            const net = list?.cartons.reduce((s, c) => s + c.netWeightKg, 0) ?? 0;
            const gross = list?.cartons.reduce((s, c) => s + c.grossWeightKg, 0) ?? 0;
            const packedPcs = list?.cartons.reduce((s, c) => s + c.qtyPcs, 0) ?? 0;
            const availablePcs = runs.reduce((s, r) => s + r.qtyCompleted, 0);
            const locked = Boolean(list?.finalizedDate);

            return (
              <Card key={order.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Link to={`/orders/${order.id}`} className="font-mono text-manifest-600 hover:underline">
                        {order.id}
                      </Link>
                      <span className="text-sm font-normal text-paper-500">{customerName(order.customerId)}</span>
                    </span>
                  }
                  eyebrow={
                    list
                      ? `${list.id} · ${packedPcs} of ${availablePcs} pcs packed${locked ? " · closed" : ""}`
                      : "No packing list yet"
                  }
                  action={
                    !list ? (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => {
                          const id = createPackingList(order.id);
                          pushToast({ tone: "success", title: "Packing list created", description: id });
                        }}
                      >
                        Create packing list
                      </Button>
                    ) : locked ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-full bg-pine-50 px-2.5 py-1 text-[11px] font-medium text-pine-800">
                          <Lock className="h-3 w-3" /> Closed {formatDate(list.finalizedDate!)}
                        </span>
                        {/* Closing a list by mistake, or needing to correct a weight after the
                            fact, is ordinary. Reopening is a normal correction, not a developer
                            job, so it lives here rather than in a support request. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Unlock className="h-3.5 w-3.5" />}
                          onClick={() => {
                            updatePackingList(list.id, { finalizedDate: undefined });
                            pushToast({
                              tone: "info",
                              title: "Packing list reopened",
                              description: `${list.id} can be edited again. Close it to send the order on.`,
                            });
                          }}
                        >
                          Reopen
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={list.cartons.length === 0}
                        title={list.cartons.length === 0 ? "Add at least one carton first" : undefined}
                        onClick={() => {
                          finalizePackingList(list.id);
                          pushToast({
                            tone: "success",
                            title: "Packing list closed",
                            description: `Inspection opened for ${order.id}.`,
                          });
                        }}
                      >
                        Close list
                      </Button>
                    )
                  }
                />

                {list && (
                  <>
                    {list.cartons.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-paper-200">
                        <table className="w-full min-w-[680px] border-collapse text-xs">
                          <thead>
                            <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                              <th className="w-28 px-2 py-2">Mark</th>
                              <th className="px-2 py-2">Item</th>
                              <th className="w-20 px-2 py-2 text-right">Pcs</th>
                              <th className="w-28 px-2 py-2 text-right">Net KG</th>
                              <th className="w-28 px-2 py-2 text-right">Gross KG</th>
                              <th className="w-24 px-2 py-2">Status</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {list.cartons.map((c) => (
                              <tr key={c.id} className="border-b border-paper-100 last:border-0">
                                <td className="px-2 py-1.5 font-mono text-pine-800">{c.markNo}</td>
                                <td className="px-2 py-1.5 font-mono text-paper-600">{c.itemCode}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{c.qtyPcs}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{c.netWeightKg.toFixed(2)}</td>
                                <td className="px-2 py-1.5 text-right font-mono font-semibold">{c.grossWeightKg.toFixed(2)}</td>
                                <td className="px-2 py-1.5">
                                  <span
                                    className={clsx(
                                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                      c.status === "shipped"
                                        ? "bg-pine-100 text-pine-800"
                                        : c.status === "held"
                                          ? "bg-alert-50 text-alert-700"
                                          : "bg-paper-100 text-paper-600"
                                    )}
                                  >
                                    {c.status}
                                  </span>
                                </td>
                                <td className="px-1 py-1.5">
                                  {!locked && (
                                    <button
                                      onClick={() => removeCarton(list.id, c.id)}
                                      className="text-paper-400 hover:text-alert-600"
                                      aria-label="Remove carton"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!locked && (
                      <div className="mt-3">
                        {addingTo === list.id ? (
                          <div className="grid grid-cols-2 gap-2 rounded-lg border border-manifest-200 bg-manifest-50/50 p-2.5 sm:grid-cols-6">
                            <input
                              value={draft.markNo}
                              onChange={(e) => setDraft({ ...draft, markNo: e.target.value })}
                              placeholder="Mark"
                              className={mini}
                            />
                            <input
                              value={draft.itemCode}
                              onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })}
                              placeholder="Item code"
                              className={mini}
                            />
                            <input
                              {...NON_NEGATIVE_INT}
                              value={draft.qtyPcs}
                              onChange={(e) => setDraft({ ...draft, qtyPcs: toNonNegative(e.target.value) })}
                              placeholder="Pcs"
                              className={clsx(mini, "text-right")}
                            />
                            <input
                              {...NON_NEGATIVE}
                              value={draft.netWeightKg}
                              onChange={(e) => setDraft({ ...draft, netWeightKg: toNonNegative(e.target.value) })}
                              placeholder="Net"
                              className={clsx(mini, "text-right")}
                            />
                            <input
                              {...NON_NEGATIVE}
                              value={draft.grossWeightKg}
                              onChange={(e) => setDraft({ ...draft, grossWeightKg: toNonNegative(e.target.value) })}
                              placeholder="Gross"
                              className={clsx(mini, "text-right")}
                            />
                            <div className="flex gap-1">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  if (!draft.markNo.trim() || !draft.itemCode.trim()) {
                                    pushToast({ tone: "warning", title: "Mark and item code are required" });
                                    return;
                                  }
                                  addCarton(list.id, { ...draft, status: "packed" });
                                  setDraft({ markNo: "", itemCode: "", qtyPcs: 1, netWeightKg: 0, grossWeightKg: 0 });
                                }}
                              >
                                Add
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setAddingTo(null)}>
                                Done
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAddingTo(list.id)}>
                            Add carton
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-paper-100 pt-3 text-sm">
                      <span>
                        <span className="text-paper-500">Net:&nbsp;</span>
                        <span className="font-mono text-paper-700">{net.toFixed(2)} KG</span>
                      </span>
                      <span>
                        <span className="text-paper-500">Gross:&nbsp;</span>
                        <span className="font-mono font-bold text-pine-800">{gross.toFixed(2)} KG</span>
                      </span>
                    </div>

                    {!locked && (
                      <input
                        value={list.remarks ?? ""}
                        onChange={(e) => updatePackingList(list.id, { remarks: e.target.value })}
                        placeholder="Packing remarks, marks and numbers, strapping…"
                        className="mt-2 w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                      />
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
