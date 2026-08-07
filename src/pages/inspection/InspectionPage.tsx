import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, CheckCircle2, XCircle, Lock } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { NON_NEGATIVE_INT, toNonNegative } from "@/lib/num";

// Inspection is the release gate. A pass sends the order to Shipment; a fail holds every packed
// carton and blocks the order, so nothing can quietly ship on a failed check.
//
// It sits after Final Payment deliberately: the balance is collected once the goods are packed,
// and inspection is the last thing between payment and loading.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const label = "mb-1 block text-xs font-medium text-paper-600";

export function InspectionPage() {
  const { inspections, packingLists, salesOrders, customers, payments, updateInspection, recordInspection, pushToast } =
    useStore();
  const [draft, setDraft] = useState<Record<string, { cartonsChecked: number; defectsFound: number; remarks: string }>>({});

  const stats = useMemo(
    () => ({
      pending: inspections.filter((i) => i.result === "pending").length,
      passed: inspections.filter((i) => i.result === "pass").length,
      failed: inspections.filter((i) => i.result === "fail").length,
    }),
    [inspections]
  );

  const customerName = (id: string) => {
    const so = salesOrders.find((s) => s.id === id);
    return customers.find((c) => c.id === so?.customerId)?.name ?? "—";
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Quality Control"
        title="Product Inspection"
        description="The release gate before loading. A pass sends the order to shipment; a fail holds the goods."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Awaiting inspection" value={String(stats.pending)} tone="amber" />
        <StatCard label="Passed" value={String(stats.passed)} tone="pine" />
        <StatCard label="Failed" value={String(stats.failed)} tone={stats.failed > 0 ? "alert" : undefined} />
      </div>

      {inspections.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="Nothing awaiting inspection" />
      ) : (
        <div className="space-y-4">
          {inspections.map((rec) => {
            const list = packingLists.find((p) => p.id === rec.packingListId);
            const cartons = list?.cartons.length ?? 0;
            const d = draft[rec.id] ?? { cartonsChecked: cartons, defectsFound: 0, remarks: "" };
            const done = rec.result !== "pending";

            // Inspection releases goods that have been paid for, so the balance is surfaced here
            // rather than making someone open the order to find out.
            const balance = payments.find((p) => p.salesOrderId === rec.salesOrderId && p.type === "balance");
            const balanceCleared = balance?.status === "verified";

            return (
              <Card key={rec.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{rec.id}</span>
                      <Link to={`/orders/${rec.salesOrderId}`} className="font-mono text-sm text-manifest-600 hover:underline">
                        {rec.salesOrderId}
                      </Link>
                      <span className="text-sm font-normal text-paper-500">{customerName(rec.salesOrderId)}</span>
                    </span>
                  }
                  eyebrow={list ? `${list.id} · ${cartons} cartons packed` : "No packing list linked"}
                  action={
                    done ? (
                      <span
                        className={clsx(
                          "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                          rec.result === "pass" ? "bg-pine-100 text-pine-800" : "bg-alert-50 text-alert-700"
                        )}
                      >
                        <Lock className="h-3 w-3" />
                        {rec.result === "pass" ? "Passed" : "Failed"} {rec.inspectedDate ? formatDate(rec.inspectedDate) : ""}
                      </span>
                    ) : undefined
                  }
                />

                {done ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-paper-600">
                      <span className="text-paper-400">Inspector:</span> {rec.inspector || "—"} ·{" "}
                      <span className="text-paper-400">Checked:</span> {rec.cartonsChecked} cartons ·{" "}
                      <span className="text-paper-400">Defects:</span> {rec.defectsFound}
                    </p>
                    {rec.remarks && <p className="text-paper-700">{rec.remarks}</p>}
                  </div>
                ) : (
                  <>
                    {!balanceCleared && (
                      <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                        Balance payment is not yet verified on this order. Inspection can still be recorded, but the
                        goods should not be released for loading until finance clears it.
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={label}>Inspector</label>
                        <input
                          value={rec.inspector}
                          onChange={(e) => updateInspection(rec.id, { inspector: e.target.value })}
                          className={input}
                        />
                      </div>
                      <div>
                        <label className={label}>Cartons checked</label>
                        <input
                          {...NON_NEGATIVE_INT}
                          value={d.cartonsChecked}
                          onChange={(e) =>
                            setDraft({ ...draft, [rec.id]: { ...d, cartonsChecked: toNonNegative(e.target.value) } })
                          }
                          className={input}
                        />
                      </div>
                      <div>
                        <label className={label}>Defects found</label>
                        <input
                          {...NON_NEGATIVE_INT}
                          value={d.defectsFound}
                          onChange={(e) =>
                            setDraft({ ...draft, [rec.id]: { ...d, defectsFound: toNonNegative(e.target.value) } })
                          }
                          className={input}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className={label}>Remarks</label>
                        <textarea
                          rows={2}
                          value={d.remarks}
                          onChange={(e) => setDraft({ ...draft, [rec.id]: { ...d, remarks: e.target.value } })}
                          placeholder="What was checked, against what, and anything found."
                          className={input}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<XCircle className="h-3.5 w-3.5" />}
                        onClick={() => {
                          if (!d.remarks.trim()) {
                            pushToast({ tone: "warning", title: "A failure needs a reason" });
                            return;
                          }
                          recordInspection(rec.id, "fail", d);
                          pushToast({
                            tone: "danger",
                            title: "Inspection failed",
                            description: `${rec.salesOrderId} blocked and cartons held.`,
                          });
                        }}
                      >
                        Fail
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                        onClick={() => {
                          recordInspection(rec.id, "pass", d);
                          pushToast({
                            tone: "success",
                            title: "Inspection passed",
                            description: `${rec.salesOrderId} released for shipment.`,
                          });
                        }}
                      >
                        Pass and release
                      </Button>
                    </div>
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
