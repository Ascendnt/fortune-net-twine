import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Search } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/Feedback";
import { HowToUse } from "@/components/ui/HowToUse";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { settleInspection, weightVerdict } from "@/lib/inspectionPricing";
import { STATUS_LABEL, customerOf, listFor, refsFor } from "./helpers";
import clsx from "clsx";

// The inspection report is not a quality check, despite the name the factory has always used for
// it. It is the listing of what is about to be shipped, every bale with its number and its net and
// gross weight, sent to the customer so they can counter-check it against their own order and
// confirm the container may leave.
//
// The weights are why it matters. Nets are quoted from a standard weight per piece and the customer
// is billed for the kilos actually shipped, so the figures confirmed here are what each order's
// balance is invoiced against. Nothing on this screen passes or fails anything.
//
// This screen is the index: which reports exist and who is being waited on. One report is worked on
// at /inspection/:id, the same shape as quotations and packing lists.

const FILTERS: { id: "all" | "pending" | "sent" | "confirmed" | "held"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Being prepared" },
  { id: "sent", label: "With the customer" },
  { id: "confirmed", label: "Confirmed" },
  { id: "held", label: "Held" },
];

export function InspectionPage() {
  const { inspections, packingLists, salesOrders, customers } = useStore();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "confirmed" | "held">("all");

  const visible = useMemo(
    () =>
      inspections.filter((i) => {
        if (filter !== "all" && i.result !== filter) return false;
        if (query) {
          const ids = i.salesOrderIds ?? (i.salesOrderId ? [i.salesOrderId] : []);
          const cust = customers.find(
            (c) => c.id === packingLists.find((p) => p.id === i.packingListId)?.customerId
          );
          const haystack = `${i.id} ${i.packingListId ?? ""} ${ids.join(" ")} ${cust?.name ?? ""}`;
          if (!haystack.toLowerCase().includes(query.toLowerCase())) return false;
        }
        return true;
      }),
    [inspections, filter, query, customers, packingLists]
  );

  const stats = useMemo(
    () => ({
      preparing: inspections.filter((i) => i.result === "pending").length,
      withCustomer: inspections.filter((i) => i.result === "sent").length,
      held: inspections.filter((i) => i.result === "held").length,
    }),
    [inspections]
  );

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Pre-Shipment Confirmation"
        title="Inspection Reports"
        description="Confirm the weights of what is packed, send the listing to the customer, and release the container once they agree."
      />

      <HowToUse
        id="inspection-v4"
        steps={[
          "A report opens by itself when a packing list is closed. You do not create one by hand.",
          "Open a report from the table. It lists every bale in the container with the weights recorded at packing; check them against the scale and correct anything that is out.",
          "Watch the weight panel. It compares the computed weight the order was priced from against what the goods actually weigh, the same way the printed report states it.",
          "Press Preview to see the document, and Print or send it to the customer so they can counter-check the listing.",
          "Press Sent to customer once it has gone, so it is clear who is being waited on.",
          "When the customer agrees the load can ship, press Customer confirmed. Every order on the report is settled against its own measured weight and its balance is restated.",
          "If they come back with a query, press Hold and record what they said. The container is blocked until it is resolved.",
        ]}
        note="This is not a quality check. It is the shipping listing the customer signs off, and the weights on it are what the balance is invoiced against."
      />

      <div className="mb-5 grid grid-cols-3 gap-4">
        <StatCard label="Reports being prepared" value={String(stats.preparing)} tone="amber" />
        <StatCard label="Awaiting customer" value={String(stats.withCustomer)} />
        <StatCard label="Held by the customer" value={String(stats.held)} tone={stats.held > 0 ? "alert" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search report, load, order or customer…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="No inspection reports match your filters"
          description="A report opens automatically when a packing list is closed."
        />
      ) : (
        <Table>
          <THead>
            <TH>Report No.</TH>
            <TH>P.I. Nos.</TH>
            <TH>Customer</TH>
            <TH>From list</TH>
            <TH>Net KG</TH>
            <TH>Against computed</TH>
            <TH>Date</TH>
            <TH>Status</TH>
          </THead>
          <tbody>
            {visible.map((record) => {
              const settlement = settleInspection(record.lines ?? []);
              const verdictWord = weightVerdict(settlement);
              const cust = customerOf(record, packingLists, salesOrders, customers);
              return (
                <TR key={record.id} onClick={() => navigate(`/inspection/${record.id}`)}>
                  <TD className="font-mono font-semibold text-pine-800">{record.id}</TD>
                  <TD className="font-mono text-xs text-paper-700">
                    {refsFor(record, packingLists, salesOrders).replace(/^P\/I Nos?\. /, "")}
                  </TD>
                  <TD className="font-medium">{cust?.name ?? "-"}</TD>
                  <TD className="font-mono text-xs text-paper-500">{record.packingListId ?? "-"}</TD>
                  <TD className="font-mono font-medium">{settlement.netWeightKg.toFixed(2)}</TD>
                  {/* The variance is the reason anyone opens a report, so it is in the list rather
                      than one click inside every one of them. */}
                  <TD
                    className={clsx(
                      "font-mono text-xs",
                      verdictWord === "On weight"
                        ? "text-paper-500"
                        : verdictWord === "Underweight"
                          ? "text-amber-700"
                          : "text-pine-700"
                    )}
                  >
                    {settlement.weightDifferenceKg >= 0 ? "+" : ""}
                    {settlement.weightDifferenceKg.toFixed(2)} KG
                  </TD>
                  {/* The most recent thing that happened to it: when the customer answered, else
                      when it went out, else when the load it came from was closed. */}
                  <TD className="font-mono text-xs">
                    {formatDate(
                      record.confirmedDate ?? record.sentDate ?? listFor(record, packingLists)?.finalizedDate
                    )}
                  </TD>
                  <TD>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        record.result === "confirmed" && "bg-pine-100 text-pine-800",
                        record.result === "held" && "bg-alert-100 text-alert-700",
                        record.result === "sent" && "bg-manifest-100 text-manifest-700",
                        record.result === "pending" && "bg-amber-100 text-amber-800"
                      )}
                    >
                      {STATUS_LABEL[record.result] ?? record.result}
                    </span>
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
