import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { actualAmountFor, isSuspiciousVariance, settleInspection } from "@/lib/inspectionPricing";
import { sectionTotals } from "@/lib/packing";
import type { InspectionRecord } from "@/lib/types";
import clsx from "clsx";

// Inspection is not only a pass/fail gate. It is where the order stops being an estimate: nets are
// quoted from a standard weight per piece, and the customer is billed for the kilos actually
// shipped. The weights entered here settle the order value and the balance invoiced against it.

const numInput =
  "w-28 rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-right font-mono text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function InspectionPage() {
  const {
    inspections,
    packingLists,
    salesOrders,
    customers,
    updateInspection,
    updateInspectionLine,
    recordInspection,
    pushToast,
  } = useStore();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "pass" | "fail">("all");
  const [verdict, setVerdict] = useState<{ record: InspectionRecord; result: "pass" | "fail" } | null>(null);
  const [remarks, setRemarks] = useState("");

  const customerOf = (soId: string) => {
    const order = salesOrders.find((o) => o.id === soId);
    return customers.find((c) => c.id === order?.customerId);
  };

  const visible = useMemo(
    () =>
      inspections.filter((i) => {
        if (filter !== "all" && i.result !== filter) return false;
        if (query) {
          const haystack = `${i.id} ${i.salesOrderId} ${customerOf(i.salesOrderId)?.name ?? ""}`.toLowerCase();
          if (!haystack.includes(query.toLowerCase())) return false;
        }
        return true;
      }),
    // eslint-disable-next-line
    [inspections, filter, query, salesOrders, customers]
  );

  const stats = useMemo(
    () => ({
      awaiting: inspections.filter((i) => i.result === "pending").length,
      passed: inspections.filter((i) => i.result === "pass").length,
      failed: inspections.filter((i) => i.result === "fail").length,
    }),
    [inspections]
  );

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Quality Control"
        title="Inspection"
        description="Weigh the packed goods, settle the order value, and release or hold the shipment."
      />

      <HowToUse
        id="inspection-v2"
        steps={[
          "An inspection opens by itself when a packing list is closed. You do not create one by hand.",
          "Weigh each item and type the actual weight beside the quoted one. Anything you do not touch keeps the quoted figure.",
          "Watch the settlement panel. It reprices every line at the price per kilo the quotation already implies, so the order value follows the weight actually shipped.",
          "Record how many cartons you checked and any defects found.",
          "Press Pass to release the goods. The settled value is written to the sales order and the balance payment is restated against it.",
          "Press Fail to hold the goods. The order is blocked with your remarks against it until somebody deals with the problem.",
        ]}
        note="A variance over 20% is flagged as a possible typo. It is a warning, not a block, because occasionally it is real."
      />

      <div className="mb-5 grid grid-cols-3 gap-4">
        <StatCard label="Awaiting inspection" value={String(stats.awaiting)} tone="amber" />
        <StatCard label="Passed" value={String(stats.passed)} tone="pine" />
        <StatCard label="Failed" value={String(stats.failed)} tone={stats.failed > 0 ? "alert" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inspection, order or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "pending", "pass", "fail"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f
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
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="No inspections match your filters"
          description="An inspection opens automatically when a packing list is closed."
        />
      ) : (
        <div className="space-y-4">
          {visible.map((record) => {
            const lines = record.lines ?? [];
            const settlement = settleInspection(lines);
            const suspicious = isSuspiciousVariance(settlement);
            const open = record.result === "pending";
            const cust = customerOf(record.salesOrderId);
            const list = packingLists.find((p) => p.id === record.packingListId);
            const order = salesOrders.find((o) => o.id === record.salesOrderId);
            const packed = list ? sectionTotals(list.sections ?? []) : null;

            return (
              <Card key={record.id}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-paper-400">
                      {record.id}
                      {list && ` · from ${list.id}`}
                      {packed && ` · ${packed.pieces} pcs packed`}
                    </p>
                    <p className="text-sm font-semibold text-paper-900">
                      <Link
                        to={`/orders/${record.salesOrderId}`}
                        className="font-mono text-manifest-600 hover:underline"
                      >
                        {record.salesOrderId}
                      </Link>{" "}
                      {cust?.name ?? "—"}
                    </p>
                    {record.inspectedDate && (
                      <p className="text-[11px] text-paper-400">
                        {record.result === "pass" ? "Passed" : "Failed"} {formatDate(record.inspectedDate)} ·{" "}
                        {record.inspector}
                      </p>
                    )}
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide",
                      record.result === "pass" && "bg-pine-100 text-pine-800",
                      record.result === "fail" && "bg-alert-100 text-alert-700",
                      record.result === "pending" && "bg-amber-100 text-amber-800"
                    )}
                  >
                    {record.result === "pending" ? "Awaiting" : record.result}
                  </span>
                </div>

                {lines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-paper-300 py-6 text-center text-xs text-paper-400">
                    No measurement sheet on this inspection. It predates weight settlement, so its order value stands as
                    quoted.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-paper-100 text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                            <th className="px-2 py-1.5">Item</th>
                            <th className="w-16 px-2 py-1.5 text-right">Pcs</th>
                            <th className="w-28 px-2 py-1.5 text-right">Quoted KG</th>
                            <th className="w-32 px-2 py-1.5 text-right">Actual KG</th>
                            <th className="w-28 px-2 py-1.5 text-right">Quoted</th>
                            <th className="w-28 px-2 py-1.5 text-right">Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line) => {
                            const actual = actualAmountFor(line);
                            const delta = actual - line.quotedAmount;
                            return (
                              <tr key={line.id} className="border-b border-paper-100 last:border-0">
                                <td className="px-2 py-1.5">
                                  <span className="font-mono text-pine-800">{line.itemCode}</span>
                                  <span className="ml-2 text-paper-500">{line.description}</span>
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono">{line.qtyPcs}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-paper-500">
                                  {line.quotedWeightKg.toFixed(2)}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.actualWeightKg}
                                    disabled={!open}
                                    onChange={(e) =>
                                      updateInspectionLine(
                                        record.id,
                                        line.id,
                                        Math.max(0, Number(e.target.value) || 0)
                                      )
                                    }
                                    className={numInput}
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono text-paper-500">
                                  {formatMoney(line.quotedAmount, order?.currency)}
                                </td>
                                <td
                                  className={clsx(
                                    "px-2 py-1.5 text-right font-mono font-semibold",
                                    Math.abs(delta) < 0.005
                                      ? "text-paper-700"
                                      : delta > 0
                                        ? "text-pine-700"
                                        : "text-alert-600"
                                  )}
                                >
                                  {formatMoney(actual, order?.currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 rounded-lg border border-pine-200 bg-pine-50 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="text-paper-600">
                          Weight {settlement.quotedWeightKg.toFixed(2)} → {settlement.actualWeightKg.toFixed(2)} KG
                        </span>
                        <span className="text-paper-600">
                          Order value {formatMoney(settlement.quotedValue, order?.currency)} →{" "}
                          <span className="font-mono text-sm font-bold text-pine-800">
                            {formatMoney(settlement.actualValue, order?.currency)}
                          </span>
                        </span>
                        <span
                          className={clsx(
                            "font-mono font-semibold",
                            Math.abs(settlement.difference) < 0.005
                              ? "text-paper-500"
                              : settlement.difference > 0
                                ? "text-pine-700"
                                : "text-alert-600"
                          )}
                        >
                          {settlement.difference >= 0 ? "+" : ""}
                          {formatMoney(settlement.difference, order?.currency)} (
                          {settlement.differencePct >= 0 ? "+" : ""}
                          {settlement.differencePct.toFixed(1)}%)
                        </span>
                      </div>
                      {suspicious && open && (
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          That is more than 20% away from the quoted value. Worth checking for a misplaced decimal
                          point before this is invoiced.
                        </p>
                      )}
                    </div>
                  </>
                )}

                {open ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-xs">
                      <span className="mb-1 block font-medium text-paper-600">Cartons checked</span>
                      <input
                        type="number"
                        min={0}
                        value={record.cartonsChecked}
                        onChange={(e) =>
                          updateInspection(record.id, { cartonsChecked: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className={numInput}
                      />
                    </label>
                    <label className="text-xs">
                      <span className="mb-1 block font-medium text-paper-600">Defects found</span>
                      <input
                        type="number"
                        min={0}
                        value={record.defectsFound}
                        onChange={(e) =>
                          updateInspection(record.id, { defectsFound: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className={numInput}
                      />
                    </label>
                    <div className="ml-auto flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setVerdict({ record, result: "fail" });
                          setRemarks(record.remarks ?? "");
                        }}
                      >
                        Fail and hold
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setVerdict({ record, result: "pass" });
                          setRemarks(record.remarks ?? "");
                        }}
                      >
                        Pass and settle
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-paper-500">
                    Checked {record.cartonsChecked} cartons · {record.defectsFound} defects
                    {record.revisedOrderValue !== undefined && (
                      <>
                        {" · "}order settled at{" "}
                        <span className="font-mono font-semibold text-pine-800">
                          {formatMoney(record.revisedOrderValue, order?.currency)}
                        </span>
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
        open={verdict !== null}
        onClose={() => setVerdict(null)}
        title={verdict?.result === "pass" ? "Pass and settle the order" : "Fail and hold the goods"}
        subtitle={verdict ? verdict.record.salesOrderId : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setVerdict(null)}>
              Cancel
            </Button>
            <Button
              variant={verdict?.result === "pass" ? "success" : "danger"}
              size="sm"
              onClick={() => {
                if (!verdict) return;
                if (verdict.result === "fail" && !remarks.trim()) {
                  pushToast({
                    tone: "warning",
                    title: "Give a reason",
                    description: "A failure blocks the order, so somebody has to be able to read why.",
                  });
                  return;
                }
                recordInspection(verdict.record.id, verdict.result, {
                  cartonsChecked: verdict.record.cartonsChecked,
                  defectsFound: verdict.record.defectsFound,
                  remarks: remarks.trim(),
                });
                pushToast({
                  tone: verdict.result === "pass" ? "success" : "info",
                  title: verdict.result === "pass" ? "Inspection passed" : "Goods held",
                  description:
                    verdict.result === "pass"
                      ? "Order value settled on actual weight. The balance has been restated."
                      : "The order is blocked until this is resolved.",
                });
                setVerdict(null);
              }}
            >
              {verdict?.result === "pass" ? "Pass and settle" : "Fail and hold"}
            </Button>
          </>
        }
      >
        {verdict && (
          <div className="space-y-3">
            {verdict.result === "pass" && verdict.record.lines?.length ? (
              <div className="rounded-lg bg-paper-50 px-3 py-2 text-xs text-paper-600">
                The order value becomes{" "}
                <span className="font-mono font-semibold text-pine-800">
                  {formatMoney(settleInspection(verdict.record.lines).actualValue)}
                </span>{" "}
                and the outstanding balance is restated against it. The deposit already taken is left alone.
              </div>
            ) : null}
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-paper-600">
                {verdict.result === "pass" ? "Remarks (optional)" : "What is wrong?"}
              </span>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder={
                  verdict.result === "pass"
                    ? "Mesh depth and selvage checked against the PI. Marks legible."
                    : "e.g. Mesh depth 2MD short on three bales"
                }
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
