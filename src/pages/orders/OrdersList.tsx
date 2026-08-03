import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate } from "@/lib/format";
import { ORDER_STAGES } from "@/lib/types";
import type { OrderStage } from "@/lib/types";

export function OrdersList() {
  const { salesOrders, customers: CUSTOMERS } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<OrderStage | "all">("all");

  const filtered = useMemo(() => {
    return salesOrders.filter((o) => {
      if (stageFilter !== "all" && o.currentStage !== stageFilter) return false;
      if (query) {
        const customer = CUSTOMERS.find((c) => c.id === o.customerId);
        const haystack = `${o.id} ${o.consignee} ${customer?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [salesOrders, stageFilter, query]);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales"]}
        eyebrow="Order Fulfillment"
        title="Sales Orders"
        description="Confirmed orders moving through production, shipment, and financial settlement."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SO number or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as OrderStage | "all")}
          className="rounded-lg border border-paper-200 bg-white px-3 py-2 text-xs font-medium text-paper-600"
        >
          <option value="all">All stages</option>
          {ORDER_STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No sales orders match your filters" />
      ) : (
        <Table>
          <THead>
            <TH>SO Number</TH>
            <TH>Customer</TH>
            <TH>Order Date</TH>
            <TH>Value</TH>
            <TH>Priority</TH>
            <TH>Current Stage</TH>
            <TH>Owner</TH>
          </THead>
          <tbody>
            {filtered.map((o) => {
              const customer = CUSTOMERS.find((c) => c.id === o.customerId);
              const stageMeta = ORDER_STAGES.find((s) => s.id === o.currentStage);
              const blocked = o.stages.some((s) => s.status === "blocked");
              return (
                <TR key={o.id} onClick={() => navigate(`/orders/${o.id}`)}>
                  <TD className="font-mono font-semibold text-pine-800">{o.id}</TD>
                  <TD>
                    <p className="font-medium">{customer?.name}</p>
                    <p className="text-xs text-paper-400">{o.country}</p>
                  </TD>
                  <TD className="font-mono text-xs">{formatDate(o.orderDate)}</TD>
                  <TD className="font-mono font-medium">{formatMoney(o.orderValue, o.currency)}</TD>
                  <TD>
                    <Badge status={o.priority} />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <Badge status={blocked ? "blocked" : o.currentStage} label={stageMeta?.label} />
                    </div>
                  </TD>
                  <TD className="text-xs text-paper-500">{stageMeta?.role}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
