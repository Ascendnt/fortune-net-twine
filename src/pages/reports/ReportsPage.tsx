import { useMemo, useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { formatMoney, daysBetween } from "@/lib/format";

export function ReportsPage() {
  const { payments, salesOrders, pushToast, customers: CUSTOMERS } = useStore();
  const [soaCustomer, setSoaCustomer] = useState<string | null>(null);

  const aging = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return CUSTOMERS.map((c) => {
      const custOrders = salesOrders.filter((o) => o.customerId === c.id).map((o) => o.id);
      const outstanding = payments.filter(
        (p) => custOrders.includes(p.salesOrderId) && p.status !== "verified" && p.expectedAmount - p.amountReceived > 0
      );
      const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
      outstanding.forEach((p) => {
        const amt = p.expectedAmount - p.amountReceived;
        const age = p.dueDate ? Math.max(0, daysBetween(p.dueDate, today)) : 0;
        if (age <= 30) buckets.d0_30 += amt;
        else if (age <= 60) buckets.d31_60 += amt;
        else if (age <= 90) buckets.d61_90 += amt;
        else buckets.d90_plus += amt;
      });
      const total = buckets.d0_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus;
      return { customer: c, buckets, total };
    }).filter((r) => r.total > 0);
  }, [payments, salesOrders]);

  const collection = useMemo(() => {
    const verified = payments.filter((p) => p.status === "verified");
    const byMethod: Record<string, number> = {};
    verified.forEach((p) => {
      const key = p.method ?? "Unspecified";
      byMethod[key] = (byMethod[key] ?? 0) + p.amountReceived;
    });
    return { total: verified.reduce((s, p) => s + p.amountReceived, 0), count: verified.length, byMethod };
  }, [payments]);

  const totalOutstanding = aging.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Finance"]}
        eyebrow="Financial Reporting"
        title="Reports"
        description="Aging of accounts and collection summaries generated from recorded remittances."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total outstanding" value={formatMoney(totalOutstanding)} tone="alert" />
        <StatCard label="Total collected" value={formatMoney(collection.total)} tone="pine" />
        <StatCard label="Verified transactions" value={String(collection.count)} />
        <StatCard label="Customers with balance" value={String(aging.length)} tone="amber" />
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Aging of Accounts"
          eyebrow="A. Sales Performance"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => pushToast({ tone: "info", title: "Export simulated", description: "CSV export is a Phase 1 integration." })}
            >
              Export
            </Button>
          }
        />
        <Table>
          <THead>
            <TH>Customer</TH>
            <TH>0–30 days</TH>
            <TH>31–60 days</TH>
            <TH>61–90 days</TH>
            <TH>90+ days</TH>
            <TH>Total</TH>
            <TH>Statement</TH>
          </THead>
          <tbody>
            {aging.map((r) => (
              <TR key={r.customer.id}>
                <TD className="font-medium">{r.customer.name}</TD>
                <TD className="font-mono">{formatMoney(r.buckets.d0_30)}</TD>
                <TD className="font-mono">{formatMoney(r.buckets.d31_60)}</TD>
                <TD className="font-mono text-amber-700">{formatMoney(r.buckets.d61_90)}</TD>
                <TD className="font-mono text-alert-700">{formatMoney(r.buckets.d90_plus)}</TD>
                <TD className="font-mono font-semibold">{formatMoney(r.total)}</TD>
                <TD>
                  <Button variant="ghost" size="sm" onClick={() => setSoaCustomer(r.customer.id)}>
                    Generate SOA
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Collection Report" eyebrow="B. Volume" subtitle="Verified remittances grouped by payment channel" />
        <div className="space-y-2">
          {Object.entries(collection.byMethod).map(([method, amt]) => (
            <div key={method} className="flex items-center justify-between rounded-lg bg-paper-50 px-3 py-2 text-sm">
              <span className="text-paper-600">{method}</span>
              <span className="font-mono font-semibold text-paper-800">{formatMoney(amt)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={!!soaCustomer}
        onClose={() => setSoaCustomer(null)}
        title="Statement of Account"
        subtitle={CUSTOMERS.find((c) => c.id === soaCustomer)?.name}
        footer={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              pushToast({ tone: "info", title: "SOA export simulated" });
              setSoaCustomer(null);
            }}
          >
            Export PDF
          </Button>
        }
      >
        {soaCustomer && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-paper-300 px-3 py-6 text-center text-paper-400">
              <BarChart3 className="h-4 w-4" />
              Statement of Account preview. Orders, payments received, and current balance for this customer would
              render here in the full build.
            </div>
            <p className="text-xs text-paper-400">
              Total orders: {CUSTOMERS.find((c) => c.id === soaCustomer)?.totalOrders} · Outstanding:{" "}
              <span className="font-mono font-semibold text-alert-600">
                {formatMoney(CUSTOMERS.find((c) => c.id === soaCustomer)?.outstandingBalanceUSD ?? 0)}
              </span>
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
