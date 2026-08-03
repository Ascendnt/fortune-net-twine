import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate } from "@/lib/format";
import type { QuotationStatus } from "@/lib/types";

const STATUS_FILTERS: { id: QuotationStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "for_approval", label: "For Approval" },
  { id: "sent", label: "Sent" },
  { id: "under_negotiation", label: "Negotiation" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
];

export function QuotationsList() {
  const { quotations, customers: CUSTOMERS } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "all">("all");

  const filtered = useMemo(() => {
    return quotations.filter((q) => {
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (query) {
        const customer = CUSTOMERS.find((c) => c.id === q.customerId);
        const haystack = `${q.id} ${q.consignee} ${customer?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [quotations, statusFilter, query]);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales"]}
        eyebrow="Quotation Management"
        title="Quotations / Proforma Invoices"
        description="Every PI issued to a customer — from first draft through revision and acceptance."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/quotations/new")}>
            New Quotation
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PI number or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === f.id
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="No quotations match your filters"
          description="Try a different search term or status, or create a new quotation."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/quotations/new")}>
              New Quotation
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TH>PI Number</TH>
            <TH>Customer</TH>
            <TH>Issue Date</TH>
            <TH>Revision</TH>
            <TH>Value</TH>
            <TH>Salesperson</TH>
            <TH>Status</TH>
            <TH>Sales Order</TH>
          </THead>
          <tbody>
            {filtered.map((q) => {
              const customer = CUSTOMERS.find((c) => c.id === q.customerId);
              const value = q.items.reduce((s, li) => s + li.totalPrice, 0) + q.freight - q.discount + q.tax;
              return (
                <TR key={q.id} onClick={() => navigate(`/quotations/${q.id}`)}>
                  <TD className="font-mono font-semibold text-pine-800">{q.id}</TD>
                  <TD>
                    <p className="font-medium">{customer?.name ?? q.consignee}</p>
                    <p className="text-xs text-paper-400">{customer?.country}</p>
                  </TD>
                  <TD className="font-mono text-xs">{formatDate(q.issueDate)}</TD>
                  <TD className="font-mono text-xs">Rev. {q.revisionNo}</TD>
                  <TD className="font-mono font-medium">{formatMoney(value, q.currency)}</TD>
                  <TD>{q.assignedSalesperson}</TD>
                  <TD>
                    <Badge status={q.status} />
                  </TD>
                  <TD>
                    {q.salesOrderId ? (
                      <Link
                        onClick={(e) => e.stopPropagation()}
                        to={`/orders/${q.salesOrderId}`}
                        className="font-mono text-xs font-semibold text-manifest-600 hover:underline"
                      >
                        {q.salesOrderId}
                      </Link>
                    ) : (
                      <span className="text-xs text-paper-300">—</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
