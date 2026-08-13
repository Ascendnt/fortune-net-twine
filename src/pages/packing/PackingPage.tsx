import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PackageCheck,
  Search,
  Plus,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Printer,
  Layers,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate, piRef } from "@/lib/format";
import {
  lineTotals,
  linesForOrder,
  listOrders,
  piRefLine,
  reconcileOrder,
  scopeLabel,
  sectionTotals,
  verifyPackingList,
} from "@/lib/packing";
import { canPack } from "@/lib/paymentLedger";
import { PackingListDocument } from "@/components/domain/PackingListDocument";
import type { PackingList, QuotationLineItem, SalesOrder, ShipmentScope } from "@/lib/types";
import clsx from "clsx";

// Packing is a verification screen, not a carton designer. Its job is to answer one question before
// the goods leave: does what we are shipping match what the customer bought? The plant sends its
// details in whatever shape the job took, so the rows are free-form and grouped into sections the
// user names, and the reconciliation against the order is what the screen actually asserts.
//
// A list covers a container, not an order. Customers consolidate several of their own orders into
// one load to make up a full container, so everything here works order by order: each PI on the
// load carries its own scope, reconciles against its own quantities, and gets its own verdict.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

/** Page controls, rendered above and below the list so neither end is a scroll away. */
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
    addPackingListOrder,
    removePackingListOrder,
    setPackingListOrderScope,
    removePackingList,
    addPackingSection,
    updatePackingSection,
    removePackingSection,
    addPackingLine,
    updatePackingLine,
    removePackingLine,
    finalizePackingList,
    reopenPackingList,
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
   * Creating a list is two decisions, so it is two steps.
   *
   * Which orders go in the container first, and how each of them is going out, because that
   * changes what the second step has to ask. A full or final shipment takes everything still
   * outstanding on its PI and needs no picking; a partial is precisely the case where somebody has
   * to say which items are going.
   */
  const [creating, setCreating] = useState<{
    customerId: string;
    /** Every order ticked for this load, in the order they were ticked, with its scope. */
    orders: { salesOrderId: string; scope: ShipmentScope }[];
    step: "orders" | "items";
    /** Quantities chosen for the partials, keyed "<salesOrderId>::<itemId>". */
    picked: Record<string, number>;
  } | null>(null);
  /** The list being previewed as a printable document. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Which section is having items added to it, and what has been ticked so far. */
  const [picking, setPicking] = useState<{ listId: string; sectionId: string } | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  /** The list having another order consolidated into it. */
  const [consolidating, setConsolidating] = useState<PackingList | null>(null);
  const [confirmClose, setConfirmClose] = useState<PackingList | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PackingList | null>(null);

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

  const itemsByOrderFor = (list: PackingList): Record<string, QuotationLineItem[]> =>
    Object.fromEntries(listOrders(list).map((ref) => [ref.salesOrderId, orderItems(ref.salesOrderId)]));

  /**
   * Reconciliation counts every list touching the order, so a partial is not mistaken for a
   * shortfall, and counts only that order's rows, so a consolidated container does not credit one
   * PI with another's goods. `currentListId` marks which rows the user can actually edit, which
   * decides whether a problem blocks or is merely reported.
   */
  const reconcileFor = (salesOrderId: string, currentListId?: string) =>
    reconcileOrder(salesOrderId, orderItems(salesOrderId), packingLists, currentListId);

  const previewList = previewId ? packingLists.find((p) => p.id === previewId) : undefined;

  /** The PI reference as the customer knows it, revision suffix and all. */
  const refForOrder = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const q = order?.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    return q ? piRef(q.id, q.revisionNo) : (order?.quotationId ?? salesOrderId);
  };

  const customerOf = (list: PackingList) => customers.find((c) => c.id === list.customerId);
  const ordersOf = (list: PackingList): SalesOrder[] =>
    listOrders(list)
      .map((r) => salesOrders.find((o) => o.id === r.salesOrderId))
      .filter((o): o is SalesOrder => Boolean(o));

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
    const gross = packingLists.reduce((s, l) => s + sectionTotals(l.sections ?? []).grossKg, 0);
    const consolidated = packingLists.filter((l) => listOrders(l).length > 1 && !l.finalizedDate).length;
    return { open, gross, consolidated };
  }, [packingLists]);

  const pickingList = picking ? packingLists.find((p) => p.id === picking.listId) : undefined;

  /**
   * What the picker can offer: order lines not already on this list, filtered by the search box.
   *
   * Already-on-the-list items are excluded rather than shown ticked, because adding one twice
   * creates a duplicate row that then has to be spotted and deleted. Each candidate carries the
   * order it came from, so a consolidated list can offer all of its PIs at once.
   */
  const pickableItems = (() => {
    if (!pickingList) return [];
    const out: { salesOrderId: string; piRef: string; item: QuotationLineItem }[] = [];
    const q = pickQuery.trim().toLowerCase();
    for (const ref of listOrders(pickingList)) {
      const onList = new Set(linesForOrder([pickingList], ref.salesOrderId).map((l) => l.itemId ?? l.itemCode));
      for (const li of orderItems(ref.salesOrderId)) {
        if (onList.has(li.id) || onList.has(li.itemCode)) continue;
        if (q && !`${li.itemCode} ${li.description} ${li.specification} ${ref.piRef}`.toLowerCase().includes(q)) continue;
        out.push({ salesOrderId: ref.salesOrderId, piRef: ref.piRef, item: li });
      }
    }
    return out;
  })();

  /** Adds the ticked items in the order they were ticked, then clears the picker. */
  function addPickedItems() {
    if (!picking) return;
    // Mapped over `picked` rather than the table, so the rows land in click order. This is the
    // same rule the quotation builder's item selection follows.
    picked.forEach((key) => {
      const hit = pickableItems.find((x) => `${x.salesOrderId}::${x.item.id}` === key);
      if (!hit) return;
      addPackingLine(picking.listId, picking.sectionId, {
        salesOrderId: hit.salesOrderId,
        itemId: hit.item.id,
        itemCode: hit.item.itemCode,
        description: hit.item.description,
        qtyPcs: 0,
        netWeightKg: 0,
        grossWeightKg: 0,
      });
    });
    pushToast({
      tone: "success",
      title: `${picked.length} item${picked.length === 1 ? "" : "s"} added`,
      description: "Set the pieces and weights on the rows.",
    });
    setPicking(null);
    setPicked([]);
    setPickQuery("");
  }

  /** Order lines with something still to pack. Fully packed items are not offered again. */
  const remainingFor = (salesOrderId: string) =>
    reconcileFor(salesOrderId).filter((r) => r.orderedQty > 0 && r.variance < 0);

  /**
   * The customer's other orders that could ride in the same container.
   *
   * Same customer only. A container is consigned to one party, so consolidating two customers'
   * orders onto one packing list would produce a document addressed to nobody.
   */
  const consolidatableWith = (customerId: string, exclude: string[]) =>
    packableOrders.filter(
      (o) => o.customerId === customerId && !exclude.includes(o.id) && canPack(o, payments).ok
    );

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
          : "Everything on these orders is already packed.",
      });
      return;
    }

    const id = createPackingList(c.orders, lines);
    pushToast({
      tone: "success",
      title: "Packing list created",
      description: `${id} opened over ${c.orders.length} order${c.orders.length === 1 ? "" : "s"} with ${lines.length} item${lines.length === 1 ? "" : "s"}. Add the weights next.`,
    });
    setCreating(null);
  }

  function handleClose(list: PackingList) {
    const verdict = verifyPackingList(list, itemsByOrderFor(list), packingLists);
    if (!verdict.ok) {
      pushToast({ tone: "warning", title: "Cannot close this list", description: verdict.message });
      return;
    }
    setConfirmClose(list);
  }

  return (
    <div>
      {/* Everything on this screen is marked no-print, and the document is rendered again below,
          outside it. That is exactly how the PI prints: Ctrl+P produces the document alone rather
          than the application around it. Modals render inline rather than through a portal, so the
          preview dialog is inside this wrapper and disappears from the printed page with it. */}
      <div className="no-print">
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Outbound Preparation"
        title="Packing List"
        description="Record what is going in the container and check it against every order it covers before it leaves."
      />

      <HowToUse
        id="packing-v3"
        steps={[
          "An order only appears here once its deposit has cleared. If it is waiting on payment, the panel says so and links you to the order.",
          "Press Create packing list on the order you are packing. If the same customer has other orders ready, tick them too. A container is filled, not an order shipped.",
          "Say how each PI on the load is going out. They can differ: one PI can go in full in the same container that takes another's second partial.",
          "Add sections in whatever shape the plant sent you: by container, by bundle, by batch. Name them however makes sense, and put the container number on each.",
          "Inside a section, press Add Item to pull a line off any of the load's orders, or Add blank row to type one in by hand.",
          "Watch the Order check panel. Every PI is counted separately across every list touching it, so a partial shows what is still outstanding rather than reading as a shortfall.",
          "When the load is right, press Submit. Each PI is checked against its own scope, so no PI can close short on a full or final shipment and none can close over-packed.",
          "Submitting opens the inspection report, where the weights are confirmed and sent to the customer.",
        ]}
        note="Made a mistake after closing? Press Reopen, correct it, and close again."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Open packing lists" value={String(stats.open)} tone="amber" />
        <StatCard label="Consolidated loads open" value={String(stats.consolidated)} />
        <StatCard label="Total gross weight" value={`${stats.gross.toFixed(2)} KG`} />
      </div>

      {packableOrders.length > 0 && (
        <Card className="mb-4 border-manifest-200 bg-manifest-50/40">
          <CardHeader
            title="Orders ready to pack"
            eyebrow="Start here"
            subtitle="One list can cover several of a customer's orders. Open another whenever a further load goes out."
          />
          <div className="space-y-2">
            {packableOrders.map((o) => {
              const rows = reconcileFor(o.id);
              const outstanding = rows.filter((r) => r.variance < 0).length;
              // The factory works to the deposit. Packing before it clears commits material and
              // machine time against a customer who has not put money down, which is the exact
              // risk the deposit exists to cover.
              const deposit = canPack(o, payments);
              const alsoReady = consolidatableWith(o.customerId, [o.id]).length;
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link to={`/orders/${o.id}`} className="font-mono text-xs font-semibold text-manifest-600 hover:underline">
                      {refForOrder(o.id)}
                    </Link>
                    <span className="ml-2 text-sm text-paper-700">{o.consignee}</span>
                    {/* Says what to do, not what is missing. "2 items still to pack" describes a
                        state; "Ready to pack 2 items" is the next action. */}
                    <p className="text-[11px] text-paper-400">
                      {outstanding === 0
                        ? "All items packed. Submit a final shipment to close this order out."
                        : `Ready to pack ${outstanding} item${outstanding === 1 ? "" : "s"}.`}
                      {alsoReady > 0 && deposit.ok && (
                        <span className="text-manifest-700">
                          {" "}
                          · {alsoReady} more order{alsoReady === 1 ? "" : "s"} for this customer can share the container.
                        </span>
                      )}
                    </p>
                    {!deposit.ok && (
                      <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {deposit.reason}
                      </p>
                    )}
                  </div>
                  {deposit.ok ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() =>
                        setCreating({
                          customerId: o.customerId,
                          orders: [{ salesOrderId: o.id, scope: outstanding === 0 ? "final" : "partial" }],
                          step: "orders",
                          picked: {},
                        })
                      }
                    >
                      Create packing list
                    </Button>
                  ) : (
                    // Not a disabled button. A dead control tells you nothing; a link to the place
                    // the blockage is cleared tells you what to do next.
                    <Link
                      to={`/orders/${o.id}`}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                    >
                      Record the deposit first
                    </Link>
                  )}
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
          title="No packing lists match your filters"
          description="Lists appear here once you create one against an order that has reached packing."
        />
      ) : (
        <div className="space-y-4">
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
          {paged.map((list) => {
            const closed = Boolean(list.finalizedDate);
            const cust = customerOf(list);
            const refs = listOrders(list);
            const verdict = verifyPackingList(list, itemsByOrderFor(list), packingLists);
            const totals = sectionTotals(list.sections ?? []);
            const canConsolidate = consolidatableWith(list.customerId, refs.map((r) => r.salesOrderId));
            return (
              <Card key={list.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-paper-400">
                      {list.id}
                      {refs.length > 1 && ` · consolidated, ${refs.length} orders`}
                      {closed && ` · closed ${formatDate(list.finalizedDate)}`}
                    </p>
                    {/* The PI is what the customer and the factory both quote back at you, so it
                        is the reference on screen. The sales order number is internal plumbing. */}
                    <p className="text-sm font-semibold text-paper-900">
                      {piRefLine(refs)} <span className="font-normal text-paper-600">{cust?.name ?? "-"}</span>
                    </p>
                    <p className="text-[11px] text-paper-400">
                      Packed by {list.packedBy} · {totals.pieces} pcs · net {totals.netKg.toFixed(2)} KG · gross{" "}
                      {totals.grossKg.toFixed(2)} KG
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileText className="h-3.5 w-3.5" />}
                      onClick={() => setPreviewId(list.id)}
                    >
                      Preview
                    </Button>
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
                          Submit
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

                {/* What is in the container, PI by PI. On a consolidated load this is the part that
                    matters most: each order has its own scope and its own verdict, and the packer
                    needs to see which one is holding the list up. */}
                <div className="mb-3 space-y-2">
                  {verdict.perOrder.map((v) => {
                    const packedHere = lineTotals(linesForOrder([list], v.salesOrderId));
                    return (
                      <details key={v.salesOrderId} className="rounded-lg border border-paper-200">
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs">
                          <span className="font-mono font-semibold text-pine-800">P.I. {v.piRef}</span>
                          {closed ? (
                            <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium text-paper-600">
                              {scopeLabel(v.scope, v.partialNo)}
                            </span>
                          ) : (
                            <select
                              value={v.scope}
                              onClick={(e) => e.preventDefault()}
                              onChange={(e) =>
                                setPackingListOrderScope(list.id, v.salesOrderId, e.target.value as ShipmentScope)
                              }
                              className="rounded-md border border-paper-200 bg-white px-1.5 py-0.5 text-[11px]"
                              title="How this P.I. is going out on this load"
                            >
                              {SCOPES.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.id === "partial" ? scopeLabel("partial", v.partialNo) : s.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <Link
                            to={`/orders/${v.salesOrderId}`}
                            className="font-mono text-[10.5px] text-manifest-600 hover:underline"
                          >
                            {v.salesOrderId}
                          </Link>
                          <span className="text-paper-500">
                            {packedHere.pieces} pcs on this list · net {packedHere.netKg.toFixed(2)} KG
                          </span>
                          {!v.ok && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                          {!closed && refs.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                removePackingListOrder(list.id, v.salesOrderId);
                              }}
                              className="ml-auto rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                              title={`Drop P.I. ${v.piRef} and its rows from this load`}
                              aria-label={`Drop ${v.piRef} from this list`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
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
                            {v.rows.map((r) => (
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
                                  {r.variance === 0 ? "-" : r.variance > 0 ? `+${r.variance}` : r.variance}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    );
                  })}
                  {!closed && canConsolidate.length > 0 && (
                    <button
                      onClick={() => setConsolidating(list)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-manifest-300 px-3 py-1.5 text-[11px] font-medium text-manifest-700 hover:bg-manifest-50"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Add another order to this container ({canConsolidate.length} ready)
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {(list.sections ?? []).map((section) => (
                    <div key={section.id} className="rounded-lg border border-paper-200">
                      <div className="flex flex-wrap items-center gap-2 border-b border-paper-100 bg-paper-50/70 px-2.5 py-1.5">
                        <input
                          value={section.title}
                          disabled={closed}
                          onChange={(e) => updatePackingSection(list.id, section.id, { title: e.target.value })}
                          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-paper-800 hover:border-paper-200 focus:border-manifest-400 focus:bg-white focus:outline-none disabled:hover:border-transparent"
                        />
                        {/* The container is per section, not per list. A consolidated load runs to
                            several containers and the sections are how they are told apart. */}
                        <input
                          value={section.containerNo ?? ""}
                          disabled={closed}
                          onChange={(e) => updatePackingSection(list.id, section.id, { containerNo: e.target.value })}
                          placeholder={list.containerNo || "Container no."}
                          className="w-40 rounded border border-paper-200 bg-white px-1.5 py-0.5 font-mono text-[11px] focus:border-manifest-400 focus:outline-none"
                          aria-label="Container number for this section"
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
                            {refs.length > 1 && <th className="w-28 px-2 py-1.5">P.I.</th>}
                            <th className="w-36 px-2 py-1.5">Item code</th>
                            <th className="px-2 py-1.5">Mark / description</th>
                            <th className="w-16 px-2 py-1.5">Bale no.</th>
                            <th className="w-14 px-2 py-1.5 text-right">Pcs</th>
                            <th className="w-24 px-2 py-1.5 text-right">Net KG</th>
                            <th className="w-24 px-2 py-1.5 text-right">Gross KG</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {section.lines.length === 0 && (
                            <tr>
                              <td colSpan={refs.length > 1 ? 8 : 7} className="px-2 py-3 text-center text-[11px] text-paper-400">
                                Nothing in this section yet.
                              </td>
                            </tr>
                          )}
                          {section.lines.map((line) => (
                            <tr key={line.id} className="border-t border-paper-100">
                              {/* Which PI a row belongs to is only a question when there is more
                                  than one. On a single-order list the column would be a column of
                                  the same answer. */}
                              {refs.length > 1 && (
                                <td className="px-2 py-1">
                                  <select
                                    value={line.salesOrderId ?? ""}
                                    disabled={closed}
                                    onChange={(e) =>
                                      updatePackingLine(list.id, section.id, line.id, {
                                        salesOrderId: e.target.value || undefined,
                                      })
                                    }
                                    className={clsx(input, "font-mono")}
                                  >
                                    <option value="">none</option>
                                    {refs.map((r) => (
                                      <option key={r.salesOrderId} value={r.salesOrderId}>
                                        {r.piRef}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              )}
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
                                  value={line.baleNo ?? ""}
                                  disabled={closed}
                                  placeholder="-"
                                  onChange={(e) =>
                                    updatePackingLine(list.id, section.id, line.id, { baleNo: e.target.value })
                                  }
                                  className={clsx(input, "text-center font-mono")}
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
                          {/* Opens the same searchable picker the quotation builder uses, rather
                              than a row of chips. A customer with twenty specifications on one
                              order made that row longer than the table it belonged to. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => setPicking({ listId: list.id, sectionId: section.id })}
                          >
                            Add Item
                          </Button>
                          <button
                            onClick={() =>
                              addPackingLine(list.id, section.id, {
                                // Defaulted to the first PI on the load rather than left blank. A
                                // row belonging to nothing reconciles against nothing, and the
                                // column beside it makes the default easy to correct.
                                salesOrderId: refs[0]?.salesOrderId,
                                itemCode: "",
                                description: "",
                                qtyPcs: 0,
                                netWeightKg: 0,
                                grossWeightKg: 0,
                              })
                            }
                            className="ml-auto rounded-full border border-dashed border-paper-300 px-2.5 py-1 text-[10.5px] text-paper-500 hover:border-manifest-400 hover:text-manifest-700"
                          >
                            + Blank row
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
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="text-[11px]">
                    <span className="mb-1 block font-medium text-paper-600">Container no. (default)</span>
                    <input
                      value={list.containerNo ?? ""}
                      disabled={closed}
                      onChange={(e) => updatePackingList(list.id, { containerNo: e.target.value })}
                      placeholder="e.g. TCLU 4821960"
                      className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 font-mono text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                    />
                  </label>
                  <label className="text-[11px] sm:col-span-2">
                    <span className="mb-1 block font-medium text-paper-600">Remarks</span>
                    <input
                      value={list.remarks ?? ""}
                      disabled={closed}
                      onChange={(e) => updatePackingList(list.id, { remarks: e.target.value })}
                      placeholder="Packing remarks, marks and numbers, strapping…"
                      className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                    />
                  </label>
                </div>
              </Card>
            );
          })}
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
        title={creating?.step === "items" ? "Which items are going?" : "Create packing list"}
        subtitle={
          creating
            ? `${customers.find((c) => c.id === creating.customerId)?.name ?? ""} · ${creating.orders.length} order${
                creating.orders.length === 1 ? "" : "s"
              } in this container`
            : undefined
        }
        width="max-w-3xl"
        footer={
          creating?.step === "items" ? (
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
        {creating?.step === "orders" && (
          <div className="space-y-3">
            <p className="text-xs text-paper-500">
              Tick every order going into this container, and say how each one is going out. A customer filling a
              container with several of their own orders is exactly what this is for, and the scopes can differ, so
              one P.I. can be finished off in the same load that takes another's next partial.
            </p>
            <div className="space-y-2">
              {consolidatableWith(creating.customerId, []).map((o) => {
                const chosen = creating.orders.find((x) => x.salesOrderId === o.id);
                const outstanding = remainingFor(o.id).length;
                return (
                  <div
                    key={o.id}
                    className={clsx(
                      "rounded-lg border p-3 transition-colors",
                      chosen ? "border-manifest-400 bg-manifest-50/50" : "border-paper-200"
                    )}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(chosen)}
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
                  <p className="bg-pine-800 px-3 py-1.5 font-mono text-[11px] font-semibold text-white">
                    P.I. {refForOrder(ref.salesOrderId)}
                    <span className="ml-2 font-normal text-pine-100">{ref.salesOrderId}</span>
                  </p>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-paper-700 text-left font-mono text-[9.5px] uppercase tracking-wide text-white">
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

      <Modal
        open={consolidating !== null}
        onClose={() => setConsolidating(null)}
        title="Add another order to this container"
        subtitle={consolidating ? `${consolidating.id} · ${customerOf(consolidating)?.name ?? ""}` : undefined}
        width="max-w-2xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setConsolidating(null)}>
            Done
          </Button>
        }
      >
        {consolidating && (
          <div className="space-y-2">
            <p className="text-xs text-paper-500">
              Only this customer's other orders are offered. A container is consigned to one party, so a list covering
              two customers would produce a document addressed to nobody.
            </p>
            {consolidatableWith(
              consolidating.customerId,
              listOrders(consolidating).map((r) => r.salesOrderId)
            ).map((o) => {
              const outstanding = remainingFor(o.id).length;
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-pine-800">{refForOrder(o.id)}</p>
                    <p className="text-[11px] text-paper-500">
                      {o.id} ·{" "}
                      {outstanding === 0
                        ? "everything already packed"
                        : `${outstanding} item${outstanding === 1 ? "" : "s"} still to pack`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {SCOPES.map((s) => (
                      <button
                        key={s.id}
                        title={s.help}
                        onClick={() => {
                          addPackingListOrder(consolidating.id, o.id, s.id);
                          pushToast({
                            tone: "success",
                            title: `${refForOrder(o.id)} added to ${consolidating.id}`,
                            description: "Add its rows in a section, then set the weights.",
                          });
                          setConsolidating(null);
                        }}
                        className="rounded-full border border-paper-200 bg-white px-2.5 py-1 text-[11px] font-medium text-paper-600 hover:border-pine-600 hover:bg-pine-50 hover:text-pine-800"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={picking !== null}
        onClose={() => {
          setPicking(null);
          setPicked([]);
          setPickQuery("");
        }}
        title="Add items to this section"
        subtitle={pickingList ? `From ${piRefLine(listOrders(pickingList))}` : undefined}
        width="max-w-3xl"
        footer={
          <>
            <span className="mr-auto text-xs text-paper-500">
              {picked.length} selected · added in the order you tick them
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPicking(null);
                setPicked([]);
                setPickQuery("");
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={picked.length === 0} onClick={addPickedItems}>
              Add Item
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
            <input
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              placeholder="Search code, specification or P.I.…"
              className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-paper-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-pine-700 text-left font-mono text-[9.5px] uppercase tracking-wide text-white">
                  <th className="w-10 py-2 pl-3" />
                  <th className="w-24 px-2 py-2">P.I.</th>
                  <th className="w-32 px-2 py-2">Code</th>
                  <th className="px-2 py-2">Specification</th>
                  <th className="w-20 px-2 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {pickableItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-paper-400">
                      {pickQuery ? "Nothing matches that." : "Every item on this load is already on this list."}
                    </td>
                  </tr>
                )}
                {pickableItems.map(({ salesOrderId, piRef: ref, item: li }) => {
                  const key = `${salesOrderId}::${li.id}`;
                  const at = picked.indexOf(key);
                  return (
                    <tr
                      key={key}
                      onClick={() =>
                        setPicked((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
                      }
                      className={clsx(
                        "cursor-pointer border-t border-paper-100",
                        at >= 0 ? "bg-manifest-50" : "hover:bg-paper-50"
                      )}
                    >
                      <td className="py-1.5 pl-3">
                        <input
                          type="checkbox"
                          checked={at >= 0}
                          onChange={() => {}}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10.5px] text-paper-500">{ref}</td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5">
                          {at >= 0 && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-manifest-600 text-[9px] font-bold text-white">
                              {at + 1}
                            </span>
                          )}
                          <span className="font-mono text-pine-800">{li.itemCode}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-paper-600">{li.description}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{li.qtyPcs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* The draft document, exactly as the PI works: what you see here is what prints, so the two
          cannot drift apart. */}
      <Modal
        open={previewId !== null}
        onClose={() => setPreviewId(null)}
        title={previewList ? `${previewList.id} packing list` : "Packing list"}
        subtitle={
          previewList
            ? `${piRefLine(listOrders(previewList))} · ${
                previewList.finalizedDate ? "closed" : "draft, not yet closed"
              }`
            : undefined
        }
        width="max-w-4xl"
        footer={
          <>
            <span className="mr-auto text-xs text-paper-500">
              {previewList?.finalizedDate
                ? "This is the final document."
                : "Draft. Weights can still change until the list is closed."}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setPreviewId(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={() => window.print()}
            >
              Print
            </Button>
          </>
        }
      >
        {previewList && (
          <PackingListDocument
            list={previewList}
            orders={ordersOf(previewList)}
            customer={customerOf(previewList)}
          />
        )}
      </Modal>

      <Modal
        open={confirmClose !== null}
        onClose={() => setConfirmClose(null)}
        title={`Submit ${confirmClose?.id}?`}
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
                    description: "The inspection report is open. Confirm the weights and send it to the customer.",
                  });
                }
                setConfirmClose(null);
              }}
            >
              Submit to inspection report
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-paper-600">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Submitting opens the <span className="font-semibold">inspection report</span> for this load, the listing
            the customer counter-checks before the container leaves. The weights below carry across to it, and once the
            customer confirms them each order is settled against the kilos actually shipped.
          </p>
          {confirmClose && listOrders(confirmClose).length > 1 && (
            <p>
              This load covers {listOrders(confirmClose).length} orders. All of them move to inspection together, and
              one report goes to the customer for the whole container.
            </p>
          )}
          <p>
            The weights on this list are also what print on the packing list and the bill of lading. Nothing is locked
            permanently, so you can reopen it if something needs correcting.
          </p>
        </div>
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
          Everything recorded on this list is removed, and the quantities on it stop counting towards every order it
          covers.
        </p>
      </Modal>
      </div>

      {/* The printed copy. Hidden on screen, and the only thing on the page when printing. */}
      {previewList && (
        <div className="hidden print:block">
          <PackingListDocument
            list={previewList}
            orders={ordersOf(previewList)}
            customer={customerOf(previewList)}
            domId="packing-list-print"
          />
        </div>
      )}
    </div>
  );
}
