import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, AlertTriangle, CheckCircle2, ChevronLeft, FileText, Printer, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import {
  groupInspectionLines,
  isSuspiciousVariance,
  settleInspection,
  settlementByOrder,
  weightVerdict,
} from "@/lib/inspectionPricing";
import { listOrders } from "@/lib/packing";
import { InspectionReportDocument } from "@/components/domain/InspectionReportDocument";
import { STATUS_LABEL, customerOf, listFor, orderIdsFor, ordersFor, refsFor } from "./helpers";
import clsx from "clsx";

// One inspection report, open for work: the bale-by-bale weights, what they do to each order's
// value, and the customer's answer. The index lists reports; this is where one is worked on.

const numInput =
  "w-24 rounded-lg border border-paper-200 bg-white px-2 py-1 text-right font-mono text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function InspectionReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const [verdictPrompt, setVerdictPrompt] = useState<"confirmed" | "held" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * Whether the preview carries prices.
   *
   * Off by default: the customer is being asked to confirm a manifest, not to re-agree a price, and
   * the sheet reads faster without the money on it. The factory's own copy does carry a rate and an
   * amount per specification, so the toggle is there when that version is the one being sent.
   */
  const [showValues, setShowValues] = useState(false);

  const record = inspections.find((i) => i.id === id);

  if (!record) {
    return (
      <div>
        <PageHeader
          breadcrumb={["Fortune Net & Twine ERP", "Operations", "Inspection"]}
          eyebrow="Pre-Shipment Confirmation"
          title="Inspection report not found"
        />
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title={`No report ${id ?? ""}`}
          description="A report opens automatically when a packing list is closed."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/inspection")}>
              Back to inspection reports
            </Button>
          }
        />
      </div>
    );
  }

  const lines = record.lines ?? [];
  const groups = groupInspectionLines(lines);
  const settlement = settleInspection(lines);
  const byOrder = settlementByOrder(lines);
  const suspicious = isSuspiciousVariance(settlement);
  const open = record.result === "pending" || record.result === "sent";
  const list = listFor(record, packingLists);
  const orders = ordersFor(record, salesOrders);
  const cust = customerOf(record, packingLists, salesOrders, customers);
  const currency = orders[0]?.currency;
  const refs = list ? listOrders(list) : [];
  const verdictWord = weightVerdict(settlement);
  const orderIds = orderIdsFor(record);

  return (
    <div>
      {/* Everything on this screen is marked no-print, and the document is rendered again below,
          outside it, so Ctrl+P produces the report alone rather than the application around it. */}
      <div className="no-print">
        <PageHeader
          breadcrumb={["Fortune Net & Twine ERP", "Operations", record.id]}
          eyebrow="Pre-Shipment Confirmation"
          title={record.id}
          description={`${refsFor(record, packingLists, salesOrders)} · ${cust?.name ?? "-"}${
            list ? ` · from ${list.id}` : ""
          }${record.sentDate ? ` · sent ${formatDate(record.sentDate)}` : ""}`}
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => navigate("/inspection")}
              >
                Back
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" />}
                onClick={() => setPreviewOpen(true)}
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
          }
        />

        <Card>
          <p className="mb-3 text-[11px] text-paper-400">
            {orderIds.map((oid, i) => (
              <span key={oid}>
                {i > 0 && " · "}
                <Link to={`/orders/${oid}`} className="font-mono text-manifest-600 hover:underline">
                  {oid}
                </Link>
              </span>
            ))}
            {record.confirmedDate &&
              ` · ${record.result === "confirmed" ? "confirmed" : "held"} ${formatDate(record.confirmedDate)}`}
          </p>

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
                        {/* One row per specification on screen, with its bales stacked inside the
                            cells. The document is written this way and the weights are entered bale
                            by bale, so splitting them into separate table rows would repeat the
                            specification down the page for nothing. */}
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

              {/* The same four figures the printed report states at the foot, because this is what
                  the customer will read and query. */}
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
                {/* Each order settles on its own variance. On a consolidated container the pooled
                    figure would be meaningless: three orders, three balances. */}
                <div className="mt-2 space-y-0.5 border-t border-pine-200 pt-2 text-[11px]">
                  {orderIds.map((oid) => {
                    const s = byOrder[oid];
                    const order = orders.find((o) => o.id === oid);
                    if (!s || !order) return null;
                    /**
                     * Once a report is settled, the order already carries the settled figure.
                     *
                     * So the recorded value is shown as it stands rather than projecting the
                     * variance on top of it. Adding the delta again would count the same weight
                     * difference twice and quote a number nobody was ever invoiced. The projection
                     * is only meaningful while the report is still open.
                     */
                    const recorded = record.settledOrderValues?.[oid];
                    if (recorded !== undefined) {
                      return (
                        <div key={oid} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-paper-600">
                            <span className="font-mono">{refs.find((r) => r.salesOrderId === oid)?.piRef ?? oid}</span>{" "}
                            settled order value
                          </span>
                          <span className="font-mono font-bold text-pine-800">
                            {formatMoney(recorded, order.currency)}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={oid} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-paper-600">
                          <span className="font-mono">{refs.find((r) => r.salesOrderId === oid)?.piRef ?? oid}</span>{" "}
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
                    That is more than 20% away from the computed weight. Worth checking for a misplaced decimal point
                    before this goes to the customer.
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
                  setVerdictPrompt("held");
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
                  setVerdictPrompt("confirmed");
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
                  {Object.entries(record.settledOrderValues).map(([oid, value], i) => (
                    <span key={oid}>
                      {i > 0 && ", "}
                      <span className="font-mono font-semibold text-pine-800">
                        {formatMoney(value, orders.find((o) => o.id === oid)?.currency)}
                      </span>
                      <span className="text-paper-400">
                        {" "}
                        ({refs.find((r) => r.salesOrderId === oid)?.piRef ?? oid})
                      </span>
                    </span>
                  ))}
                </>
              )}
              {record.remarks && <p className="mt-1 text-paper-600">{record.remarks}</p>}
            </div>
          )}
        </Card>

        <Modal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${record.id} inspection report`}
          subtitle={`${refsFor(record, packingLists, salesOrders)} · for the customer to counter-check`}
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
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              <Button variant="primary" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                Print
              </Button>
            </>
          }
        >
          <InspectionReportDocument
            record={record}
            list={list}
            orders={orders}
            customer={cust}
            showValues={showValues}
          />
        </Modal>

        <Modal
          open={verdictPrompt !== null}
          onClose={() => setVerdictPrompt(null)}
          title={verdictPrompt === "confirmed" ? "Customer confirmed the shipment" : "Hold the container"}
          subtitle={refsFor(record, packingLists, salesOrders)}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setVerdictPrompt(null)}>
                Cancel
              </Button>
              <Button
                variant={verdictPrompt === "confirmed" ? "success" : "danger"}
                size="sm"
                onClick={() => {
                  if (!verdictPrompt) return;
                  if (verdictPrompt === "held" && !remarks.trim()) {
                    pushToast({
                      tone: "warning",
                      title: "Give a reason",
                      description: "A hold blocks the container, so somebody has to be able to read why.",
                    });
                    return;
                  }
                  recordInspection(record.id, verdictPrompt, { remarks: remarks.trim() });
                  pushToast({
                    tone: verdictPrompt === "confirmed" ? "success" : "info",
                    title: verdictPrompt === "confirmed" ? "Shipment confirmed" : "Container held",
                    description:
                      verdictPrompt === "confirmed"
                        ? "Every order on the load is settled on its own measured weight and its balance restated."
                        : "The orders on this load are blocked until the query is resolved.",
                  });
                  setVerdictPrompt(null);
                }}
              >
                {verdictPrompt === "confirmed" ? "Confirm and settle" : "Hold the container"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {verdictPrompt === "confirmed" && lines.length > 0 ? (
              <div className="space-y-1 rounded-lg bg-paper-50 px-3 py-2 text-xs text-paper-600">
                <p>
                  Each order is settled on the weight measured against its own rows, and its outstanding balance is
                  restated. Deposits already taken are left alone.
                </p>
                {orderIds.map((oid) => {
                  const s = byOrder[oid];
                  const order = orders.find((o) => o.id === oid);
                  if (!s || !order) return null;
                  return (
                    <p key={oid} className="font-mono text-[11px]">
                      {oid}: {formatMoney(order.orderValue, order.currency)} →{" "}
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
                {verdictPrompt === "confirmed" ? "What the customer said (optional)" : "What did the customer query?"}
              </span>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder={
                  verdictPrompt === "confirmed"
                    ? "Listing counter-checked against their order. Agreed to ship."
                    : "e.g. Customer expected 8 pcs of No.96 on this container, not 5"
                }
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </label>
          </div>
        </Modal>
      </div>

      {/* The printed copy. Hidden on screen, and the only thing on the page when printing. */}
      <div className="hidden print:block">
        <InspectionReportDocument
          record={record}
          list={list}
          orders={orders}
          customer={cust}
          showValues={showValues}
          domId="inspection-report-print"
        />
      </div>
    </div>
  );
}
