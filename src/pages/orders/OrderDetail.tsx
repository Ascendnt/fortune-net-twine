import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ChevronLeft,
  ArrowRightCircle,
  AlertTriangle,
  FileText,
  Wallet,
  Package,
  CheckCircle2,
  ReceiptText,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { LifecycleStepper } from "@/components/domain/LifecycleStepper";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { useStore } from "@/lib/store";
import { DOCUMENTS } from "@/lib/mockData";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { ORDER_STAGES } from "@/lib/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "payments", label: "Payments" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity History" },
];

export function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { salesOrders, quotations, payments, invoices, activity, advanceStage, generateInvoice, verifyPayment, role, pushToast, customers } =
    useStore();
  const [tab, setTab] = useState("overview");
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shippedQty, setShippedQty] = useState<Record<string, number>>({});

  const order = salesOrders.find((o) => o.id === id);
  const quotation = order ? quotations.find((q) => q.id === order.quotationId) : undefined;
  const customer = order ? customers.find((c) => c.id === order.customerId) : undefined;
  const orderPayments = payments.filter((p) => p.salesOrderId === id);
  const orderActivity = activity.filter((a) => a.recordId === id);
  const orderDocs = DOCUMENTS.filter((d) => d.relatedOrderId === id);
  const invoice = order?.invoiceId ? invoices.find((i) => i.id === order.invoiceId) : undefined;

  if (!order) {
    return (
      <div>
        <PageHeader title="Sales order not found" breadcrumb={["Fortune Net & Twine ERP", "Sales Orders"]} />
        <Button variant="secondary" onClick={() => navigate("/orders")}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to Sales Orders
        </Button>
      </div>
    );
  }

  const currentStageMeta = ORDER_STAGES.find((s) => s.id === order.currentStage)!;
  const currentStageRec = order.stages.find((s) => s.stage === order.currentStage);
  const blockedStage = order.stages.find((s) => s.status === "blocked");
  const depositPayment = orderPayments.find((p) => p.type === "deposit");
  const balancePayment = orderPayments.find((p) => p.type === "balance");
  const totalExpected = orderPayments.reduce((s, p) => s + p.expectedAmount, 0);
  const totalReceived = orderPayments.reduce((s, p) => s + p.amountReceived, 0);
  const progressPct = Math.round(
    (order.stages.filter((s) => s.status === "completed").length / ORDER_STAGES.length) * 100
  );

  const roleMatchesOwner =
    (currentStageMeta.role === "Finance" && role === "finance") ||
    (currentStageMeta.role === "Sales" && (role === "sales_rep" || role === "sales_manager")) ||
    (currentStageMeta.role === "Logistics" && role === "logistics") ||
    (currentStageMeta.role === "Factory Technical" && role === "factory_technical") ||
    role === "admin" ||
    role === "management";

  function handleAdvance() {
    advanceStage(order!.id);
  }

  function openShipModal() {
    const defaults: Record<string, number> = {};
    quotation?.items.forEach((li) => {
      defaults[li.id] = li.qtyPcs;
    });
    setShippedQty(defaults);
    setShipModalOpen(true);
  }

  function handleGenerateInvoice() {
    const invId = generateInvoice(order!.id, shippedQty);
    setShipModalOpen(false);
    if (invId) {
      const isPartial = quotation?.items.some((li) => (shippedQty[li.id] ?? li.qtyPcs) !== li.qtyPcs);
      pushToast({
        tone: "success",
        title: "Commercial Invoice generated",
        description: isPartial ? `${invId}: partial shipment recalculated on actual qty.` : invId,
      });
      navigate(`/invoices/${invId}`);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales Orders", order.id]}
        eyebrow={`Owned by ${currentStageMeta.role}`}
        title={order.id}
        description={`${customer?.name} · ${order.country} · from ${order.quotationId}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={order.priority} />
            <Badge status={blockedStage ? "blocked" : order.currentStage} label={currentStageMeta.label} />
          </div>
        }
      />

      <Card className="mb-5">
        <LifecycleStepper stages={order.stages} />
      </Card>

      {blockedStage && (
        <div className="mb-5 flex flex-wrap items-start gap-3 rounded-xl border border-alert-200 bg-alert-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-alert-800">Order blocked at {currentStageMeta.label}</p>
            <p className="text-sm text-alert-700">{blockedStage.blocker}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setTab("payments")}>
            Review Payments
          </Button>
        </div>
      )}

      {!blockedStage && currentStageRec?.pendingAction && order.currentStage !== "completed" && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-manifest-200 bg-manifest-50 px-4 py-3">
          <div className="flex gap-3">
            <ArrowRightCircle className="mt-0.5 h-4 w-4 shrink-0 text-manifest-600" />
            <div>
              <p className="text-sm font-semibold text-manifest-800">Next action for {currentStageMeta.role}</p>
              <p className="text-sm text-manifest-700">{currentStageRec.pendingAction}</p>
            </div>
          </div>
          {roleMatchesOwner && (
            <Button variant="primary" size="sm" onClick={handleAdvance}>
              Mark Step Complete
            </Button>
          )}
        </div>
      )}

      {order.currentStage === "documents" && !invoice && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pine-200 bg-pine-50 px-4 py-3">
          <div className="flex items-center gap-2 text-pine-800">
            <ReceiptText className="h-4 w-4" />
            <p className="text-sm font-semibold">Ready to generate the Commercial Invoice</p>
          </div>
          <Button variant="success" size="sm" onClick={openShipModal}>
            Generate Commercial Invoice
          </Button>
        </div>
      )}

      {invoice && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pine-200 bg-pine-50 px-4 py-3">
          <div className="flex items-center gap-2 text-pine-800">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm font-semibold">Commercial Invoice {invoice.id} issued</p>
          </div>
          <Link to={`/invoices/${invoice.id}`}>
            <Button variant="secondary" size="sm">View Invoice</Button>
          </Link>
        </div>
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader title="Process Timeline" eyebrow="Chronological" />
                <div className="space-y-4">
                  {order.stages
                    .filter((s) => s.completedDate || s.status === "in_progress" || s.status === "blocked")
                    .map((s) => {
                      const meta = ORDER_STAGES.find((m) => m.id === s.stage)!;
                      return (
                        <div key={s.stage} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                s.status === "completed"
                                  ? "bg-pine-600"
                                  : s.status === "blocked"
                                  ? "bg-alert-600"
                                  : "bg-manifest-600"
                              }`}
                            />
                            <span className="mt-1 w-px flex-1 bg-paper-200" />
                          </div>
                          <div className="pb-4">
                            <p className="text-sm font-semibold text-paper-800">{meta.label}</p>
                            <p className="text-xs text-paper-400">
                              {s.completedDate ? formatDate(s.completedDate) : s.status === "blocked" ? s.blocker : s.pendingAction}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </Card>

              <Card>
                <CardHeader title="Production Summary" eyebrow="Factory" />
                <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                  <div className="rounded-lg bg-paper-50 py-3">
                    <p className="text-lg font-bold text-paper-900">{order.productionQtyOrdered}</p>
                    <p className="text-[11px] text-paper-400">Ordered</p>
                  </div>
                  <div className="rounded-lg bg-pine-50 py-3">
                    <p className="text-lg font-bold text-pine-700">{order.productionQtyCompleted}</p>
                    <p className="text-[11px] text-paper-400">Completed</p>
                  </div>
                  <div className="rounded-lg bg-alert-50 py-3">
                    <p className="text-lg font-bold text-alert-700">{order.productionQtyRejected}</p>
                    <p className="text-[11px] text-paper-400">Rejected</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-3">
                    <p className="text-lg font-bold text-amber-700">
                      {order.productionQtyOrdered - order.productionQtyCompleted}
                    </p>
                    <p className="text-[11px] text-paper-400">Remaining</p>
                  </div>
                </div>
                {order.delayReason && (
                  <p className="mt-3 rounded-lg bg-alert-50 px-3 py-2 text-xs text-alert-700">
                    Delay noted: {order.delayReason}
                  </p>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Commercial Summary" eyebrow="Order" />
                <KeyValue label="Order value" value={formatMoney(order.orderValue, order.currency)} mono />
                <KeyValue label="Order date" value={formatDate(order.orderDate)} />
                <KeyValue label="Requested delivery" value={formatDate(order.requestedDeliveryDate)} />
                <KeyValue label="Salesperson" value={order.assignedSalesperson} />
                <KeyValue label="Progress" value={`${progressPct}%`} />
              </Card>
              <Card>
                <CardHeader title="Payment Summary" eyebrow="Finance" />
                <KeyValue label="Total expected" value={formatMoney(totalExpected, order.currency)} mono />
                <KeyValue label="Total received" value={formatMoney(totalReceived, order.currency)} mono />
                <KeyValue label="Deposit" value={depositPayment ? <Badge status={depositPayment.status} /> : "—"} />
                <KeyValue label="Balance" value={balancePayment ? <Badge status={balancePayment.status} /> : "—"} />
              </Card>
              <ProcessDiscoveryNote
                items={[
                  "Should Production Planner be notified automatically once deposit clears, or is this still a manual handoff?",
                  "Retention period for superseded PI/PL versions, to confirm with client for audit purposes.",
                ]}
              />
            </div>
          </div>
        )}

        {tab === "items" && quotation && (
          <Table>
            <THead>
              <TH>Item Code</TH>
              <TH>Description</TH>
              <TH>Specification</TH>
              <TH>Qty</TH>
              <TH>Weight</TH>
              <TH>Unit Price</TH>
              <TH>Total</TH>
            </THead>
            <tbody>
              {quotation.items.map((li) => (
                <TR key={li.id}>
                  <TD className="font-mono text-xs">{li.itemCode}</TD>
                  <TD className="font-medium">{li.description}</TD>
                  <TD className="text-xs text-paper-500">{li.specification}</TD>
                  <TD className="font-mono">{li.qtyPcs} {li.unit}</TD>
                  <TD className="font-mono">{li.weightKg.toFixed(1)} kg</TD>
                  <TD className="font-mono">{formatMoney(li.unitPrice, order.currency)}</TD>
                  <TD className="font-mono font-semibold">{formatMoney(li.totalPrice, order.currency)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}

        {tab === "payments" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FinanceControl
                label="Production Release"
                allowed={depositPayment?.status === "verified"}
              />
              <FinanceControl
                label="Container Loading"
                allowed={balancePayment?.status === "verified"}
              />
              <FinanceControl
                label="Final Document Release"
                allowed={order.currentStage === "documents" || order.currentStage === "completed"}
              />
            </div>
            <Table>
              <THead>
                <TH>Reference</TH>
                <TH>Type</TH>
                <TH>Expected</TH>
                <TH>Received</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>Action</TH>
              </THead>
              <tbody>
                {orderPayments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.id}</TD>
                    <TD className="capitalize">{p.type}</TD>
                    <TD className="font-mono">{formatMoney(p.expectedAmount, order.currency)}</TD>
                    <TD className="font-mono">{formatMoney(p.amountReceived, order.currency)}</TD>
                    <TD className="text-xs">{p.method ?? "—"}</TD>
                    <TD>
                      <Badge status={p.status} />
                    </TD>
                    <TD>
                      {p.status === "submitted_for_verification" && (role === "finance" || role === "admin") ? (
                        <Button variant="success" size="sm" onClick={() => verifyPayment(p.id)}>
                          Verify
                        </Button>
                      ) : (
                        <span className="text-xs text-paper-300">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Link to="/payments" className="inline-block text-xs font-medium text-manifest-600 hover:underline">
              View all payments across orders →
            </Link>
          </div>
        )}

        {tab === "documents" && (
          <Table>
            <THead>
              <TH>Document</TH>
              <TH>Type</TH>
              <TH>Version</TH>
              <TH>Uploaded By</TH>
              <TH>Date</TH>
              <TH>Status</TH>
            </THead>
            <tbody>
              {orderDocs.length === 0 ? (
                <TR>
                  <TD className="text-paper-400" colSpan={6}>
                    <span className="flex items-center gap-2 py-2">
                      <FileText className="h-4 w-4" /> No documents recorded yet for this order.
                    </span>
                  </TD>
                </TR>
              ) : (
                orderDocs.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium">{d.name}</TD>
                    <TD className="text-xs">{d.type}</TD>
                    <TD className="font-mono text-xs">v{d.version}{d.isCurrent ? "" : " (superseded)"}</TD>
                    <TD className="text-xs">{d.uploadedBy}</TD>
                    <TD className="font-mono text-xs">{formatDate(d.uploadDate)}</TD>
                    <TD>
                      <Badge status={d.approvalStatus === "approved" ? "approved" : d.approvalStatus === "pending" ? "pending" : "n/a"} />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        )}

        {tab === "activity" && (
          <Card>
            <CardHeader title="Activity History" eyebrow="Audit trail" />
            {orderActivity.length === 0 ? (
              <p className="text-sm text-paper-400">No activity recorded for this order yet.</p>
            ) : (
              <div className="space-y-3">
                {orderActivity.map((a) => (
                  <div key={a.id} className="flex gap-3 border-b border-paper-100 pb-3 text-sm last:border-0">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-paper-300" />
                    <div>
                      <p className="text-paper-800">
                        <span className="font-semibold">{a.user}</span> ({a.department}): {a.action}
                      </p>
                      {a.comment && <p className="mt-0.5 text-xs text-paper-500">{a.comment}</p>}
                      <p className="mt-0.5 font-mono text-[10.5px] text-paper-400">{formatDateTime(a.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal
        open={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        title="Confirm Shipped Quantity"
        subtitle="Defaults to the quoted qty. Adjust any line that shipped partial, and Amount recalculates from the frozen U/P."
        width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShipModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="success" size="sm" onClick={handleGenerateInvoice}>
              Generate Commercial Invoice
            </Button>
          </>
        }
      >
        {quotation && (
          <Table>
            <THead>
              <TH>Item</TH>
              <TH>Quoted Qty</TH>
              <TH>Shipped Qty</TH>
              <TH>Amount</TH>
            </THead>
            <tbody>
              {quotation.items.map((li) => {
                const qty = shippedQty[li.id] ?? li.qtyPcs;
                return (
                  <TR key={li.id}>
                    <TD className="font-mono text-xs">{li.itemCode}</TD>
                    <TD className="font-mono text-xs">{li.qtyPcs}</TD>
                    <TD>
                      <input
                        type="number"
                        value={qty}
                        onChange={(e) => setShippedQty((prev) => ({ ...prev, [li.id]: Number(e.target.value) }))}
                        className="w-20 rounded-md border border-paper-200 px-2 py-1 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                      />
                    </TD>
                    <TD className="font-mono text-xs font-semibold">
                      {formatMoney(li.unitPrice * qty, order.currency)}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Modal>
    </div>
  );
}

function FinanceControl({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        allowed ? "border-pine-200 bg-pine-50" : "border-alert-200 bg-alert-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <Package className={`h-4 w-4 ${allowed ? "text-pine-600" : "text-alert-600"}`} />
        <p className="text-sm font-medium text-paper-800">{label}</p>
      </div>
      <Badge status={allowed ? "allowed" : "blocked"} label={allowed ? "Allowed" : "Blocked"} />
    </div>
  );
}
