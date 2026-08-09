import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate, piRef } from "@/lib/format";
import type { QuotationStatus } from "@/lib/types";

type StatusFilter = QuotationStatus | "all" | "expired";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "for_approval", label: "For Approval" },
  { id: "sent", label: "Sent" },
  { id: "under_negotiation", label: "Negotiation" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  // Expired is not a status a quotation is set to; it is worked out from the validity date, so it
  // sits alongside the statuses rather than inside the enum.
  { id: "expired", label: "Expired" },
];

/**
 * Revision moved out of the table and into the filters. The number is already carried by the PI
 * reference (PI-33007-R2), so a column repeating it earned no space; what people actually want is
 * to pull up everything that has been revised, or everything still on its first issue.
 */
type RevisionFilter = "all" | "original" | "revised";

const REVISION_FILTERS: { id: RevisionFilter; label: string }[] = [
  { id: "all", label: "Any revision" },
  { id: "original", label: "First issue only" },
  { id: "revised", label: "Revised" },
];

/**
 * A quotation that is out with a customer and past its validity date.
 *
 * Drafts and quotations that have already been accepted or rejected are excluded: a draft was never
 * offered to anyone, and a closed quotation cannot lapse. Only live offers can go stale, and those
 * are the ones somebody has to chase or re-issue.
 */
export function isExpired(q: { status: QuotationStatus; validityDate?: string }, today: string): boolean {
  const live = q.status === "sent" || q.status === "under_negotiation" || q.status === "for_approval";
  return live && Boolean(q.validityDate) && q.validityDate! < today;
}

export function QuotationsList() {
  const { quotations, customers: CUSTOMERS } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [revisionFilter, setRevisionFilter] = useState<RevisionFilter>("all");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return quotations.filter((q) => {
      if (statusFilter === "expired") {
        if (!isExpired(q, today)) return false;
      } else if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (revisionFilter === "original" && q.revisionNo > 0) return false;
      if (revisionFilter === "revised" && q.revisionNo === 0) return false;
      if (query) {
        const customer = CUSTOMERS.find((c) => c.id === q.customerId);
        // The revised reference is searchable too, so typing "PI-33007-R2" finds the document
        // exactly as it is written on the customer's copy.
        const haystack =
          `${piRef(q.id, q.revisionNo)} ${q.consignee} ${customer?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [quotations, statusFilter, revisionFilter, query, CUSTOMERS, today]);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales"]}
        eyebrow="Quotation Management"
        title="Quotations / Proforma Invoices"
        description="Every PI issued to a customer, from first draft through revision and acceptance."
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
        <div className="flex flex-wrap gap-1.5">
          {REVISION_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setRevisionFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                revisionFilter === f.id
                  ? "border-manifest-600 bg-manifest-600 text-white"
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
            <TH>Validity</TH>
            <TH>Value</TH>
            <TH>Salesperson</TH>
            <TH>Status</TH>
            <TH>Sales Order</TH>
          </THead>
          <tbody>
            {filtered.map((q) => {
              const customer = CUSTOMERS.find((c) => c.id === q.customerId);
              const value = q.items.reduce((s, li) => s + li.totalPrice, 0) + q.freight - q.discount + q.tax;
              const expired = isExpired(q, today);
              return (
                <TR key={q.id} onClick={() => navigate(`/quotations/${q.id}`)}>
                  <TD className="font-mono font-semibold text-pine-800">{piRef(q.id, q.revisionNo)}</TD>
                  <TD>
                    <p className="font-medium">{customer?.name ?? q.consignee}</p>
                    <p className="text-xs text-paper-400">{customer?.country}</p>
                  </TD>
                  <TD className="font-mono text-xs">{formatDate(q.issueDate)}</TD>
                  <TD className="font-mono text-xs">
                    {q.validityDate ? (
                      // Flagged in place rather than only through the filter, so a lapsed quotation
                      // is obvious while scanning the list.
                      <span className={expired ? "font-semibold text-alert-600" : undefined}>
                        {formatDate(q.validityDate)}
                        {expired && <span className="ml-1 font-sans text-[10px] uppercase">expired</span>}
                      </span>
                    ) : (
                      <span className="text-paper-300">—</span>
                    )}
                  </TD>
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
