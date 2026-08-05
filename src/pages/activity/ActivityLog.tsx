import { useState } from "react";
import { Link } from "react-router-dom";
import { History, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";

export function ActivityLog() {
  const { activity } = useStore();
  const [query, setQuery] = useState("");

  const filtered = activity.filter((a) =>
    query ? `${a.user} ${a.action} ${a.recordId}`.toLowerCase().includes(query.toLowerCase()) : true
  );

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Full Audit Trail"
        title="Activity Logs"
        description="Every status change, approval, and payment verification: who did what, and when."
      />

      <div className="mb-4 relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user, action, or record…"
          className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </div>

      <div className="rounded-xl border border-paper-200 bg-white shadow-[var(--shadow-card)]">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-paper-400">
            <History className="h-4 w-4" /> No activity matches your search.
          </div>
        ) : (
          <div className="divide-y divide-paper-100">
            {filtered.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-pine-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-paper-800">
                    <span className="font-semibold text-paper-900">{a.user}</span>{" "}
                    <span className="text-paper-400">({a.department})</span>: {a.action}
                    {a.previousStatus && a.newStatus && (
                      <span className="text-paper-400">
                        {" "}
                        · {a.previousStatus} → {a.newStatus}
                      </span>
                    )}
                  </p>
                  {a.comment && <p className="mt-0.5 text-xs text-paper-500">{a.comment}</p>}
                  <p className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-paper-400">
                    <Link
                      to={a.recordType === "Sales Order" ? `/orders/${a.recordId}` : a.recordType === "Quotation" ? `/quotations/${a.recordId}` : "#"}
                      className="hover:underline"
                    >
                      {a.recordType} · {a.recordId}
                    </Link>
                    <span>·</span>
                    {formatDateTime(a.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
