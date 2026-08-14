import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Search, Plus, Pencil, Trash2, Download } from "lucide-react";
import { exportCsv } from "@/lib/csv";
import { Modal } from "@/components/ui/Modal";
import { NON_NEGATIVE, toNonNegative } from "@/lib/num";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate } from "@/lib/format";
import {
  approvalStateOf,
  approvalSummary,
  canApprovePayments,
  canOverrideApproval,
  canVerifyPayment,
  isOverride,
  isPendingApproval,
  validateApproval,
} from "@/lib/paymentApproval";
import { selectableUsers } from "@/lib/users";
import { ROLES } from "@/lib/mockData";
import type { PaymentRecord, PaymentStatus, PaymentType } from "@/lib/types";

const formClass =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const formLabel = "mb-1 block text-xs font-medium text-paper-600";

type PaymentDraft = Omit<PaymentRecord, "id">;

const PAYMENT_STATUSES: PaymentStatus[] = [
  "expected",
  "submitted_for_verification",
  "partially_paid",
  "verified",
  "rejected",
  "overdue",
];

const FILTERS: { id: PaymentStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expected", label: "Expected" },
  { id: "submitted_for_verification", label: "Submitted" },
  { id: "partially_paid", label: "Partial" },
  { id: "verified", label: "Verified" },
  { id: "overdue", label: "Overdue" },
];

