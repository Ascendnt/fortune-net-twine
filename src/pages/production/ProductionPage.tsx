import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Factory, Play, CheckCircle2, Plus, Search, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { NON_NEGATIVE_INT, toNonNegative } from "@/lib/num";
import type { SalesOrder } from "@/lib/types";

// Every order that reaches the factory floor appears here whether or not anyone has set up its
// lines yet, and the lines can be generated from the order in one click. An order that arrives with
// no production records would otherwise be invisible on this screen, which is the single worst
// thing a shop-floor list can do.

const mini =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

const FILTERS = [
  { id: "active", label: "On the floor" },
  { id: "all", label: "All" },
  { id: "unstarted", label: "Not started" },
  { id: "short", label: "Short" },
  { id: "done", label: "Finished" },
] as const;

export function ProductionPage() {
  const {
    salesOrders,
    productionRuns,
    quotations,
    customers,
    updateProductionRun,
    addProductionRun,
    removeProductionRun,
    completeProduction,
    pushToast,
  } = useStore();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [shortfallOrder, setShortfallOrder] = useState<SalesOrder | null>(null);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "-";

  /** Orders on the floor now, or that have run records from earlier. */
  const orders = useMemo(() => {
    const base = salesOrders.filter(
      (so) => so.currentStage === "production" || productionRuns.some((r) => r.salesOrderId === so.id)
    );
    return base.filter((so) => {
      const runs = productionRuns.filter((r) => r.salesOrderId === so.id);
      const ordered = runs.reduce((s, r) => s + r.qtyOrdered, 0);
      const done = runs.reduce((s, r) => s + r.qtyCompleted + r.qtyRejected, 0);

      if (filter === "active" && so.currentStage !== "production") return false;
      if (filter === "unstarted" && runs.some((r) => r.startedDate)) return false;
      if (filter === "short" && !(done >= ordered && runs.some((r) => r.qtyRejected > 0))) return false;
      if (filter === "done" && so.currentStage === "production") return false;

      if (!query) return true;
      const haystack = `${so.id} ${customerName(so.customerId)} ${runs.map((r) => r.itemCode).join(" ")}`;
      return haystack.toLowerCase().includes(query.toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrders, productionRuns, filter, query, customers]);

  const stats = useMemo(() => {
    const ordered = productionRuns.reduce((s, r) => s + r.qtyOrdered, 0);
    const completed = productionRuns.reduce((s, r) => s + r.qtyCompleted, 0);
    const rejected = productionRuns.reduce((s, r) => s + r.qtyRejected, 0);
    const inProgress = salesOrders.filter((o) => o.currentStage === "production").length;
    return { ordered, completed, rejected, inProgress, pct: ordered === 0 ? 0 : Math.round((completed / ordered) * 100) };
  }, [productionRuns, salesOrders]);

  /** Creates run records from the order's own line items, so nothing is keyed twice. */
  function generateLines(order: SalesOrder) {
    const quotation = quotations.find((q) => q.id === order.quotationId);
    const lines = quotation?.items ?? [];
    if (lines.length === 0) {
      pushToast({
        tone: "warning",
        title: "No line items to generate from",
        description: `${order.id} has no quotation lines. Add production lines by hand below.`,
      });
      addProductionRun({
        salesOrderId: order.id,
        itemCode: "",
        description: "",
        qtyOrdered: 0,
        qtyCompleted: 0,
        qtyRejected: 0,
      });
      return;
    }
    lines.forEach((li) =>
      addProductionRun({
        salesOrderId: order.id,
        itemCode: li.itemCode,
        description: li.description,
        qtyOrdered: li.qtyPcs,
        qtyCompleted: 0,
        qtyRejected: 0,
      })
    );
    pushToast({ tone: "success", title: "Production lines created", description: `${lines.length} lines from ${order.quotationId}.` });
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Factory Floor"
        title="Production"
        description="What is on the machines, line by line, and how much of each order is finished."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Orders in production" value={String(stats.inProgress)} />
        <StatCard label="Pieces completed" value={`${stats.completed} / ${stats.ordered}`} tone="pine" />
        <StatCard label="Overall progress" value={`${stats.pct}%`} tone="pine" />
        <StatCard label="Rejected" value={String(stats.rejected)} tone={stats.rejected > 0 ? "alert" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order, customer or item code…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-5 w-5" />}
          title={filter === "active" ? "Nothing on the floor" : "No orders match these filters"}
          description="Orders arrive here once their deposit is verified and they move to Production."
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const runs = productionRuns.filter((r) => r.salesOrderId === order.id);
            const ordered = runs.reduce((s, r) => s + r.qtyOrdered, 0);
            const completed = runs.reduce((s, r) => s + r.qtyCompleted, 0);
            const accounted = runs.reduce((s, r) => s + r.qtyCompleted + r.qtyRejected, 0);
            const pct = ordered === 0 ? 0 : Math.round((completed / ordered) * 100);
            const allAccounted = runs.length > 0 && accounted >= ordered;
            const onFloor = order.currentStage === "production";
            const isOpen = !collapsed.includes(order.id);

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
                  eyebrow={runs.length === 0 ? "No production lines yet" : `${pct}% complete · ${completed} of ${ordered} pcs`}
                  action={
                    <div className="flex items-center gap-2">
                      {/* Always available. Hiding this behind the stage was what left the page with
                          no way to edit quantities on an order that was mid-run. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        onClick={() =>
                          setCollapsed((prev) =>
                            prev.includes(order.id) ? prev.filter((x) => x !== order.id) : [...prev, order.id]
                          )
                        }
                      >
                        {isOpen ? "Hide" : "Show"} lines
                      </Button>
                      {onFloor && runs.length > 0 && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => {
                            // A shortfall is a normal outcome, not an error. It asks rather than
                            // refusing, so the floor is never stuck with a button it cannot press.
                            if (!allAccounted) {
                              setShortfallOrder(order);
                              return;
                            }
                            completeProduction(order.id);
                            pushToast({
                              tone: "success",
                              title: "Production complete",
                              description: `${order.id} moved to Packing.`,
                            });
                          }}
                        >
                          Complete production
                        </Button>
                      )}
                    </div>
                  }
                />

                {runs.length > 0 && (
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-paper-100">
                    <div className="h-full rounded-full bg-pine-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}

                {isOpen && (
                  <>
                    {runs.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-paper-300 p-5 text-center">
                        <p className="text-sm text-paper-500">
                          No production lines for this order yet.
                        </p>
                        <p className="mt-0.5 text-xs text-paper-400">
                          Generate them from the order's own items, then record progress against each.
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Plus className="h-3.5 w-3.5" />}
                          className="mt-3"
                          onClick={() => generateLines(order)}
                        >
                          Generate production lines
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-lg border border-paper-200">
                          <table className="w-full min-w-[760px] border-collapse text-xs">
                            <thead>
                              <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                                <th className="w-36 px-2 py-2">Item</th>
                                <th className="px-2 py-2">Description</th>
                                <th className="w-20 px-2 py-2 text-right">Ordered</th>
                                <th className="w-24 px-2 py-2 text-right">Completed</th>
                                <th className="w-24 px-2 py-2 text-right">Rejected</th>
                                <th className="w-28 px-2 py-2">Started</th>
                                <th className="w-8" />
                              </tr>
                            </thead>
                            <tbody>
                              {runs.map((r) => (
                                <tr key={r.id} className="border-b border-paper-100 last:border-0">
                                  <td className="px-2 py-1.5">
                                    <input
                                      value={r.itemCode}
                                      onChange={(e) => updateProductionRun(r.id, { itemCode: e.target.value })}
                                      className={mini}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      value={r.description}
                                      onChange={(e) => updateProductionRun(r.id, { description: e.target.value })}
                                      className={clsx(mini, "font-sans")}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      {...NON_NEGATIVE_INT}
                                      value={r.qtyOrdered}
                                      onChange={(e) => updateProductionRun(r.id, { qtyOrdered: toNonNegative(e.target.value) })}
                                      className={clsx(mini, "text-right")}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      {...NON_NEGATIVE_INT}
                                      value={r.qtyCompleted}
                                      onChange={(e) =>
                                        updateProductionRun(r.id, {
                                          qtyCompleted: Math.min(r.qtyOrdered, toNonNegative(e.target.value)),
                                        })
                                      }
                                      className={clsx(mini, "text-right")}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      {...NON_NEGATIVE_INT}
                                      value={r.qtyRejected}
                                      onChange={(e) =>
                                        updateProductionRun(r.id, {
                                          qtyRejected: Math.min(r.qtyOrdered, toNonNegative(e.target.value)),
                                        })
                                      }
                                      className={clsx(mini, "text-right")}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-[11px] text-paper-500">
                                    {r.startedDate ? (
                                      formatDate(r.startedDate)
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={<Play className="h-3 w-3" />}
                                        onClick={() =>
                                          updateProductionRun(r.id, { startedDate: new Date().toISOString().slice(0, 10) })
                                        }
                                      >
                                        Start
                                      </Button>
                                    )}
                                  </td>
                                  <td className="px-1 py-1.5">
                                    {/* Actually removes the line. This previously only zeroed the
                                        quantities while showing a bin icon, which is a lie. */}
                                    <button
                                      onClick={() => removeProductionRun(r.id)}
                                      title="Remove this line"
                                      aria-label="Remove line"
                                      className="text-paper-400 hover:text-alert-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() =>
                              addProductionRun({
                                salesOrderId: order.id,
                                itemCode: "",
                                description: "",
                                qtyOrdered: 0,
                                qtyCompleted: 0,
                                qtyRejected: 0,
                              })
                            }
                          >
                            Add line
                          </Button>
                          {onFloor && !allAccounted && (
                            <p className="text-[11px] text-paper-400">
                              {ordered - accounted} pcs still unaccounted for. You can still close the order short.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={shortfallOrder !== null}
        onClose={() => setShortfallOrder(null)}
        title="Close production short?"
        subtitle="Not every piece has been accounted for."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShortfallOrder(null)}>
              Keep it open
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (shortfallOrder) {
                  completeProduction(shortfallOrder.id);
                  pushToast({
                    tone: "success",
                    title: "Production closed short",
                    description: `${shortfallOrder.id} moved to Packing.`,
                  });
                }
                setShortfallOrder(null);
              }}
            >
              Close short and move to packing
            </Button>
          </>
        }
      >
        {shortfallOrder && (
          <p className="text-sm text-paper-600">
            {(() => {
              const runs = productionRuns.filter((r) => r.salesOrderId === shortfallOrder.id);
              const ordered = runs.reduce((s, r) => s + r.qtyOrdered, 0);
              const accounted = runs.reduce((s, r) => s + r.qtyCompleted + r.qtyRejected, 0);
              return `${ordered - accounted} of ${ordered} pieces are neither completed nor rejected. Closing now moves ${shortfallOrder.id} to Packing with what has actually been made, which is what you want for a partial shipment. The shortfall stays visible on the line records.`;
            })()}
          </p>
        )}
      </Modal>
    </div>
  );
}
