import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Search, AlertTriangle, CheckCircle2, FileText, Printer, Send } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import {
  groupInspectionLines,
  isSuspiciousVariance,
  settleInspection,
  settlementByOrder,
  weightVerdict,
} from "@/lib/inspectionPricing";
import { listOrders, piRefLine } from "@/lib/packing";
import { InspectionReportDocument } from "@/components/domain/InspectionReportDocument";
import type { InspectionRecord, SalesOrder } from "@/lib/types";
import clsx from "clsx";

// The inspection report is not a quality check, despite the name the factory has always used for
// it. It is the listing of what is about to be shipped, every bale with its number and its net and
// gross weight, sent to the customer so they can counter-check it against their own order and
// confirm the container may leave.
//
// The weights are why it matters. Nets are quoted from a standard weight per piece and the customer
// is billed for the kilos actually shipped, so the figures confirmed here are what each order's
// balance is invoiced against. Nothing on this screen passes or fails anything.

const numInput =
  "w-24 rounded-lg border border-paper-200 bg-white px-2 py-1 text-right font-mono text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

const FILTERS: { id: "all" | "pending" | "sent" | "confirmed" | "held"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Being prepared" },
  { id: "sent", label: "With the customer" },
  { id: "confirmed", label: "Confirmed" },
  { id: "held", label: "Held" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Preparing",
  sent: "With customer",
  confirmed: "Confirmed",
  held: "Held",
};

export function InspectionPage() {
  const {
    inspections,
    packingLists,
    salesOrders,
    customers,
    updateInspectionLine,
    sendInspectionReport,
    recordInspection,
    pushToast,
  } = useStore();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "confirmed" | "held">("all");
  const [verdict, setVerdict] = useState<{ record: InspectionRecord; result: "confirmed" | "held" } | null>(null);
  const [remarks, setRemarks] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  /**
   * Whether the preview carries prices.
   *
   * Off by default: the customer is being asked to confirm a manifest, not to re-agree a price, and
   * the sheet reads faster without the money on it. The factory's own copy does carry a rate and an
   * amount per specification, so the toggle is there when that version is the one being sent.
   */
  const [showValues, setShowValues] = useState(false);

  const listFor = (record: InspectionRecord) => packingLists.find((p) => p.id === record.packingListId);
  const orderIdsFor = (record: InspectionRecord): string[] =>
    record.salesOrderIds ?? (record.salesOrderId ? [record.salesOrderId] : []);
  const ordersFor = (record: InspectionRecord): SalesOrder[] =>
    orderIdsFor(record)
      .map((id) => salesOrders.find((o) => o.id === id))
      .filter((o): o is SalesOrder => Boolean(o));
  const customerOf = (record: InspectionRecord) => {
    const list = listFor(record);
    if (list) return customers.find((c) => c.id === list.customerId);
    return customers.find((c) => c.id === ordersFor(record)[0]?.customerId);
  };
  /** The PI references the report covers, as the customer's copy writes them. */
  const refsFor = (record: InspectionRecord) => {
    const list = listFor(record);
    if (list) return piRefLine(listOrders(list));
    const ids = orderIdsFor(record).map((id) => {
      const order = salesOrders.find((o) => o.id === id);
      return order?.quotationId ?? id;
    });
    return ids.join(", ");
  };

  const visible = useMemo(
    () =>
      inspections.filter((i) => {
        if (filter !== "all" && i.result !== filter) return false;
        if (query) {
          const ids = i.salesOrderIds ?? (i.salesOrderId ? [i.salesOrderId] : []);
          const cust = customers.find(
            (c) => c.id === packingLists.find((p) => p.id === i.packingListId)?.customerId
          );
          const haystack = `${i.id} ${i.packingListId ?? ""} ${ids.join(" ")} ${cust?.name ?? ""}`;
          if (!haystack.toLowerCase().includes(query.toLowerCase())) return false;
        }
        return true;
      }),
    [inspections, filter, query, customers, packingLists]
  );

  const stats = useMemo(
    () => ({
      preparing: inspections.filter((i) => i.result === "pending").length,
      withCustomer: inspections.filter((i) => i.result === "sent").length,
      held: inspections.filter((i) => i.result === "held").length,
    }),
    [inspections]
  );

  const previewRecord = previewId ? inspections.find((i) => i.id === previewId) : undefined;

  return (
    <div>
      {/* Everything on this screen is marked no-print, and the document is rendered again below,
          outside it, so Ctrl+P produces the report alone rather than the application around it. */}
      <div className="no-print">
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Pre-Shipment Confirmation"
        title="Inspection Report"
        description="Confirm the weights of what is packed, send the listing to the customer, and release the container once they agree."
      />

      <HowToUse
        id="inspection-v3"
        steps={[
          "A report opens by itself when a packing list is closed. You do not create one by hand.",
          "It lists every bale in the container with the weights recorded at packing. Check them against the scale and correct anything that is out.",
          "Watch the weight panel. It compares the computed weight the order was priced from against what the goods actually weigh, the same way the printed report states it.",
          "Press Preview to see the document, and Print or send it to the customer so they can counter-check the listing.",
          "Press Sent to customer once it has gone, so it is clear who is being waited on.",
          "When the customer agrees the load can ship, press Customer confirmed. Every order on the report is settled against its own measured weight and its balance is restated.",
          "If they come back with a query, press Hold and record what they said. The container is blocked until it is resolved.",
        ]}
        note="This is not a quality check. It is the shipping listing the customer signs off, and the weights on it are what the balance is invoiced against."
      />

      <div className="mb-5 grid grid-cols-3 gap-4">
        <StatCard label="Reports being prepared" value={String(stats.preparing)} tone="amber" />
        <StatCard label="Awaiting customer" value={String(stats.withCustomer)} />
        <StatCard label="Held by the customer" value={String(stats.held)} tone={stats.held > 0 ? "alert" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search report, load, order or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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

      {visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="No inspection reports match your filters"
          description="A report opens automatically when a packing list is closed."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((record) => {
            const lines = record.lines ?? [];
            const groups = groupInspectionLines(lines);
            const settlement = settleInspection(lines);
            const byOrder = settlementByOrder(lines);
            const suspicious = isSuspiciousVariance(settlement);
            const open = record.result === "pending" || record.result === "sent";
            const cust = customerOf(record);
            const list = listFor(record);
            const orders = ordersFor(record);
            const currency = orders[0]?.currency;
            const refs = list ? listOrders(list) : [];
            const verdictWord = weightVerdict(settlement);

            return (
              <Card key={record.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-paper-400">
                      {record.id}
                      {list && ` · from ${list.id}`}
                      {refs.length > 1 && ` · ${refs.length} orders in one container`}
                    </p>
                    <p className="text-sm font-semibold text-paper-900">
                      {refsFor(record)} <span className="font-normal text-paper-600">{cust?.name ?? "-"}</span>
                    </p>
                    <p className="text-[11px] text-paper-400">
                      {orderIdsFor(record).map((id, i) => (
                        <span key={id}>
                          {i > 0 && " · "}
                          <Link to={`/orders/${id}`} className="font-mono text-manifest-600 hover:underline">
                            {id}
                          </Link>
                        </span>
                      ))}
                      {record.sentDate && ` · sent ${formatDate(record.sentDate)}`}
                      {record.confirmedDate &&
                        ` · ${record.result === "confirmed" ? "confirmed" : "held"} ${formatDate(record.confirmedDate)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileText className="h-3.5 w-3.5" />}
                      onClick={() => setPreviewId(record.id)}
                    >
                      Preview
                    </Button>
                    <span
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide",
                        record.result === "confirmed" && "bg-pine-100 text-pine-800",
                        record.result === "held" && "bg-alert-100 text-alert-700",
                        record.result === "sent" && "bg-manifest-100 text-manifest-700",
                        record.result === "pending" && "bg-amber-100 text-amber-800"
                      )}
                    >
                      {STATUS_LABEL[record.result] ?? record.result}
                    </span>
                  </div>
                </div>

                {lines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-paper-300 py-6 text-center text-xs text-paper-400">
                    No listing on this report. It predates weight confirmation, so its order value stands as quoted.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-paper-100 text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                            <th className="px-2 py-1.5">Item</th>
                            <th className="w-14 px-2 py-1.5 text-center">Bale</th>
                            <th className="w-12 px-2 py-1.5 text-right">Pcs</th>
                            <th className="w-24 px-2 py-1.5 text-right">Computed KG</th>
                            <th className="w-28 px-2 py-1.5 text-right">Net KG</th>
                            <th className="w-28 px-2 py-1.5 text-right">Gross KG</th>
                            <th className="w-24 px-2 py-1.5 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((group) => (
                            <tr key={group.key} className="border-b border-paper-100 last:border-0 align-top">
                              <td className="px-2 py-1.5">
                                {refs.length > 1 && (
                                  <span className="mr-1.5 rounded bg-paper-100 px-1 py-0.5 font-mono text-[9.5px] text-paper-500">
                                    {refs.find((r) => r.salesOrderId === group.salesOrderId)?.piRef ?? group.salesOrderId}
                                  </span>
                                )}
                                <span className="font-mono text-pine-800">{group.itemCode}</span>
                                <span className="ml-2 text-paper-500">{group.description}</span>
                              </td>
                              {/* One row per specification on screen, with its bales stacked inside
                                  the cells. The document is written this way and the weights are
                                  entered bale by bale, so splitting them into separate table rows
                                  would repeat the specification down the page for nothing. */}
                              <td className="px-2 py-1.5 text-center">
                                {group.bales.map((b) => (
                                  <div key={b.id} className="py-0.5 font-mono text-[11px] leading-6 text-paper-500">
                                    {b.baleNo}
                                  </div>
                                ))}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {group.bales.map((b) => (
                                  <div key={b.id} className="py-0.5 font-mono leading-6">
                                    {b.qtyPcs}
                                  </div>
                                ))}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {group.bales.map((b) => (
                                  <div key={b.id} className="py-0.5 font-mono leading-6 text-paper-500">
                                    {b.computedWeightKg.toFixed(2)}
                                  </div>
                                ))}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {group.bales.map((b) => (
                                  <div key={b.id} className="py-0.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={b.netWeightKg}
                                      disabled={!open}
                                      onChange={(e) =>
                                        updateInspectionLine(record.id, b.id, {
                                          netWeightKg: Math.max(0, Number(e.target.value) || 0),
                                        })
                                      }
                                      className={numInput}
                                      aria-label={`Net weight, bale ${b.baleNo}`}
                                    />
                                  </div>
                                ))}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {group.bales.map((b) => (
                                  <div key={b.id} className="py-0.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={b.grossWeightKg}
                                      disabled={!open}
                                      onChange={(e) =>
                                        updateInspectionLine(record.id, b.id, {
                                          grossWeightKg: Math.max(0, Number(e.target.value) || 0),
                                        })
                                      }
                                      className={numInput}
                                      aria-label={`Gross weight, bale ${b.baleNo}`}
                                    />
                                  </div>
                                ))}
                              </td>
                              <td
                                className={clsx(
                                  "px-2 py-1.5 text-right font-mono font-semibold",
                                  Math.abs(group.actualAmount - group.quotedAmount) < 0.005
                                    ? "text-paper-700"
                                    : group.actualAmount > group.quotedAmount
                                      ? "text-pine-700"
                                      : "text-alert-600"
                                )}
                              >
                                {formatMoney(group.actualAmount, currency)}
                                <span className="block text-[10px] font-normal text-paper-400">
                                  was {formatMoney(group.quotedAmount, currency)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* The same four figures the printed report states at the foot, because this is
                        what the customer will read and query. */}
                    <div className="mt-3 rounded-lg border border-pine-200 bg-pine-50 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="text-paper-600">
                          Computed {settlement.computedWeightKg.toFixed(2)} → net{" "}
                          <span className="font-mono font-semibold text-paper-800">
                            {settlement.netWeightKg.toFixed(2)}
                          </span>{" "}
                          KG · gross {settlement.grossWeightKg.toFixed(2)} KG
                        </span>
                        <span
                          className={clsx(
                            "font-mono font-semibold",
                            verdictWord === "On weight"
                              ? "text-paper-500"
                              : verdictWord === "Underweight"
                                ? "text-amber-700"
                                : "text-pine-700"
                          )}
                        >
                          {settlement.weightDifferenceKg >= 0 ? "+" : ""}
                          {settlement.weightDifferenceKg.toFixed(2)} KG (
                          {settlement.weightDifferencePct >= 0 ? "+" : ""}
                          {settlement.weightDifferencePct.toFixed(2)}%) · {verdictWord}
                        </span>
                      </div>
                      {/* Each order settles on its own variance. On a consolidated container the
                          pooled figure would be meaningless: three orders, three balances. */}
                      <div className="mt-2 space-y-0.5 border-t border-pine-200 pt-2 text-[11px]">
                        {orderIdsFor(record).map((id) => {
                          const s = byOrder[id];
                          const order = orders.find((o) => o.id === id);
                          if (!s || !order) return null;
                          /**
                           * Once a report is settled, the order already carries the settled figure.
                           *
                           * So the recorded value is shown as it stands rather than projecting the
                           * variance on top of it. Adding the delta again would count the same
                           * weight difference twice and quote a number nobody was ever invoiced.
                           * The projection is only meaningful while the report is still open.
                           */
                          const recorded = record.settledOrderValues?.[id];
                          if (recorded !== undefined) {
                            return (
                              <div key={id} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-paper-600">
                                  <span className="font-mono">
                                    {refs.find((r) => r.salesOrderId === id)?.piRef ?? id}
                                  </span>{" "}
                                  settled order value
                                </span>
                                <span className="font-mono font-bold text-pine-800">
                                  {formatMoney(recorded, order.currency)}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div key={id} className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-paper-600">
                                <span className="font-mono">
                                  {refs.find((r) => r.salesOrderId === id)?.piRef ?? id}
                                </span>{" "}
                                order value
                              </span>
                              <span className="text-paper-600">
                                {formatMoney(order.orderValue, order.currency)} →{" "}
                                <span className="font-mono font-bold text-pine-800">
                                  {formatMoney(order.orderValue + s.difference, order.currency)}
                                </span>
                                <span
                                  className={clsx(
                                    "ml-2 font-mono",
                                    Math.abs(s.difference) < 0.005
                                      ? "text-paper-400"
                                      : s.difference > 0
                                        ? "text-pine-700"
                                        : "text-alert-600"
                                  )}
                                >
                                  ({s.difference >= 0 ? "+" : ""}
                                  {formatMoney(s.difference, order.currency)})
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {suspicious && open && (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          That is more than 20% away from the computed weight. Worth checking for a misplaced decimal
                          point before this goes to the customer.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {open ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <p className="mr-auto max-w-md text-[11px] leading-snug text-paper-500">
                      {record.result === "sent"
                        ? "With the customer. Record their answer when it comes back."
                        : "Check the weights, preview the report, then send it to the customer to counter-check."}
                    </p>
                    {record.result === "pending" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Send className="h-3.5 w-3.5" />}
                        onClick={() => {
                          sendInspectionReport(record.id);
                          pushToast({
                            tone: "info",
                            title: "Marked as sent",
                            description: `${record.id} is with the customer for confirmation.`,
                          });
                        }}
                      >
                        Sent to customer
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setVerdict({ record, result: "held" });
                        setRemarks(record.remarks ?? "");
                      }}
                    >
                      Hold
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setVerdict({ record, result: "confirmed" });
                        setRemarks(record.remarks ?? "");
                      }}
                    >
                      Customer confirmed
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-paper-500">
                    Prepared by {record.preparedBy || "-"}
                    {record.settledOrderValues && Object.keys(record.settledOrderValues).length > 0 && (
                      <>
                        {" · settled at "}
                        {Object.entries(record.settledOrderValues).map(([id, value], i) => (
                          <span key={id}>
                            {i > 0 && ", "}
                            <span className="font-mono font-semibold text-pine-800">
                              {formatMoney(value, orders.find((o) => o.id === id)?.currency)}
                            </span>
                            <span className="text-paper-400"> ({refs.find((r) => r.salesOrderId === id)?.piRef ?? id})</span>
                          </span>
                        ))}
                      </>
                    )}
                    {record.remarks && <p className="mt-1 text-paper-600">{record.remarks}</p>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={previewId !== null}
        onClose={() => setPreviewId(null)}
        title={previewRecord ? `${previewRecord.id} inspection report` : "Inspection report"}
        subtitle={previewRecord ? `${refsFor(previewRecord)} · for the customer to counter-check` : undefined}
        width="max-w-4xl"
        footer={
          <>
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-paper-600">
              <input
                type="checkbox"
                checked={showValues}
                onChange={(e) => setShowValues(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
              />
              Show rates and amounts
            </label>
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
        {previewRecord && (
          <InspectionReportDocument
            record={previewRecord}
            list={listFor(previewRecord)}
            orders={ordersFor(previewRecord)}
            customer={customerOf(previewRecord)}
            showValues={showValues}
          />
        )}
      </Modal>

      <Modal
        open={verdict !== null}
        onClose={() => setVerdict(null)}
        title={verdict?.result === "confirmed" ? "Customer confirmed the shipment" : "Hold the container"}
        subtitle={verdict ? refsFor(verdict.record) : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setVerdict(null)}>
              Cancel
            </Button>
            <Button
              variant={verdict?.result === "confirmed" ? "success" : "danger"}
              size="sm"
              onClick={() => {
                if (!verdict) return;
                if (verdict.result === "held" && !remarks.trim()) {
                  pushToast({
                    tone: "warning",
                    title: "Give a reason",
                    description: "A hold blocks the container, so somebody has to be able to read why.",
                  });
                  return;
                }
                recordInspection(verdict.record.id, verdict.result, { remarks: remarks.trim() });
                pushToast({
                  tone: verdict.result === "confirmed" ? "success" : "info",
                  title: verdict.result === "confirmed" ? "Shipment confirmed" : "Container held",
                  description:
                    verdict.result === "confirmed"
                      ? "Every order on the load is settled on its own measured weight and its balance restated."
                      : "The orders on this load are blocked until the query is resolved.",
                });
                setVerdict(null);
              }}
            >
              {verdict?.result === "confirmed" ? "Confirm and settle" : "Hold the container"}
            </Button>
          </>
        }
      >
        {verdict && (
          <div className="space-y-3">
            {verdict.result === "confirmed" && verdict.record.lines?.length ? (
              <div className="space-y-1 rounded-lg bg-paper-50 px-3 py-2 text-xs text-paper-600">
                <p>
                  Each order is settled on the weight measured against its own rows, and its outstanding balance is
                  restated. Deposits already taken are left alone.
                </p>
                {orderIdsFor(verdict.record).map((id) => {
                  const s = settlementByOrder(verdict.record.lines ?? [])[id];
                  const order = salesOrders.find((o) => o.id === id);
                  if (!s || !order) return null;
                  return (
                    <p key={id} className="font-mono text-[11px]">
                      {id}: {formatMoney(order.orderValue, order.currency)} →{" "}
                      <span className="font-semibold text-pine-800">
                        {formatMoney(order.orderValue + s.difference, order.currency)}
                      </span>
                    </p>
                  );
                })}
              </div>
            ) : null}
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-paper-600">
                {verdict.result === "confirmed" ? "What the customer said (optional)" : "What did the customer query?"}
              </span>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder={
                  verdict.result === "confirmed"
                    ? "Listing counter-checked against their order. Agreed to ship."
                    : "e.g. Customer expected 8 pcs of No.96 on this container, not 5"
                }
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </label>
          </div>
        )}
      </Modal>
      </div>

      {/* The printed copy. Hidden on screen, and the only thing on the page when printing. */}
      {previewRecord && (
        <div className="hidden print:block">
          <InspectionReportDocument
            record={previewRecord}
            list={listFor(previewRecord)}
            orders={ordersFor(previewRecord)}
            customer={customerOf(previewRecord)}
            showValues={showValues}
            domId="inspection-report-print"
          />
        </div>
      )}
    </div>
  );
}
