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
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate, piRef } from "@/lib/format";
import { reconcilePacking, sectionTotals, verifyPacking } from "@/lib/packing";
import { canPack } from "@/lib/paymentLedger";
import { PackingListDocument } from "@/components/domain/PackingListDocument";
import type { PackingList, ShipmentScope } from "@/lib/types";
import clsx from "clsx";

// Packing is a verification screen, not a carton designer. Its job is to answer one question before
// the goods leave: does what we are shipping match what the customer bought? The plant sends its
// details in whatever shape the job took, so the rows are free-form and grouped into sections the
// user names, and the reconciliation against the order is what the screen actually asserts.

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
   * Scope first, because it changes what the second step is: a full or final shipment takes
   * everything still outstanding and needs no picking, while a partial is precisely the case where
   * somebody has to say which items are going.
   */
  const [creating, setCreating] = useState<{
    salesOrderId: string;
    scope: ShipmentScope;
    step: "scope" | "items";
    picked: Record<string, number>;
  } | null>(null);
  /** The list being previewed as a printable document. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Which section is having items added to it, and what has been ticked so far. */
  const [picking, setPicking] = useState<{ listId: string; sectionId: string } | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
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

  /**
   * Reconciliation counts every list on the order, so a partial is not mistaken for a shortfall.
   * `currentListId` marks which rows the user can actually edit, which decides whether a problem
   * blocks or is merely reported.
   */
  const reconcileFor = (salesOrderId: string, currentListId?: string) =>
    reconcilePacking(
      orderItems(salesOrderId),
      packingLists.filter((p) => p.salesOrderId === salesOrderId),
      currentListId
    );

  const previewList = previewId ? packingLists.find((p) => p.id === previewId) : undefined;

  /** The PI reference as the customer knows it, revision suffix and all. */
  const refForOrder = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const q = order?.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    return q ? piRef(q.id, q.revisionNo) : (order?.quotationId ?? salesOrderId);
  };
  const quotationRefFor = (list: PackingList) => refForOrder(list.salesOrderId);

  /**
   * Which partial this is, counting only the partials on the same order and in the order they were
   * raised. A second load against one PI is the "2nd-Partial Shipment" on the customer's copy.
   */
  const partialNoFor = (list: PackingList) => {
    const partials = packingLists
      .filter((p) => p.salesOrderId === list.salesOrderId && p.scope === "partial")
      .sort((a, b) => a.createdDate.localeCompare(b.createdDate) || a.id.localeCompare(b.id));
    const idx = partials.findIndex((p) => p.id === list.id);
    return idx >= 0 ? idx + 1 : 1;
  };

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

  // Derived from `visible`, so it has to sit after it. `current` is clamped rather than trusted:
  // deleting the last list on page 4 would otherwise leave the user on an empty page.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount);
  const paged = visible.slice((current - 1) * pageSize, current * pageSize);

  const stats = useMemo(() => {
    const open = packingLists.filter((l) => !l.finalizedDate).length;
    const gross = packingLists.reduce((s, l) => s + sectionTotals(l.sections ?? []).grossKg, 0);
    const partials = packingLists.filter((l) => l.scope === "partial" && !l.finalizedDate).length;
    return { open, gross, partials };
  }, [packingLists]);

  /**
   * Creates the list with its rows already on it.
   *
   * A full or final shipment takes everything still outstanding; a partial takes what was ticked.
   * Either way the list opens populated, because a list that starts empty makes the user re-pick
   * what they have just decided, and that is where rows get missed.
   */
  const pickingList = picking ? packingLists.find((p) => p.id === picking.listId) : undefined;

  /**
   * What the picker can offer: order lines not already on this list, filtered by the search box.
   *
   * Already-on-the-list items are excluded rather than shown ticked, because adding one twice
   * creates a duplicate row that then has to be spotted and deleted.
   */
  const pickableItems = (() => {
    if (!pickingList) return [];
    const onList = new Set(
      (pickingList.sections ?? []).flatMap((s) => s.lines.map((l) => l.itemId ?? l.itemCode))
    );
    const q = pickQuery.trim().toLowerCase();
    return orderItems(pickingList.salesOrderId)
      .filter((li) => !onList.has(li.id) && !onList.has(li.itemCode))
      .filter((li) => !q || `${li.itemCode} ${li.description} ${li.specification}`.toLowerCase().includes(q));
  })();

  /** Adds the ticked items in the order they were ticked, then clears the picker. */
  function addPickedItems() {
    if (!picking) return;
    // Mapped over `picked` rather than the table, so the rows land in click order — the same rule
    // the quotation builder's item selection follows.
    picked.forEach((id) => {
      const li = pickableItems.find((x) => x.id === id);
      if (!li) return;
      addPackingLine(picking.listId, picking.sectionId, {
        itemId: li.id,
        itemCode: li.itemCode,
        description: li.description,
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

  function confirmCreate(c: NonNullable<typeof creating>) {
    const rows = reconcileFor(c.salesOrderId).filter((r) => r.orderedQty > 0);
    const lines = rows
      .map((r) => {
        const outstanding = Math.max(0, -r.variance);
        const qty = c.scope === "partial" ? (c.picked[r.itemId] ?? 0) : outstanding;
        return { row: r, qty };
      })
      .filter((x) => x.qty > 0)
      .map(({ row, qty }) => ({
        itemId: row.itemId,
        itemCode: row.itemCode,
        description: row.description,
        qtyPcs: qty,
        netWeightKg: 0,
        grossWeightKg: 0,
      }));

    if (lines.length === 0) {
      pushToast({
        tone: "warning",
        title: "Nothing to pack",
        description:
          c.scope === "partial"
            ? "Tick at least one item for this load."
            : "Everything on this order is already packed.",
      });
      return;
    }

    const id = createPackingList(c.salesOrderId, c.scope, lines);
    pushToast({
      tone: "success",
      title: "Packing list created",
      description: `${id} opened with ${lines.length} item${lines.length === 1 ? "" : "s"}. Add the weights next.`,
    });
    setCreating(null);
  }

  function handleClose(list: PackingList) {
    const verdict = verifyPacking(reconcileFor(list.salesOrderId, list.id), list.scope);
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
        description="Record what is going in the container and check it against the order before it leaves."
      />

      <HowToUse
        id="packing-v2"
        steps={[
          "An order only appears here once its deposit has cleared. If it is waiting on payment, the panel says so and links you to the order.",
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
              // The factory works to the deposit. Packing before it clears commits material and
              // machine time against a customer who has not put money down, which is the exact
              // risk the deposit exists to cover.
              const deposit = canPack(o, payments);
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
                        ? "All items packed — submit a final shipment to close this order out."
                        : `Ready to pack ${outstanding} item${outstanding === 1 ? "" : "s"}.`}
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
                          salesOrderId: o.id,
                          scope: outstanding === 0 ? "final" : "partial",
                          step: "scope",
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
            const rows = reconcileFor(list.salesOrderId, list.id);
            const verdict = verifyPacking(rows, list.scope);
            const totals = sectionTotals(list.sections ?? []);
            return (
              <Card key={list.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-paper-400">
                      {list.id} · {SCOPES.find((s) => s.id === list.scope)?.label ?? list.scope}
                      {closed && ` · closed ${formatDate(list.finalizedDate)}`}
                    </p>
                    {/* The PI is what the customer and the factory both quote back at you, so it
                        is the reference on screen. The sales order number is internal plumbing. */}
                    <p className="text-sm font-semibold text-paper-900">
                      <Link to={`/orders/${list.salesOrderId}`} className="font-mono text-manifest-600 hover:underline">
                        {quotationRefFor(list) ?? list.salesOrderId}
                      </Link>{" "}
                      {cust?.name ?? "—"}
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

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="text-[11px]">
                    <span className="mb-1 block font-medium text-paper-600">Container no.</span>
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
            ? creating.step === "items"
              ? `${SCOPES.find((s) => s.id === creating.scope)?.label} against ${creating.salesOrderId}`
              : `Against ${creating.salesOrderId}`
            : undefined
        }
        width={creating?.step === "items" ? "max-w-3xl" : "max-w-lg"}
        footer={
          creating?.step === "items" ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setCreating({ ...creating, step: "scope" })}>
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
                onClick={() => {
                  if (!creating) return;
                  // A partial is the only scope where somebody has to choose. Full and final take
                  // everything still outstanding, so asking would be a click that decides nothing.
                  if (creating.scope === "partial") {
                    setCreating({ ...creating, step: "items", picked: {} });
                    return;
                  }
                  confirmCreate(creating);
                }}
              >
                {creating?.scope === "partial" ? "Choose items" : "Create list"}
              </Button>
            </>
          )
        }
      >
        {creating?.step === "scope" && (
          <div className="space-y-2">
            <p className="text-xs text-paper-500">What does this load cover?</p>
            {SCOPES.map((s) => (
              <label
                key={s.id}
                className={clsx(
                  "flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors",
                  creating.scope === s.id
                    ? "border-manifest-400 bg-manifest-50/50"
                    : "border-paper-200 hover:border-paper-300"
                )}
              >
                <input
                  type="radio"
                  checked={creating.scope === s.id}
                  onChange={() => setCreating({ ...creating, scope: s.id })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-paper-800">{s.label}</span>
                  <span className="block text-[11px] text-paper-500">{s.help}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {creating?.step === "items" && (
          <div className="space-y-2">
            <p className="text-xs text-paper-500">
              Tick what is going in this load and set the quantity. Anything already packed on an earlier list is
              counted, so the outstanding figure is what is genuinely left.
            </p>
            <div className="overflow-hidden rounded-lg border border-paper-200">
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
                  {remainingFor(creating.salesOrderId).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-paper-400">
                        Everything on this order has already been packed. Close this and use a final shipment instead.
                      </td>
                    </tr>
                  )}
                  {remainingFor(creating.salesOrderId).map((r) => {
                    const outstanding = Math.max(0, -r.variance);
                    const picked = creating.picked[r.itemId] ?? 0;
                    return (
                      <tr
                        key={r.itemId}
                        className={clsx("border-t border-paper-100", picked > 0 && "bg-manifest-50/60")}
                      >
                        <td className="py-1.5 pl-3">
                          <input
                            type="checkbox"
                            checked={picked > 0}
                            onChange={(e) =>
                              setCreating({
                                ...creating,
                                picked: { ...creating.picked, [r.itemId]: e.target.checked ? outstanding : 0 },
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
                            value={picked}
                            onChange={(e) =>
                              setCreating({
                                ...creating,
                                picked: {
                                  ...creating.picked,
                                  [r.itemId]: Math.max(0, Math.min(outstanding, Number(e.target.value) || 0)),
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
          </div>
        )}
      </Modal>

      {/* The draft document, exactly as the PI works: what you see here is what prints, so the two
          cannot drift apart. */}
      <Modal
        open={picking !== null}
        onClose={() => {
          setPicking(null);
          setPicked([]);
          setPickQuery("");
        }}
        title="Add items to this section"
        subtitle={pickingList ? `From ${refForOrder(pickingList.salesOrderId)}` : undefined}
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
              placeholder="Search code or specification…"
              className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-paper-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-pine-700 text-left font-mono text-[9.5px] uppercase tracking-wide text-white">
                  <th className="w-10 py-2 pl-3" />
                  <th className="w-32 px-2 py-2">Code</th>
                  <th className="px-2 py-2">Specification</th>
                  <th className="w-20 px-2 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {pickableItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-paper-400">
                      {pickQuery
                        ? "Nothing matches that."
                        : "Every item on this order is already on this list."}
                    </td>
                  </tr>
                )}
                {pickableItems.map((li) => {
                  const at = picked.indexOf(li.id);
                  return (
                    <tr
                      key={li.id}
                      onClick={() =>
                        setPicked((prev) => (prev.includes(li.id) ? prev.filter((x) => x !== li.id) : [...prev, li.id]))
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

      <Modal
        open={previewId !== null}
        onClose={() => setPreviewId(null)}
        title={previewList ? `${previewList.id} — packing list` : "Packing list"}
        subtitle={
          previewList
            ? `${SCOPES.find((s) => s.id === previewList.scope)?.label} · ${
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
            order={salesOrders.find((o) => o.id === previewList.salesOrderId)}
            customer={customerOf(previewList)}
            quotationRef={quotationRefFor(previewList)}
            partialNo={partialNoFor(previewList)}
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
                    description: "Inspection is open. Weigh the goods there to settle the order value.",
                  });
                }
                setConfirmClose(null);
              }}
            >
              Submit to inspection
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-paper-600">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Submitting sends this list to <span className="font-semibold">Inspection</span>. The goods are weighed
            there and the order value is settled against the actual weight, so the figures below become the ones the
            customer is invoiced on.
          </p>
          <p>
            The weights on this list are also what print on the packing list and the bill of lading. Nothing is locked
            permanently — you can reopen it if something needs correcting.
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
          Everything recorded on this list is removed, and the quantities on it stop counting towards the order.
        </p>
      </Modal>
      </div>

      {/* The printed copy. Hidden on screen, and the only thing on the page when printing. */}
      {previewList && (
        <div className="hidden print:block">
          <PackingListDocument
            list={previewList}
            order={salesOrders.find((o) => o.id === previewList.salesOrderId)}
            customer={customerOf(previewList)}
            quotationRef={quotationRefFor(previewList)}
            partialNo={partialNoFor(previewList)}
            domId="packing-list-print"
          />
        </div>
      )}
    </div>
  );
}
