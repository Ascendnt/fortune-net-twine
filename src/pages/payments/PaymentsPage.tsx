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
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate } from "@/lib/format";
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
    role,
    pushToast,
    customers: CUSTOMERS,
  } = useStore();
  const [filter, setFilter] = useState<PaymentStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<{ draft: PaymentDraft; id: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentRecord | null>(null);

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
        if (filter !== "all" && p.status !== filter) return false;
        if (query) {
          const haystack = `${p.salesOrderId} ${customer?.name ?? ""}`.toLowerCase();
          if (!haystack.includes(query.toLowerCase())) return false;
        }
        return true;
      });
  }, [payments, salesOrders, filter, query]);

  const totals = useMemo(() => {
    const expected = payments.reduce((s, p) => s + p.expectedAmount, 0);
    const received = payments.reduce((s, p) => s + p.amountReceived, 0);
    const overdue = payments.filter((p) => p.status === "overdue").reduce((s, p) => s + p.expectedAmount, 0);
    const pendingVerification = payments.filter((p) => p.status === "submitted_for_verification").length;
    return { expected, received, overdue, pendingVerification };
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
              onClick={() => setForm({ draft: emptyDraft(), id: null })}
            >
              Record Payment
            </Button>
          </div>
        }
      />

      <HowToUse
        id="payments"
        steps={[
          "Find the payment using the search box or the status buttons.",
          "When money arrives, press Verify. The order it belongs to is then allowed to move forward.",
          "Wrong status? Use the dropdown beside Verify to set the correct one. Anything can be corrected, including undoing a verification.",
          "Use the pencil to change amounts, dates, bank reference or remarks. Use the bin to remove a payment recorded in error.",
          "Export CSV downloads whatever is currently on screen, including your filters, for Excel.",
        ]}
        note="Only Finance and the System Administrator can verify or change a status. Everyone else can see payments but not alter them."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total expected" value={formatMoney(totals.expected)} />
        <StatCard label="Total received" value={formatMoney(totals.received)} tone="pine" />
        <StatCard label="Overdue balance" value={formatMoney(totals.overdue)} tone="alert" />
        <StatCard label="Awaiting verification" value={String(totals.pendingVerification)} tone="amber" />
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
                <TD className="text-xs">{customer?.name ?? "—"}</TD>
                <TD className="text-xs capitalize">{p.type}</TD>
                <TD className="font-mono">{formatMoney(p.expectedAmount, order?.currency)}</TD>
                <TD className="font-mono">{formatMoney(p.amountReceived, order?.currency)}</TD>
                <TD className="font-mono text-xs">{p.bankRef ?? "—"}</TD>
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
                      {p.status !== "verified" && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => {
                            verifyPayment(p.id);
                            pushToast({ tone: "success", title: "Payment verified", description: p.id });
                          }}
                        >
                          Verify
                        </Button>
                      )}
                      <select
                        value={p.status}
                        onChange={(e) => {
                          const status = e.target.value as PaymentStatus;
                          updatePayment(p.id, {
                            status,
                            // Undoing a verification must also clear who verified it, otherwise the
                            // row keeps a signature for a decision that no longer stands.
                            ...(status !== "verified" ? { verifiedBy: undefined, verificationDate: undefined } : {}),
                          });
                          pushToast({
                            tone: "info",
                            title: "Status changed",
                            description: `${p.id} is now ${status.replace(/_/g, " ")}.`,
                          });
                        }}
                        className="rounded-md border border-paper-200 bg-white px-2 py-1 text-[11px] text-paper-700"
                        title="Change this payment's status"
                      >
                        {PAYMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
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
                        setForm({ draft, id: p.id });
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
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, status: e.target.value as PaymentStatus } })}
                className={formClass}
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
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
    </div>
  );
}
