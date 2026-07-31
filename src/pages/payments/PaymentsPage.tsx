import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Search } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { CUSTOMERS } from "@/lib/mockData";
import { formatMoney, formatDate } from "@/lib/format";
import type { PaymentStatus } from "@/lib/types";

const FILTERS: { id: PaymentStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expected", label: "Expected" },
  { id: "submitted_for_verification", label: "Submitted" },
  { id: "partially_paid", label: "Partial" },
  { id: "verified", label: "Verified" },
  { id: "overdue", label: "Overdue" },
];

export function PaymentsPage() {
  const { payments, salesOrders, verifyPayment, rejectPayment, role, pushToast } = useStore();
  const [filter, setFilter] = useState<PaymentStatus | "all">("all");
  const [query, setQuery] = useState("");

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
                  {p.status === "submitted_for_verification" && canVerify ? (
                    <div className="flex gap-1.5">
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
                      <Button variant="danger" size="sm" onClick={() => rejectPayment(p.id)}>
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-paper-300">
                      {p.verifiedBy ? `Verified by ${p.verifiedBy}` : "—"}
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
