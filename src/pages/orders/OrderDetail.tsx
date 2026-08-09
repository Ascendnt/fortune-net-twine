import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ChevronLeft,
  ArrowRightCircle,
  AlertTriangle,
  FileText,
  Wallet,
  Plus,
  Trash2,
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
import { useStore } from "@/lib/store";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { approvalSummary, canApprovePayments, canVerifyPayment } from "@/lib/paymentApproval";
import { selectableUsers } from "@/lib/users";
import { actualAmountFor, settleInspection } from "@/lib/inspectionPricing";
import { DOCUMENT_CATEGORIES, fileKind, formatBytes, validateUpload } from "@/lib/documents";
import { ORDER_STAGES, stageMeta } from "@/lib/types";
import type { OrderDocumentCategory, OrderStage, PaymentRecord, PaymentType } from "@/lib/types";

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
  const {
    salesOrders,
    quotations,
    payments,
    invoices,
    activity,
    advanceStage,
    generateInvoice,
    verifyPayment,
    role,
    pushToast,
    customers,
    packingLists,
    inspections,
    shipments,
    addPayment,
    orderDocuments,
    addOrderDocument,
    removeOrderDocument,
    currentUser,
    users,
  } = useStore();
  const [tab, setTab] = useState("overview");
  /** The Add payment dialog. Null when closed. */
  const [paymentDraft, setPaymentDraft] = useState<{
    type: PaymentType;
    expectedAmount: number;
    dueDate: string;
    method: PaymentRecord["method"];
    intendedApprover: string;
    remarks: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<OrderDocumentCategory>("internal");
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shippedQty, setShippedQty] = useState<Record<string, number>>({});

  const order = salesOrders.find((o) => o.id === id);
  const quotation = order ? quotations.find((q) => q.id === order.quotationId) : undefined;
  const customer = order ? customers.find((c) => c.id === order.customerId) : undefined;
  const orderPayments = payments.filter((p) => p.salesOrderId === id);
  const orderActivity = activity.filter((a) => a.recordId === id);
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

  // Resolved through stageMeta, not a non-null find: an order saved before the lifecycle changed
  // can still name a retired stage, and asserting here would crash the page on open.
  const currentStageMeta = stageMeta(order.currentStage);
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

  const orderPackingList = packingLists.find((p) => p.salesOrderId === order.id);
  const orderInspection = inspections.find((i) => i.salesOrderId === order.id);
  const orderShipment = shipments.find((s) => s.salesOrderId === order.id);

  /**
   * Actual weights are only meaningful once the goods have been packed and are being weighed.
   * Before Inspection there is nothing measured, so the columns stay hidden rather than showing a
   * row of dashes that looks like something is missing.
   */
  /** Only people who hold the approval permission can be routed to. */
  const approvers = selectableUsers(users).filter((u) => canApprovePayments(u.role));

  const myDocuments = orderDocuments.filter((d) => d.salesOrderId === order.id);
  const usedBytes = myDocuments.reduce((s, d) => s + d.sizeBytes, 0);

  /**
   * Reads a chosen file and attaches it.
   *
   * Validated before reading, not after: encoding a file the system is going to refuse anyway
   * wastes the user's time and, on a large scan, freezes the tab while it does.
   */
  function handleUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const problem = validateUpload({ sizeBytes: file.size, name: file.name, existingTotalBytes: usedBytes });
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      addOrderDocument({
        salesOrderId: order!.id,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        category: uploadCategory,
        dataUrl: typeof reader.result === "string" ? reader.result : undefined,
      });
      pushToast({ tone: "success", title: "Document attached", description: file.name });
    };
    reader.onerror = () => setUploadError(`${file.name} could not be read.`);
    reader.readAsDataURL(file);
  }

  const STAGES_WITH_ACTUALS: OrderStage[] = ["inspection", "final_payment", "shipment", "completed"];
  const showActuals = STAGES_WITH_ACTUALS.includes(order.currentStage) && Boolean(orderInspection?.lines?.length);
  const settlement = orderInspection?.lines?.length ? settleInspection(orderInspection.lines) : null;

  /**
   * Everything the order has produced on paper, listed in the order it is normally raised.
   *
   * Distinct from `orderDocuments` on the store, which holds files people have uploaded. This one
   * is derived from the order's own records and is never stored.
   */
  const paperTrail: {
    label: string;
    reference: string;
    date?: string;
    status: string;
    href?: string;
  }[] = [
    {
      label: "Proforma Invoice",
      reference: quotation?.id ?? "",
      date: quotation?.issueDate,
      status: quotation ? "Issued" : "Raised outside the system",
      href: quotation ? `/quotations/${quotation.id}` : undefined,
    },
    {
      label: "Customer Purchase Order",
      reference: order.customerPoNo ?? "",
      date: order.orderDate,
      status: order.customerPoNo ? "On file" : "Awaiting the customer PO",
    },
    {
      label: "Packing List",
      reference: orderPackingList?.id ?? "",
      date: orderPackingList?.finalizedDate ?? orderPackingList?.createdDate,
      status: !orderPackingList ? "Not started" : orderPackingList.finalizedDate ? "Finalised" : "Open",
      href: orderPackingList ? "/packing" : undefined,
    },
    {
      label: "Inspection Report",
      reference: orderInspection?.id ?? "",
      date: orderInspection?.inspectedDate,
      status: !orderInspection
        ? "Not started"
        : orderInspection.result === "pending"
          ? "Awaiting inspection"
          : orderInspection.result === "pass"
            ? "Passed"
            : "Failed",
      href: orderInspection ? "/inspection" : undefined,
    },
    {
      label: "Commercial Invoice",
      reference: invoice?.id ?? "",
      date: invoice?.issueDate,
      status: invoice ? "Issued" : "Raised once the goods ship",
      href: invoice ? `/invoices/${invoice.id}` : undefined,
    },
    {
      label: "Bill of Lading",
      reference: orderShipment?.billOfLadingNo ?? "",
      date: orderShipment?.etd,
      status: orderShipment ? `Shipment ${orderShipment.status}` : "Not booked",
      href: orderShipment ? "/shipments" : undefined,
    },
  ];

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
      return;
    }
    // The only way generateInvoice returns nothing is a missing quotation, which happens on orders
    // raised straight from a customer PO. Say so rather than letting the button do nothing.
    pushToast({
      tone: "warning",
      title: "No line items to invoice",
      description: order!.quotationId
        ? "The linked quotation could not be found."
        : `${order!.id} was raised on customer PO ${order!.customerPoNo ?? "—"} with no quotation behind it, so there are no lines to invoice yet.`,
    });
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales Orders", order.id]}
        eyebrow={`Owned by ${currentStageMeta.role}`}
        title={order.id}
        description={`${customer?.name} · ${order.country} · ${
          order.quotationId
            ? `from ${order.quotationId}`
            : order.customerPoNo
              ? `on customer PO ${order.customerPoNo}`
              : "direct order"
        }`}
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
            {/* A block that does not say who can clear it is a dead end. Verification is a Finance
                authority and stays that way, so the banner names the role rather than handing the
                power to whoever happens to be looking. */}
            <p className="mt-1 text-xs text-alert-700/80">
              {role === "finance" || role === "admin"
                ? "You can clear this: open Payments below and verify the remittance."
                : "Finance clears this. Switch to the Finance role from the account menu, or ask them to verify the remittance."}
            </p>
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
                      const meta = stageMeta(s.stage);
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

              {order.delayReason && (
                <Card>
                  <CardHeader title="Delay Noted" eyebrow="Attention" />
                  <p className="rounded-lg bg-alert-50 px-3 py-2 text-xs text-alert-700">{order.delayReason}</p>
                </Card>
              )}
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
            </div>
          </div>
        )}

        {tab === "items" && quotation && (
          <div className="space-y-3">
            {/* Actual weight and the settled amount appear from Inspection onward. Before then
                there is nothing to show but the quoted figures, and empty columns invite people to
                type into something that is not ready. */}
            {showActuals && (
              <p className="text-xs text-paper-500">
                {orderInspection?.result === "pass"
                  ? "Weights below were measured at inspection and the order value has been settled against them."
                  : "Actual weights are entered on the Inspection screen. Until it passes, these are the quoted figures."}
              </p>
            )}
            <Table>
              <THead>
                <TH>Item Code</TH>
                <TH>Description</TH>
                <TH>Specification</TH>
                <TH>Qty</TH>
                <TH>{showActuals ? "Quoted Weight" : "Weight"}</TH>
                {showActuals && <TH>Actual Weight</TH>}
                <TH>Unit Price</TH>
                <TH>Total</TH>
                {showActuals && <TH>Final Amount</TH>}
              </THead>
              <tbody>
                {quotation.items.map((li) => {
                  const measured = orderInspection?.lines?.find((l) => l.itemId === li.id);
                  const finalAmount = measured ? actualAmountFor(measured) : li.totalPrice;
                  const moved = Math.abs(finalAmount - li.totalPrice) >= 0.005;
                  return (
                    <TR key={li.id}>
                      <TD className="font-mono text-xs">{li.itemCode}</TD>
                      <TD className="font-medium">{li.description}</TD>
                      <TD className="text-xs text-paper-500">{li.specification}</TD>
                      <TD className="font-mono">{li.qtyPcs} {li.unit}</TD>
                      <TD className="font-mono">{li.weightKg.toFixed(1)} kg</TD>
                      {showActuals && (
                        <TD className="font-mono">
                          {measured ? (
                            <span className={moved ? "font-semibold text-manifest-700" : undefined}>
                              {measured.actualWeightKg.toFixed(1)} kg
                            </span>
                          ) : (
                            <span className="text-paper-300">—</span>
                          )}
                        </TD>
                      )}
                      <TD className="font-mono">{formatMoney(li.unitPrice, order.currency)}</TD>
                      <TD className="font-mono">{formatMoney(li.totalPrice, order.currency)}</TD>
                      {showActuals && (
                        <TD
                          className={`font-mono font-semibold ${
                            !moved ? "" : finalAmount > li.totalPrice ? "text-pine-700" : "text-alert-600"
                          }`}
                        >
                          {formatMoney(finalAmount, order.currency)}
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            {showActuals && settlement && (
              <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-lg bg-paper-50 px-3 py-2 text-xs">
                <span className="text-paper-500">
                  Quoted: <span className="font-mono">{formatMoney(settlement.quotedValue, order.currency)}</span>
                </span>
                <span className="text-paper-500">
                  Weight: <span className="font-mono">{settlement.actualWeightKg.toFixed(2)} KG</span>
                </span>
                <span>
                  <span className="text-paper-500">Final order value: </span>
                  <span className="font-mono font-bold text-pine-800">
                    {formatMoney(settlement.actualValue, order.currency)}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {tab === "payments" && (
          <div className="space-y-4">
            {/* The three release indicators that used to sit here are gone. They restated what the
                payment rows below already say, and nothing in the system acted on them, so they
                were three red "Blocked" badges that could not be cleared by doing anything. */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-paper-500">
                Deposit and balance are raised automatically from the quotation. Add a line here for an adjustment or a
                correction.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => {
                  // Opens here rather than sending the user to Payments. Recording an adjustment is
                  // a two-field job; losing the order you were looking at to do it is not worth it.
                  setPaymentDraft({
                    type: "adjustment",
                    expectedAmount: 0,
                    dueDate: new Date().toISOString().slice(0, 10),
                    method: "Telegraphic Transfer",
                    intendedApprover: "",
                    remarks: "",
                  });
                }}
              >
                Add payment
              </Button>
            </div>
            <Table>
              <THead>
                <TH>Reference</TH>
                <TH>Type</TH>
                <TH>Expected</TH>
                <TH>Received</TH>
                <TH>Method</TH>
                <TH>Approval</TH>
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
                    <TD className="text-xs text-paper-500">{approvalSummary(p)}</TD>
                    <TD>
                      <Badge status={p.status} />
                    </TD>
                    <TD>
                      {/* Approval happens on the Payments screen, which is where the override and
                          its reason live. This tab shows where a line stands and points there. */}
                      {!canVerifyPayment(p) ? (
                        <Link to="/payments" className="text-xs font-medium text-amber-700 hover:underline">
                          Needs approval
                        </Link>
                      ) : p.status === "submitted_for_verification" && (role === "finance" || role === "admin") ? (
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
          <Card>
            <CardHeader
              title="Order Documents"
              eyebrow="Paper trail"
              subtitle="Every document raised against this order, in the order it is produced."
            />
            <Table>
              <THead>
                <TH>Document</TH>
                <TH>Reference</TH>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Open</TH>
              </THead>
              <tbody>
                {paperTrail.map((d) => (
                  <TR key={d.label + d.reference}>
                    <TD className="font-medium">{d.label}</TD>
                    <TD className="font-mono text-xs">{d.reference || "—"}</TD>
                    <TD className="text-xs text-paper-500">{d.date ? formatDate(d.date) : "—"}</TD>
                    <TD className="text-xs text-paper-600">{d.status}</TD>
                    <TD>
                      {d.href ? (
                        <Link
                          to={d.href}
                          className="text-xs font-medium text-manifest-600 hover:underline"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-xs text-paper-300">Not yet raised</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            <div className="mt-5 border-t border-paper-100 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-paper-800">Attached files</p>
                  <p className="text-[11px] text-paper-400">
                    Factory reports, signed POs, bank advices — anything that belongs with this order but is not
                    generated by the system.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as OrderDocumentCategory)}
                    className="rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-xs"
                    title="Where this file belongs"
                  >
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <label className="cursor-pointer rounded-lg bg-pine-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pine-600">
                    Upload file
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        handleUpload(e.target.files);
                        // Cleared so choosing the same file twice still fires a change event.
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              {uploadError && (
                <p className="mb-2 rounded-lg bg-alert-50 px-3 py-2 text-[11.5px] text-alert-700">{uploadError}</p>
              )}

              {myDocuments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-paper-300 py-6 text-center text-xs text-paper-400">
                  No files attached to this order yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {myDocuments.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-paper-200 px-3 py-2"
                    >
                      <span className="rounded bg-paper-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-paper-600">
                        {fileKind(d.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-paper-800">{d.name}</span>
                      <span className="rounded-full bg-manifest-50 px-2 py-0.5 text-[10px] capitalize text-manifest-800">
                        {d.category}
                      </span>
                      <span className="text-[11px] text-paper-400">
                        {formatBytes(d.sizeBytes)} · {d.uploadedBy} · {formatDate(d.uploadedDate)}
                      </span>
                      {d.dataUrl && (
                        <a
                          href={d.dataUrl}
                          download={d.name}
                          className="text-[11px] font-medium text-manifest-600 hover:underline"
                        >
                          Download
                        </a>
                      )}
                      <button
                        onClick={() => {
                          removeOrderDocument(d.id);
                          pushToast({ tone: "info", title: "Document removed", description: d.name });
                        }}
                        className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                        aria-label={`Remove ${d.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="pt-1 text-[11px] text-paper-400">
                    {formatBytes(usedBytes)} attached to this order.
                  </p>
                </div>
              )}
            </div>
          </Card>
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
        open={paymentDraft !== null}
        onClose={() => setPaymentDraft(null)}
        title="Add payment"
        subtitle={`Against ${order.id}. It waits for approval before it can be verified.`}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPaymentDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!paymentDraft) return;
                if (paymentDraft.expectedAmount <= 0) {
                  pushToast({ tone: "warning", title: "Enter an amount above zero." });
                  return;
                }
                const id = addPayment({
                  salesOrderId: order.id,
                  type: paymentDraft.type,
                  expectedAmount: paymentDraft.expectedAmount,
                  amountReceived: 0,
                  status: "expected",
                  dueDate: paymentDraft.dueDate,
                  method: paymentDraft.method,
                  remarks: paymentDraft.remarks,
                  approval: {
                    state: "pending_approval",
                    author: currentUser,
                    authoredDate: new Date().toISOString().slice(0, 10),
                    intendedApprover: paymentDraft.intendedApprover || undefined,
                  },
                });
                pushToast({
                  tone: "success",
                  title: "Payment raised",
                  description: `${id} is waiting for approval.`,
                });
                setPaymentDraft(null);
              }}
            >
              Raise payment
            </Button>
          </>
        }
      >
        {paymentDraft && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium text-paper-600">Type</span>
              <select
                value={paymentDraft.type}
                onChange={(e) => setPaymentDraft({ ...paymentDraft, type: e.target.value as PaymentType })}
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm"
              >
                <option value="adjustment">Adjustment</option>
                <option value="deposit">Deposit</option>
                <option value="balance">Balance</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-paper-600">Expected amount</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={paymentDraft.expectedAmount}
                onChange={(e) =>
                  setPaymentDraft({ ...paymentDraft, expectedAmount: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-right font-mono text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-paper-600">Due date</span>
              <input
                type="date"
                value={paymentDraft.dueDate}
                onChange={(e) => setPaymentDraft({ ...paymentDraft, dueDate: e.target.value })}
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-paper-600">Method</span>
              <select
                value={paymentDraft.method}
                onChange={(e) =>
                  setPaymentDraft({ ...paymentDraft, method: e.target.value as PaymentRecord["method"] })
                }
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm"
              >
                <option value="Telegraphic Transfer">Telegraphic Transfer</option>
                <option value="Wire Transfer">Wire Transfer</option>
                <option value="LC">LC</option>
                <option value="Check">Check</option>
                <option value="Cash">Cash</option>
              </select>
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="mb-1 block font-medium text-paper-600">Route approval to</span>
              <select
                value={paymentDraft.intendedApprover}
                onChange={(e) => setPaymentDraft({ ...paymentDraft, intendedApprover: e.target.value })}
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Anyone in Management or Finance</option>
                {approvers.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="mb-1 block font-medium text-paper-600">Remarks</span>
              <input
                value={paymentDraft.remarks}
                onChange={(e) => setPaymentDraft({ ...paymentDraft, remarks: e.target.value })}
                placeholder="Why this line exists"
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
      </Modal>

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

