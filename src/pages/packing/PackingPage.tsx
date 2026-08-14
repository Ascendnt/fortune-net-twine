import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PackageCheck, Search, Plus, AlertTriangle } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, piRef } from "@/lib/format";
import { listOrders, reconcileOrder, sectionTotals } from "@/lib/packing";
import { canPack } from "@/lib/paymentLedger";
import { SCOPES } from "./scopes";
import type { QuotationLineItem, ShipmentScope } from "@/lib/types";
import clsx from "clsx";

// The packing lists a customer's goods are going out on. Opening one is a single action at the top
// right, exactly as a quotation is raised, and the list itself is worked on at /packing/:id.
//
// A list covers a container, not an order. Customers consolidate several of their own orders into
// one load to make up a full container, so the flow starts with the company and then asks which of
// their orders are going.

/** Page controls, rendered above and below the table so neither end is a scroll away. */
function Pager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2 text-xs">
      <span className="text-paper-500">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-md border border-paper-200 bg-white px-2 py-1 text-xs"
          aria-label="Lists per page"
        >
          {[10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-md border border-paper-200 px-2 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="font-mono text-paper-600">
          {page} / {pageCount}
        </span>
        <button
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="rounded-md border border-paper-200 px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function PackingPage() {
  const navigate = useNavigate();
  const {
    packingLists,
    salesOrders,
    quotations,
    customers,
    createPackingList,
    payments,
    pushToast,
  } = useStore();

  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  // Open first, and the default: an open list is one somebody still has work to do on. Closed
  // lists are reference, and All is the fallback rather than the starting point.
  const [openFilter, setOpenFilter] = useState<"open" | "closed" | "all">("open");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  /**
   * Creating a list is three decisions, so it is three steps.
   *
   * Whose container it is first, because a load is consigned to one party. Then which of their
   * orders go in it and how each is going out, because that changes what the last step has to ask:
   * a full or final shipment takes everything still outstanding and needs no picking, while a
   * partial is precisely the case where somebody has to say which items are going.
   */
  const [creating, setCreating] = useState<{
    customerId: string;
    /** Every order ticked for this load, in the order they were ticked, with its scope. */
    orders: { salesOrderId: string; scope: ShipmentScope }[];
    step: "customer" | "orders" | "items";
    /** Quantities chosen for the partials, keyed "<salesOrderId>::<itemId>". */
    picked: Record<string, number>;
  } | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");

  /** Orders that have reached packing and are not yet completed. */
  const packableOrders = useMemo(
    () => salesOrders.filter((o) => o.currentStage === "packing" || o.currentStage === "deposit"),
    [salesOrders]
  );

  const orderItems = (salesOrderId: string): QuotationLineItem[] => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const quotation = order?.quotationId ? quotations.find((q) => q.id === order.quotationId) : undefined;
    return quotation?.items ?? [];
  };

  const reconcileFor = (salesOrderId: string) =>
    reconcileOrder(salesOrderId, orderItems(salesOrderId), packingLists);

  /** Order lines with something still to pack. Fully packed items are not offered again. */
  const remainingFor = (salesOrderId: string) =>
    reconcileFor(salesOrderId).filter((r) => r.orderedQty > 0 && r.variance < 0);

  /** The PI reference as the customer knows it, revision suffix and all. */
  const refForOrder = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const q = order?.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    return q ? piRef(q.id, q.revisionNo) : (order?.quotationId ?? salesOrderId);
  };

  /**
   * The companies with something to pack, each with what is ready and what is held.
   *
   * The deposit block travels with the company rather than being hidden until the second step: a
   * packer who opens this needs to know at a glance that Golden Reef is waiting on Finance, not
   * after picking them.
   */
  const packableCustomers = useMemo(() => {
    const byCustomer = new Map<string, { ready: number; held: number }>();
    for (const o of packableOrders) {
      const entry = byCustomer.get(o.customerId) ?? { ready: 0, held: 0 };
      if (canPack(o, payments).ok) entry.ready += 1;
      else entry.held += 1;
      byCustomer.set(o.customerId, entry);
    }
    return [...byCustomer.entries()]
      .map(([customerId, counts]) => ({ customer: customers.find((c) => c.id === customerId), ...counts }))
      .filter((row) => Boolean(row.customer))
      .sort((a, b) => (a.customer!.name > b.customer!.name ? 1 : -1));
  }, [packableOrders, customers, payments]);

  const visible = useMemo(() => {
    return packingLists.filter((l) => {
      if (openFilter === "open" && l.finalizedDate) return false;
      if (openFilter === "closed" && !l.finalizedDate) return false;
      const cust = customers.find((c) => c.id === l.customerId);
      if (customerFilter !== "all" && cust?.id !== customerFilter) return false;
      if (query) {
        const refs = listOrders(l);
        const haystack = `${l.id} ${refs.map((r) => `${r.salesOrderId} ${r.piRef}`).join(" ")} ${cust?.name ?? ""}`;
        if (!haystack.toLowerCase().includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [packingLists, openFilter, customerFilter, query, customers]);

  // Derived from `visible`, so it has to sit after it. `current` is clamped rather than trusted:
  // deleting the last list on page 4 would otherwise leave the user on an empty page.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount);
  const paged = visible.slice((current - 1) * pageSize, current * pageSize);

  const stats = useMemo(() => {
    const open = packingLists.filter((l) => !l.finalizedDate).length;
    const net = packingLists.reduce((s, l) => s + sectionTotals(l.sections ?? []).netKg, 0);
    const consolidated = packingLists.filter((l) => listOrders(l).length > 1 && !l.finalizedDate).length;
    return { open, net, consolidated };
  }, [packingLists]);

  function confirmCreate(c: NonNullable<typeof creating>) {
    const lines = c.orders.flatMap((ref) =>
      reconcileFor(ref.salesOrderId)
        .filter((r) => r.orderedQty > 0)
        .map((r) => {
          const outstanding = Math.max(0, -r.variance);
          const qty = ref.scope === "partial" ? (c.picked[`${ref.salesOrderId}::${r.itemId}`] ?? 0) : outstanding;
          return { row: r, qty, salesOrderId: ref.salesOrderId };
        })
        .filter((x) => x.qty > 0)
        .map(({ row, qty, salesOrderId }) => ({
          salesOrderId,
          itemId: row.itemId,
          itemCode: row.itemCode,
          description: row.description,
          qtyPcs: qty,
          netWeightKg: 0,
          grossWeightKg: 0,
        }))
    );

    if (lines.length === 0) {
      pushToast({
        tone: "warning",
        title: "Nothing to pack",
        description: c.orders.some((o) => o.scope === "partial")
          ? "Tick at least one item for this load."
          : "Everything on these P.I.s is already packed.",
      });
      return;
    }

    const id = createPackingList(c.orders, lines);
    pushToast({
      tone: "success",
      title: "Packing list created",
      description: `${id} opened over ${c.orders.length} P.I.${c.orders.length === 1 ? "" : "s"} with ${lines.length} item${lines.length === 1 ? "" : "s"}. Set the pieces next.`,
    });
    setCreating(null);
    navigate(`/packing/${id}`);
  }

  /** The customer's orders that can go in a container, blocked ones included so they can be seen. */
  const ordersForCustomer = (customerId: string) => packableOrders.filter((o) => o.customerId === customerId);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Outbound Preparation"
        title="Packing Lists"
        description="Record what is going in the container and check it against every order it covers before it leaves."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setCustomerQuery("");
              setCreating({ customerId: "", orders: [], step: "customer", picked: {} });
            }}
          >
            Create packing list
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Open packing lists" value={String(stats.open)} tone="amber" />
        <StatCard label="Consolidated loads open" value={String(stats.consolidated)} />
        <StatCard label="Total net weight packed" value={`${stats.net.toFixed(2)} KG`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search list, P.I., order or customer…"
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
          {(["open", "closed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setOpenFilter(f);
                setPage(1);
              }}
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
          title={packingLists.length === 0 ? "No packing lists yet" : "No packing lists match your filters"}
          description="A list is opened against a customer's orders once they have reached packing and the deposit has cleared."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCustomerQuery("");
                setCreating({ customerId: "", orders: [], step: "customer", picked: {} });
              }}
            >
              Create packing list
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Pagination above and below. A packer working down a long list should not have to
              scroll back to the top to reach the next page, and should not have to scroll to the
              bottom to see how many there are. */}
          <Pager
            page={current}
            pageCount={pageCount}
            pageSize={pageSize}
            total={visible.length}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
          <Table>
            <THead>
              <TH>List No.</TH>
              <TH>P.I. Nos.</TH>
              <TH>Customer</TH>
              <TH>Date</TH>
              <TH>Packed by</TH>
              <TH>Pcs</TH>
              <TH>Net KG</TH>
              <TH>Status</TH>
            </THead>
            <tbody>
              {paged.map((l) => {
                const refs = listOrders(l);
                const totals = sectionTotals(l.sections ?? []);
                const cust = customers.find((c) => c.id === l.customerId);
                const closed = Boolean(l.finalizedDate);
                return (
                  <TR key={l.id} onClick={() => navigate(`/packing/${l.id}`)}>
                    <TD className="font-mono font-semibold text-pine-800">{l.id}</TD>
                    {/* The P.I. is what the customer and the factory both quote back at you, so it
                        is the reference on screen. The sales order number is internal plumbing. */}
                    <TD className="font-mono text-xs text-paper-700">
                      {refs.map((r) => r.piRef).join(", ") || "-"}
                      {refs.length > 1 && (
                        <span className="ml-1.5 rounded bg-manifest-50 px-1.5 py-0.5 text-[10px] font-sans text-manifest-700">
                          consolidated
                        </span>
                      )}
                    </TD>
                    <TD className="font-medium">{cust?.name ?? "-"}</TD>
                    <TD className="font-mono text-xs">{formatDate(l.finalizedDate ?? l.createdDate)}</TD>
                    <TD className="text-xs text-paper-500">{l.packedBy}</TD>
                    <TD className="font-mono">{totals.pieces}</TD>
                    <TD className="font-mono font-medium">{totals.netKg.toFixed(2)}</TD>
                    <TD>
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          closed ? "bg-pine-100 text-pine-800" : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {closed ? "Closed" : "Draft"}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <Pager
            page={current}
            pageCount={pageCount}
            pageSize={pageSize}
            total={visible.length}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      )}

      <Modal
        open={creating !== null}
        onClose={() => setCreating(null)}
        title={
          creating?.step === "items"
            ? "Which items are going?"
            : creating?.step === "orders"
              ? "Which P.I.s are going in this container?"
              : "Whose container is this?"
        }
        subtitle={
          creating && creating.step !== "customer"
            ? `${customers.find((c) => c.id === creating.customerId)?.name ?? ""} · ${creating.orders.length} P.I.${
                creating.orders.length === 1 ? "" : "s"
              } in this container`
            : undefined
        }
        width="max-w-3xl"
        footer={
          creating?.step === "customer" ? (
            <Button variant="secondary" size="sm" onClick={() => setCreating(null)}>
              Cancel
            </Button>
          ) : creating?.step === "items" ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setCreating({ ...creating, step: "orders" })}>
                Back
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCreating(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => confirmCreate(creating)}>
                Create list with {Object.values(creating.picked).filter((q) => q > 0).length} item
                {Object.values(creating.picked).filter((q) => q > 0).length === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => creating && setCreating({ ...creating, step: "customer", orders: [] })}
              >
                Back
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCreating(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!creating || creating.orders.length === 0}
                onClick={() => {
                  if (!creating) return;
                  // A partial is the only scope where somebody has to choose. Full and final take
                  // everything still outstanding, so asking would be a click that decides nothing.
                  if (creating.orders.some((o) => o.scope === "partial")) {
                    setCreating({ ...creating, step: "items", picked: {} });
                    return;
                  }
                  confirmCreate(creating);
                }}
              >
                {creating?.orders.some((o) => o.scope === "partial") ? "Choose items" : "Create list"}
              </Button>
            </>
          )
        }
      >
        {creating?.step === "customer" && (
          <div className="space-y-3">
            <p className="text-xs text-paper-500">
              A container is consigned to one party, so the company comes first. Only companies with an order at
              packing are listed.
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search company…"
                className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-paper-200">
              {packableCustomers.filter((row) =>
                row.customer!.name.toLowerCase().includes(customerQuery.trim().toLowerCase())
              ).length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-paper-400">
                  {packableCustomers.length === 0
                    ? "No order has reached packing yet."
                    : "No company matches that."}
                </p>
              )}
              {packableCustomers
                .filter((row) => row.customer!.name.toLowerCase().includes(customerQuery.trim().toLowerCase()))
                .map(({ customer, ready, held }) => (
                  <button
                    key={customer!.id}
                    disabled={ready === 0}
                    onClick={() => setCreating({ customerId: customer!.id, orders: [], step: "orders", picked: {} })}
                    className={clsx(
                      "flex w-full items-center justify-between gap-3 border-b border-paper-100 px-3 py-2.5 text-left last:border-0",
                      ready === 0 ? "cursor-not-allowed bg-paper-50/60" : "hover:bg-pine-50/50"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-paper-800">{customer!.name}</span>
                      {/* Counted in P.I.s, not sales orders. The P.I. number is what the customer
                          and the factory both quote back, and it is what the rest of this flow and
                          the printed sheet are labelled with. */}
                      <span className="block text-[11px] text-paper-500">
                        {ready} P.I.{ready === 1 ? "" : "s"} ready to pack
                        {held > 0 && (
                          <span className="text-amber-700">
                            {" "}
                            · {held} waiting on the deposit
                          </span>
                        )}
                      </span>
                    </span>
                    {ready === 0 ? (
                      <span className="shrink-0 text-[11px] font-medium text-amber-700">Deposit first</span>
                    ) : (
                      <span className="shrink-0 text-[11px] font-medium text-manifest-600">Choose P.I.s →</span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}

        {creating?.step === "orders" && (
          <div className="space-y-3">
            <p className="text-xs text-paper-500">
              Tick every P.I. going into this container, and say how each one is going out. A customer filling a
              container with several of their own orders is exactly what this is for, and the scopes can differ, so
              one P.I. can be finished off in the same load that takes another's next partial.
            </p>
            <div className="space-y-2">
              {ordersForCustomer(creating.customerId).map((o) => {
                const chosen = creating.orders.find((x) => x.salesOrderId === o.id);
                const outstanding = remainingFor(o.id).length;
                // The factory works to the deposit. Packing before it clears commits material and
                // machine time against a customer who has not put money down, which is the exact
                // risk the deposit exists to cover.
                const deposit = canPack(o, payments);
                return (
                  <div
                    key={o.id}
                    className={clsx(
                      "rounded-lg border p-3 transition-colors",
                      !deposit.ok
                        ? "border-amber-200 bg-amber-50/40"
                        : chosen
                          ? "border-manifest-400 bg-manifest-50/50"
                          : "border-paper-200"
                    )}
                  >
                    <label className={clsx("flex items-start gap-2", deposit.ok ? "cursor-pointer" : "cursor-default")}>
                      <input
                        type="checkbox"
                        checked={Boolean(chosen)}
                        disabled={!deposit.ok}
                        onChange={(e) =>
                          setCreating({
                            ...creating,
                            orders: e.target.checked
                              ? [
                                  ...creating.orders,
                                  { salesOrderId: o.id, scope: outstanding === 0 ? "final" : "partial" },
                                ]
                              : creating.orders.filter((x) => x.salesOrderId !== o.id),
                          })
                        }
                        className="mt-0.5 h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-paper-800">
                          <span className="font-mono text-pine-800">{refForOrder(o.id)}</span>
                          <span className="ml-2 font-mono text-[11px] text-paper-400">{o.id}</span>
                        </span>
                        <span className="block text-[11px] text-paper-500">
                          {outstanding === 0
                            ? "Everything on this order is already packed."
                            : `${outstanding} item${outstanding === 1 ? "" : "s"} still to pack.`}
                        </span>
                        {/* Not a dead checkbox on its own. A blocked order says what is wrong and
                            links to the place the blockage is cleared. */}
                        {!deposit.ok && (
                          <span className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              {deposit.reason}{" "}
                              <Link to={`/orders/${o.id}`} className="font-medium underline">
                                Record the deposit
                              </Link>
                            </span>
                          </span>
                        )}
                      </span>
                    </label>
                    {chosen && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                        {SCOPES.map((s) => (
                          <button
                            key={s.id}
                            onClick={() =>
                              setCreating({
                                ...creating,
                                orders: creating.orders.map((x) =>
                                  x.salesOrderId === o.id ? { ...x, scope: s.id } : x
                                ),
                              })
                            }
                            title={s.help}
                            className={clsx(
                              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                              chosen.scope === s.id
                                ? "border-pine-700 bg-pine-700 text-white"
                                : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
                            )}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {creating?.step === "items" && (
          <div className="space-y-3">
            <p className="text-xs text-paper-500">
              Tick what is going in this load and set the quantity. Anything already packed on an earlier list is
              counted, so the outstanding figure is what is genuinely left. Orders going out in full are not shown,
              because they take everything outstanding.
            </p>
            {creating.orders
              .filter((ref) => ref.scope === "partial")
              .map((ref) => (
                <div key={ref.salesOrderId} className="overflow-hidden rounded-lg border border-paper-200">
                  <p className="bg-pine-700 px-3 py-1.5 font-mono text-[11px] font-semibold text-white">
                    P.I. {refForOrder(ref.salesOrderId)}
                    <span className="ml-2 font-normal text-pine-100">{ref.salesOrderId}</span>
                  </p>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-pine-600 text-left font-mono text-[9.5px] uppercase tracking-wide text-white">
                        <th className="w-10 py-2 pl-3" />
                        <th className="px-2 py-2">Item</th>
                        <th className="w-20 px-2 py-2 text-right">Ordered</th>
                        <th className="w-20 px-2 py-2 text-right">Packed</th>
                        <th className="w-24 px-2 py-2 text-right">Outstanding</th>
                        <th className="w-28 px-2 py-2 text-right">This load</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Anything already packed in full is gone from the list, not greyed out. It
                          cannot be chosen, so showing it is just noise between the rows that can. */}
                      {remainingFor(ref.salesOrderId).length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-paper-400">
                            Everything on this order has already been packed. Set it to a final shipment instead.
                          </td>
                        </tr>
                      )}
                      {remainingFor(ref.salesOrderId).map((r) => {
                        const outstanding = Math.max(0, -r.variance);
                        const key = `${ref.salesOrderId}::${r.itemId}`;
                        const qty = creating.picked[key] ?? 0;
                        return (
                          <tr key={key} className={clsx("border-t border-paper-100", qty > 0 && "bg-manifest-50/60")}>
                            <td className="py-1.5 pl-3">
                              <input
                                type="checkbox"
                                checked={qty > 0}
                                onChange={(e) =>
                                  setCreating({
                                    ...creating,
                                    picked: { ...creating.picked, [key]: e.target.checked ? outstanding : 0 },
                                  })
                                }
                                className="h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <span className="font-mono text-pine-800">{r.itemCode}</span>
                              <span className="ml-2 text-paper-500">{r.description}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.orderedQty}</td>
                            <td className="px-2 py-1.5 text-right font-mono">{r.packedQty}</td>
                            <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-700">
                              {outstanding}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                max={outstanding}
                                value={qty}
                                onChange={(e) =>
                                  setCreating({
                                    ...creating,
                                    picked: {
                                      ...creating.picked,
                                      [key]: Math.max(0, Math.min(outstanding, Number(e.target.value) || 0)),
                                    },
                                  })
                                }
                                className="w-20 rounded-md border border-paper-200 px-2 py-1 text-right font-mono text-xs"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