export function PaymentsPage() {
  const {
    payments,
    salesOrders,
    verifyPayment,
    rejectPayment,
    addPayment,
    updatePayment,
    removePayment,
    approvePayment,
    declinePayment,
    reopenPaymentApproval,
    role,
    users,
    currentUser,
    pushToast,
    customers: CUSTOMERS,
  } = useStore();
  const [filter, setFilter] = useState<PaymentStatus | "all">("all");
  const [query, setQuery] = useState("");
  /** `originalStatus` is kept so the dialog can say what a status change will actually do. */
  const [form, setForm] = useState<{ draft: PaymentDraft; id: string | null; originalStatus: PaymentStatus } | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState<PaymentRecord | null>(null);
  /** The line being verified. Verification confirms an amount, so it asks before it acts. */
  const [verifying, setVerifying] = useState<PaymentRecord | null>(null);
  /** Only pending lines, when switched on. Sits beside the status filters, not inside them. */
  const [pendingOnly, setPendingOnly] = useState(false);
  /** The approval dialog: which payment, and whether it is being approved or declined. */
  const [approving, setApproving] = useState<{ payment: PaymentRecord; mode: "approve" | "decline" } | null>(null);
  const [approverName, setApproverName] = useState("");
  const [approvalReason, setApprovalReason] = useState("");

  const canApprove = canApprovePayments(role);
  const canOverride = canOverrideApproval(role);
  /** Only people who actually hold the approval permission can be routed to. */
  const approvers = selectableUsers(users).filter((u) => canApprovePayments(u.role));

  function openApproval(payment: PaymentRecord, mode: "approve" | "decline") {
    setApproving({ payment, mode });
    // Defaults to whoever is signed in, but stays editable: someone approving on a colleague's
    // behalf needs their own name on the record, not the account the browser happens to hold.
    setApproverName(currentUser);
    setApprovalReason("");
  }

  function submitApproval() {
    if (!approving) return;
    const { payment, mode } = approving;
    if (mode === "decline") {
      if (!approverName.trim()) {
        pushToast({ tone: "warning", title: "Enter who is declining this payment." });
        return;
      }
      declinePayment(payment.id, { actualApprover: approverName, reason: approvalReason });
      pushToast({ tone: "info", title: "Payment declined", description: payment.id });
      setApproving(null);
      return;
    }
    const problem = validateApproval({
      approval: payment.approval,
      actualApprover: approverName,
      overrideReason: approvalReason,
      role,
    });
    if (problem) {
      pushToast({ tone: "warning", title: "Approval not recorded", description: problem });
      return;
    }
    approvePayment(payment.id, { actualApprover: approverName, overrideReason: approvalReason });
    pushToast({ tone: "success", title: "Payment approved", description: payment.id });
    setApproving(null);
  }

  function emptyDraft(): PaymentDraft {
    return {
      salesOrderId: salesOrders[0]?.id ?? "",
      type: "deposit",
      expectedAmount: 0,
      amountReceived: 0,
      status: "expected",
      dueDate: new Date().toISOString().slice(0, 10),
      method: "Telegraphic Transfer",
      remarks: "",
    };
  }

  function saveForm() {
    if (!form) return;
    if (!form.draft.salesOrderId) {
      pushToast({ tone: "warning", title: "Pick a sales order" });
      return;
    }
    if (form.id) {
      updatePayment(form.id, form.draft);
      pushToast({ tone: "success", title: "Payment updated", description: form.id });
    } else {
      const id = addPayment(form.draft);
      pushToast({ tone: "success", title: "Payment added", description: id });
    }
    setForm(null);
  }

  const rows = useMemo(() => {
    return payments
      .map((p) => {
        const order = salesOrders.find((o) => o.id === p.salesOrderId);
        const customer = order ? CUSTOMERS.find((c) => c.id === order.customerId) : undefined;
        return { p, order, customer };
      })
      .filter(({ p, order, customer }) => {
        void order;
        if (filter !== "all" && p.status !== filter) return false;
        if (pendingOnly && !isPendingApproval(p)) return false;
        if (query) {
          const haystack = `${p.salesOrderId} ${customer?.name ?? ""} ${p.approval?.author ?? ""}`.toLowerCase();
          if (!haystack.includes(query.toLowerCase())) return false;
        }
        return true;
      });
  }, [payments, salesOrders, filter, pendingOnly, query, CUSTOMERS]);

  const totals = useMemo(() => {
    const expected = payments.reduce((s, p) => s + p.expectedAmount, 0);
    const received = payments.reduce((s, p) => s + p.amountReceived, 0);
    const overdue = payments.filter((p) => p.status === "overdue").reduce((s, p) => s + p.expectedAmount, 0);
    const pendingApproval = payments.filter(isPendingApproval).length;
    return { expected, received, overdue, pendingApproval };
  }, [payments]);

  const canVerify = role === "finance" || role === "admin";

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Finance"]}
        eyebrow="Remittance & Payment Entry"
        title="Payments"
        description="Deposit and balance milestones across every sales order, with finance verification."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => {
                exportCsv(
                  `payments-${new Date().toISOString().slice(0, 10)}`,
                  rows,
                  [
                    { header: "Reference", value: ({ p }) => p.id },
                    { header: "Sales Order", value: ({ p }) => p.salesOrderId },
                    { header: "Customer", value: ({ customer }) => customer?.name },
                    { header: "Type", value: ({ p }) => p.type },
                    { header: "Expected", value: ({ p }) => p.expectedAmount.toFixed(2) },
                    { header: "Received", value: ({ p }) => p.amountReceived.toFixed(2) },
                    { header: "Currency", value: ({ order }) => order?.currency },
                    { header: "Method", value: ({ p }) => p.method },
                    { header: "Bank Ref", value: ({ p }) => p.bankRef },
                    { header: "Status", value: ({ p }) => p.status.replace(/_/g, " ") },
                    { header: "Due Date", value: ({ p }) => p.dueDate },
                    { header: "Date Received", value: ({ p }) => p.dateReceived },
                    { header: "Verified By", value: ({ p }) => p.verifiedBy },
                    { header: "Approval", value: ({ p }) => approvalStateOf(p).replace(/_/g, " ") },
                    { header: "Raised By", value: ({ p }) => p.approval?.author },
                    { header: "Routed To", value: ({ p }) => p.approval?.intendedApprover },
                    { header: "Approved By", value: ({ p }) => p.approval?.actualApprover },
                    { header: "Override Reason", value: ({ p }) => p.approval?.overrideReason },
                    { header: "Remarks", value: ({ p }) => p.remarks },
                  ]
                );
                pushToast({
                  tone: "success",
                  title: "Export downloaded",
                  description: `${rows.length} payments saved to your downloads.`,
                });
              }}
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setForm({ draft: emptyDraft(), id: null, originalStatus: "expected" })}
            >
              Record Payment
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total expected" value={formatMoney(totals.expected)} />
        <StatCard label="Total received" value={formatMoney(totals.received)} tone="pine" />
        <StatCard label="Overdue balance" value={formatMoney(totals.overdue)} tone="alert" />
        <StatCard label="Awaiting approval" value={String(totals.pendingApproval)} tone="amber" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id ? "border-pine-700 bg-pine-700 text-white" : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPendingOnly((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            pendingOnly
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
          }`}
          title="Show only payments still waiting for an approver"
        >
          Awaiting approval ({totals.pendingApproval})
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Wallet className="h-5 w-5" />} title="No payments match your filters" />
      ) : (
        <Table>
          <THead>
            <TH>Reference</TH>
            <TH>Sales Order</TH>
            <TH>Customer</TH>
            <TH>Type</TH>
            <TH>Expected</TH>
            <TH>Received</TH>
            <TH>Bank Ref.</TH>
            <TH>Approval</TH>
            <TH>Status</TH>
            <TH>Action</TH>
            <TH> </TH>
          </THead>
          <tbody>
            {rows.map(({ p, order, customer }) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">{p.id}</TD>
                <TD>
                  <Link to={`/orders/${p.salesOrderId}`} className="font-mono text-xs font-semibold text-manifest-600 hover:underline">
                    {p.salesOrderId}
                  </Link>
                </TD>
                <TD className="text-xs">{customer?.name ?? "-"}</TD>
                <TD className="text-xs capitalize">{p.type}</TD>
                <TD className="font-mono">{formatMoney(p.expectedAmount, order?.currency)}</TD>
                <TD className="font-mono">{formatMoney(p.amountReceived, order?.currency)}</TD>
                <TD>
                  <ApprovalCell
                    payment={p}
                    canApprove={canApprove}
                    onApprove={() => openApproval(p, "approve")}
                    onDecline={() => openApproval(p, "decline")}
                    onReopen={() => {
                      reopenPaymentApproval(p.id);
                      pushToast({ tone: "info", title: "Sent back for approval", description: p.id });
                    }}
                  />
                </TD>
                <TD className="font-mono text-xs">{p.bankRef ?? "-"}</TD>
                <TD>
                  <Badge status={p.status} />
                </TD>
                <TD>
                  {/* Every status is changeable, not just the one waiting to be verified. A payment
                      recorded against the wrong order, marked overdue in error, or verified by
                      mistake all have to be correctable by Finance without a developer. The change
                      is restricted by role, not by which state the row happens to be in. */}
                  {canVerify ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.status !== "verified" &&
                        (canVerifyPayment(p) ? (
                          // Verify confirms an amount before it acts, and the status dropdown that
                          // used to sit beside it has moved into the edit dialog. Two controls a
                          // few pixels apart, one of which quietly rewrites a verification, is a
                          // misclick waiting to happen, and the one that fires by accident was
                          // the one with no confirmation.
                          <Button variant="success" size="sm" onClick={() => setVerifying(p)}>
                            Verify
                          </Button>
                        ) : (
                          // Not a dead end: the Approval column beside this one is where the line
                          // gets unblocked, and this says so rather than showing a disabled button
                          // with no explanation.
                          <span
                            className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700"
                            title="A payment has to be approved before the money against it can be verified."
                          >
                            Approve first
                          </span>
                        ))}
                    </div>
                  ) : (
                    <span className="text-xs text-paper-400">
                      {p.verifiedBy ? `Verified by ${p.verifiedBy}` : "Finance only"}
                    </span>
                  )}
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        const { id, ...draft } = p;
                        void id;
                        setForm({ draft, id: p.id, originalStatus: p.status });
                      }}
                      className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-manifest-700"
                      title="Edit every field on this payment"
                      aria-label={`Edit ${p.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(p)}
                      className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                      aria-label={`Delete ${p.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? `Edit ${form.id}` : "Record payment"}
        subtitle="Deposit and balance milestones are normally generated on conversion. Add one here for adjustments or corrections."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveForm}>
              {form?.id ? "Save changes" : "Add payment"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={formLabel}>Sales order</label>
              <select
                value={form.draft.salesOrderId}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, salesOrderId: e.target.value } })}
                className={formClass}
              >
                {salesOrders.map((so) => (
                  <option key={so.id} value={so.id}>
                    {so.id}: {so.consignee}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={formLabel}>Type</label>
              <select
                value={form.draft.type}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, type: e.target.value as PaymentType } })}
                className={formClass}
              >
                <option value="deposit">Deposit</option>
                <option value="balance">Balance</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={formLabel}>Route approval to</label>
              {/* Chosen from the people who actually hold the permission, so a payment cannot be
                  routed to somebody who could never sign it. Leaving it unrouted is the normal
                  case: anyone in Management or Finance can then pick it up. */}
              <select
                value={form.draft.approval?.intendedApprover ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    draft: {
                      ...form.draft,
                      approval: {
                        state: form.draft.approval?.state ?? "pending_approval",
                        author: form.draft.approval?.author ?? currentUser,
                        authoredDate: form.draft.approval?.authoredDate ?? new Date().toISOString().slice(0, 10),
                        ...form.draft.approval,
                        intendedApprover: e.target.value || undefined,
                      },
                    },
                  })
                }
                className={formClass}
              >
                <option value="">Anyone in Management or Finance</option>
                {approvers.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name} · {ROLES.find((r) => r.id === u.role)?.label ?? u.role}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-snug text-paper-400">
                Naming someone makes the payment theirs to sign. If they are away, only Management can approve in their
                place, and the reason goes on the record.
              </p>
            </div>
            <div>
              <label className={formLabel}>Expected amount</label>
              <input
                {...NON_NEGATIVE}
                value={form.draft.expectedAmount}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, expectedAmount: toNonNegative(e.target.value) } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Amount received</label>
              <input
                {...NON_NEGATIVE}
                value={form.draft.amountReceived}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, amountReceived: toNonNegative(e.target.value) } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Status</label>
              <select
                value={form.draft.status}
                onChange={(e) => {
                  const status = e.target.value as PaymentStatus;
                  setForm({
                    ...form,
                    draft: {
                      ...form.draft,
                      status,
                      // Undoing a verification clears who verified it. Leaving the signature on a
                      // decision that no longer stands is worse than having no signature at all.
                      ...(status !== "verified" ? { verifiedBy: undefined, verificationDate: undefined } : {}),
                    },
                  });
                }}
                className={formClass}
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              {form.id && form.draft.status !== form.originalStatus && (
                <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
                  Saving will move this payment from{" "}
                  <span className="font-medium">{form.originalStatus.replace(/_/g, " ")}</span> to{" "}
                  <span className="font-medium">{form.draft.status.replace(/_/g, " ")}</span>.
                  {form.originalStatus === "verified" &&
                    " Undoing a verification also removes who verified it, and may hold the order it released."}
                </p>
              )}
            </div>
            <div>
              <label className={formLabel}>Method</label>
              <select
                value={form.draft.method ?? "Telegraphic Transfer"}
                onChange={(e) =>
                  setForm({ ...form, draft: { ...form.draft, method: e.target.value as PaymentRecord["method"] } })
                }
                className={formClass}
              >
                {["Wire Transfer", "Telegraphic Transfer", "LC", "Check", "Cash"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={formLabel}>Due date</label>
              <input
                type="date"
                value={form.draft.dueDate ?? ""}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, dueDate: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Date received</label>
              <input
                type="date"
                value={form.draft.dateReceived ?? ""}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, dateReceived: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Bank reference</label>
              <input
                value={form.draft.bankRef ?? ""}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, bankRef: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Verified by</label>
              <input
                value={form.draft.verifiedBy ?? ""}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, verifiedBy: e.target.value } })}
                className={formClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={formLabel}>Remarks</label>
              <input
                value={form.draft.remarks ?? ""}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, remarks: e.target.value } })}
                className={formClass}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={verifying !== null}
        onClose={() => setVerifying(null)}
        title="Verify this payment"
        subtitle={verifying ? `${verifying.id} · ${verifying.type} · ${verifying.salesOrderId}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setVerifying(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={() => {
                if (!verifying) return;
                verifyPayment(verifying.id);
                pushToast({
                  tone: "success",
                  title: "Payment verified",
                  description: `${formatMoney(verifying.amountReceived || verifying.expectedAmount)} confirmed on ${verifying.id}.`,
                });
                setVerifying(null);
              }}
            >
              Verify {formatMoney(verifying?.amountReceived || verifying?.expectedAmount || 0)}
            </Button>
          </>
        }
      >
        {verifying && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-paper-50 p-3 text-xs">
              <div>
                <p className="text-paper-400">Expected</p>
                <p className="font-mono text-paper-800">{formatMoney(verifying.expectedAmount)}</p>
              </div>
              <div>
                <p className="text-paper-400">Recorded as received</p>
                <p className="font-mono text-sm font-bold text-pine-800">
                  {formatMoney(verifying.amountReceived || verifying.expectedAmount)}
                </p>
              </div>
              <div>
                <p className="text-paper-400">Method</p>
                <p className="text-paper-700">{verifying.method ?? "-"}</p>
              </div>
              <div>
                <p className="text-paper-400">Bank reference</p>
                <p className="font-mono text-paper-700">{verifying.bankRef || "-"}</p>
              </div>
            </div>
            {verifying.amountReceived === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                Nothing has been recorded as received on this line. Verifying now will record the full expected amount
                as having arrived.
              </p>
            )}
            <p className="text-xs text-paper-500">
              Verifying confirms the money arrived and releases the next stage of the order it belongs to.
            </p>
          </div>
        )}
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
                  removePayment(confirmDelete.id);
                  pushToast({ tone: "info", title: "Payment deleted", description: confirmDelete.id });
                }
                setConfirmDelete(null);
              }}
            >
              Delete payment
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Removing a payment milestone affects the deposit gate on its sales order, because the loading authorization
          checks verified payments.
        </p>
      </Modal>

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={approving?.mode === "decline" ? `Decline ${approving.payment.id}` : `Approve ${approving?.payment.id}`}
        subtitle={
          approving
            ? `${approving.payment.type} of ${formatMoney(approving.payment.expectedAmount)} on ${approving.payment.salesOrderId}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button
              variant={approving?.mode === "decline" ? "danger" : "success"}
              size="sm"
              onClick={submitApproval}
            >
              {approving?.mode === "decline" ? "Decline payment" : "Approve payment"}
            </Button>
          </>
        }
      >
        {approving && (
          <div className="space-y-3">
            <div className="rounded-lg bg-paper-50 px-3 py-2 text-xs text-paper-600">
              Raised by <span className="font-medium text-paper-800">{approving.payment.approval?.author ?? "-"}</span>
              {approving.payment.approval?.authoredDate
                ? ` on ${formatDate(approving.payment.approval.authoredDate)}`
                : ""}
              {approving.payment.approval?.intendedApprover
                ? `, routed to ${approving.payment.approval.intendedApprover}`
                : ", not routed to anyone in particular"}
              .
            </div>

            <div>
              <label className={formLabel}>
                {approving.mode === "decline" ? "Declined by" : "Approved by"}
              </label>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className={formClass}
                placeholder="Your name"
              />
            </div>

            {/* The override. It appears only when the person signing is not the one the line was
                routed to, so the normal case stays a two-click job and the exception is the thing
                that asks a question. */}
            {approving.mode === "approve" &&
              isOverride(approving.payment.approval, approverName) &&
              (canOverride ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-medium text-amber-800">
                    This payment was routed to {approving.payment.approval?.intendedApprover}. You are approving in
                    their place, so the reason goes on the record.
                  </p>
                  <input
                    value={approvalReason}
                    onChange={(e) => setApprovalReason(e.target.value)}
                    className={formClass}
                    placeholder="e.g. On leave until 14 Aug, shipment cannot wait"
                  />
                </div>
              ) : (
                // Said plainly rather than shown as a disabled box. Being asked to justify
                // something you were never allowed to do is worse than being told it is not yours.
                <div className="rounded-lg border border-alert-200 bg-alert-50 p-3 text-xs text-alert-700">
                  This payment is routed to {approving.payment.approval?.intendedApprover}. Only Management can approve
                  in someone else's place. Ask them to sign it, or have it re-routed to you.
                </div>
              ))}

            {approving.mode === "decline" && (
              <div>
                <label className={formLabel}>Reason for declining</label>
                <input
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  className={formClass}
                  placeholder="e.g. Amount does not match the PI"
                />
                <p className="mt-1 text-[11px] leading-snug text-paper-400">
                  The payment stays on the order so the decline is visible. It can be sent back for approval once the
                  problem is fixed.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * The approval state of one payment, with whatever action is available on it.
 *
 * Kept as its own component because the cell has four distinct states and inlining them made the
 * table row impossible to read.
 */
function ApprovalCell({
  payment,
  canApprove,
  onApprove,
  onDecline,
  onReopen,
}: {
  payment: PaymentRecord;
  canApprove: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onReopen: () => void;
}) {
  const state = approvalStateOf(payment);
  const summary = approvalSummary(payment);

  if (state === "pending_approval") {
    return (
      <div className="min-w-[180px]">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800">
          Pending
        </span>
        <p className="mt-1 text-[11px] leading-snug text-paper-500">{summary}</p>
        {canApprove ? (
          <div className="mt-1.5 flex gap-1.5">
            <Button variant="success" size="sm" onClick={onApprove}>
              Approve
            </Button>
            <Button variant="ghost" size="sm" onClick={onDecline}>
              Decline
            </Button>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-paper-400">Management or Finance signs this off.</p>
        )}
      </div>
    );
  }

  if (state === "declined") {
    return (
      <div className="min-w-[180px]">
        <span className="rounded-full bg-alert-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-alert-700">
          Declined
        </span>
        <p className="mt-1 text-[11px] leading-snug text-paper-500">{summary}</p>
        {canApprove && (
          <Button variant="ghost" size="sm" onClick={onReopen} className="mt-1.5">
            Send back for approval
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-[150px]">
      <span className="rounded-full bg-pine-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-pine-800">
        Approved
      </span>
      <p className="mt-1 text-[11px] leading-snug text-paper-500">{summary}</p>
    </div>
  );
}
