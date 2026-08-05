import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, FolderOpen, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { DOCUMENTS } from "@/lib/mockData";
import { formatDate } from "@/lib/format";
import type { DocumentType } from "@/lib/types";

const TYPES: (DocumentType | "all")[] = [
  "all",
  "Proforma Invoice",
  "Purchase Order",
  "Commercial Invoice",
  "Packing List",
  "Remittance Copy",
  "Net Plan",
  "Customer Confirmation",
];

export function DocumentCenter() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "all">("all");

  const filtered = useMemo(() => {
    return DOCUMENTS.filter((d) => {
      if (typeFilter !== "all" && d.type !== typeFilter) return false;
      if (query && !d.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, typeFilter]);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Centralized Repository"
        title="Document Center"
        description="Every PI, PO, packing list, and remittance copy, with version history so only the current revision is authoritative."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search document name…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DocumentType | "all")}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-xs font-medium text-paper-600"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="No documents match your filters" />
      ) : (
        <Table>
          <THead>
            <TH>Document</TH>
            <TH>Type</TH>
            <TH>Related Order</TH>
            <TH>Version</TH>
            <TH>Uploaded By</TH>
            <TH>Date</TH>
            <TH>Status</TH>
          </THead>
          <tbody>
            {filtered.map((d) => (
              <TR key={d.id}>
                <TD>
                  <span className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4 text-paper-300" />
                    {d.name}
                  </span>
                </TD>
                <TD className="text-xs">{d.type}</TD>
                <TD>
                  {d.relatedOrderId ? (
                    <Link to={`/orders/${d.relatedOrderId}`} className="font-mono text-xs font-semibold text-manifest-600 hover:underline">
                      {d.relatedOrderId}
                    </Link>
                  ) : (
                    <span className="text-xs text-paper-300">Unlinked</span>
                  )}
                </TD>
                <TD className="font-mono text-xs">
                  v{d.version}
                  {!d.isCurrent && <span className="ml-1.5 text-alert-500">(superseded)</span>}
                </TD>
                <TD className="text-xs">{d.uploadedBy}</TD>
                <TD className="font-mono text-xs">{formatDate(d.uploadDate)}</TD>
                <TD>
                  <Badge status={d.approvalStatus === "approved" ? "approved" : d.approvalStatus === "pending" ? "pending" : "n/a"} />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
