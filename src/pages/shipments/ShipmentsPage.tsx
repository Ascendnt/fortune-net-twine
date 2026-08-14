import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Ship, Plus, Search } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney, piRef } from "@/lib/format";
import { ledgerForOrder } from "@/lib/paymentLedger";
import { STATUS_TONE } from "./status";

// Shipment closes the loop. Booking pulls the weight from what was actually packed, and departure
// writes the bill of lading and container numbers onto the commercial invoice, which is the point at
// which those numbers first exist.
//
// This screen is the index and the money watch: which containers exist, and which of them have left
// with a balance still owed. One container is worked on at /shipments/:id.

type ShipmentFilter = "all" | "booked" | "departed" | "unpaid" | "paid";

const FILTERS: { id: ShipmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "booked", label: "Booked" },
  { id: "departed", label: "Sailed" },
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid in full" },
];

export function ShipmentsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShipmentFilter>("all");
  /** Open when somebody is booking a container, listing the P.I.s cleared to go. */
  const [booking, setBooking] = useState(false);
  const {
    shipments,
    salesOrders,
    quotations,
    customers,
    inspections,
    payments,
    createShipment,
    pushToast,
  } = useStore();

  // An order can only be booked once inspection has passed.
  const bookable = useMemo(
    () =>
      salesOrders.filter(
        (so) =>
          so.currentStage === "shipment" &&
          !shipments.some((s) => s.salesOrderId === so.id) &&
          inspections.some((i) => (i.salesOrderIds ?? []).includes(so.id) && i.result === "confirmed")
      ),
    [salesOrders, shipments, inspections]
  );

  const stats = useMemo(
    () => ({
      booked: shipments.filter((s) => s.status === "booked").length,
      inTransit: shipments.filter((s) => s.status === "departed").length,
      gross: shipments.reduce((s, x) => s + x.grossWeightKg, 0),
    }),
    [shipments]
  );

  const customerName = (soId: string) => {
    const so = salesOrders.find((s) => s.id === soId);
    return customers.find((c) => c.id === so?.customerId)?.name ?? "-";
  };

  /** The P.I. reference as the customer knows it, revision suffix and all. */
  const refForOrder = (soId: string) => {
    const order = salesOrders.find((o) => o.id === soId);
    const q = order?.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    return q ? piRef(q.id, q.revisionNo) : (order?.quotationId ?? soId);
  };

  /**
   * What is still owed on an order, across every payment line raised against it.
   *
   * Goes through the same ledger the order page reads rather than summing each line's own shortfall:
   * summed per line, an overpaid deposit and a short balance on the same order would not net against
   * each other, and this screen would show money owed that the order page already shows as settled.
   */
  const outstandingOn = (soId: string) => {
    const so = salesOrders.find((s) => s.id === soId);
    return so ? ledgerForOrder(so, payments).outstanding : 0;
  };

  const currencyOf = (soId: string) => salesOrders.find((s) => s.id === soId)?.currency ?? "USD";

  const totalOutstanding = shipments
    .filter((s) => s.status !== "arrived")
    .reduce((sum, s) => sum + outstandingOn(s.salesOrderId), 0);

  /** Passed inspection, but the balance has not been verified so nothing can be booked yet. */
  const awaitingPayment = salesOrders.filter(
    (so) =>
      so.currentStage === "final_payment" &&
      inspections.some((i) => (i.salesOrderIds ?? []).includes(so.id) && i.result === "confirmed")
  );

  /** Containers already gone, or booked to go, with money still owed against them. */
  const unpaidShipped = shipments.filter((s) => outstandingOn(s.salesOrderId) > 0);

  const visible = shipments.filter((s) => {
    if (filter === "unpaid" && outstandingOn(s.salesOrderId) <= 0) return false;
    if (filter === "paid" && outstandingOn(s.salesOrderId) > 0) return false;
    if (filter === "booked" && s.status !== "booked") return false;
    if (filter === "departed" && s.status !== "departed" && s.status !== "arrived") return false;
    if (query) {
      const haystack =
        `${s.id} ${s.salesOrderId} ${refForOrder(s.salesOrderId)} ${customerName(s.salesOrderId)} ${s.vessel} ${s.billOfLadingNo}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations"]}
        eyebrow="Export Logistics"
        title="Shipments"
        description="Container booking, bill of lading and departure, and what is still owed on goods already gone."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            disabled={bookable.length === 0}
            title={bookable.length === 0 ? "Nothing has passed inspection yet" : undefined}
            onClick={() => setBooking(true)}
          >
            Book shipment
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Booked, not sailed" value={String(stats.booked)} tone="amber" />
        <StatCard label="In transit" value={String(stats.inTransit)} tone="pine" />
        <StatCard label="Weight shipped" value={`${stats.gross.toFixed(2)} KG`} />
        <StatCard
          label="Shipped but unpaid"
          value={formatMoney(totalOutstanding)}
          tone={totalOutstanding > 0 ? "alert" : "pine"}
        />
      </div>

      {/* The monitoring half of this screen. Goods leave before the money always arrives, and the
          sales team needs one place that says which containers are out with a balance against them,
          rather than reconstructing it from statements weeks later. */}
      {unpaidShipped.length > 0 && (
        <Card className="mb-4 border-alert-200 bg-alert-50/40">
          <CardHeader
            title="Shipped with a balance outstanding"
            eyebrow="For the sales team to chase"
            subtitle="These containers have sailed. The amounts beside them are still owed."
          />
          <div className="space-y-2">
            {unpaidShipped.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <Link to={`/shipments/${s.id}`} className="font-mono font-semibold text-manifest-600 hover:underline">
                    {refForOrder(s.salesOrderId)}
                  </Link>
                  <span className="ml-2 text-paper-700">{customerName(s.salesOrderId)}</span>
                  <p className="text-[11px] text-paper-400">
                    {s.id} · {s.status} · {s.etd ? `sailed ${formatDate(s.etd)}` : "not yet sailed"} ·{" "}
                    {s.grossWeightKg.toFixed(2)} KG
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-alert-700">
                    {formatMoney(outstandingOn(s.salesOrderId), currencyOf(s.salesOrderId))}
                  </span>
                  <Link to="/payments" className="font-medium text-manifest-600 hover:underline">
                    Record payment
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Orders that have passed inspection but are waiting on the balance. Without this the screen
          is silent about them, and the only clue that anything is pending is a container that never
          appears. */}
      {awaitingPayment.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/40">
          <CardHeader
            title="Passed inspection, waiting on final payment"
            eyebrow="Not yet bookable"
            subtitle="The goods are cleared. The container can be booked once the balance is verified."
          />
          <div className="space-y-2">
            {awaitingPayment.map((so) => (
              <div
                key={so.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
              >
                <div>
                  <Link to={`/orders/${so.id}`} className="font-mono font-semibold text-manifest-600 hover:underline">
                    {refForOrder(so.id)}
                  </Link>
                  <span className="ml-2 text-paper-700">{customerName(so.id)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-amber-800">
                    {formatMoney(outstandingOn(so.id), currencyOf(so.id))} outstanding
                  </span>
                  <Link to={`/orders/${so.id}`} className="font-medium text-manifest-600 hover:underline">
                    Record payment
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipment, P.I., customer, vessel or B/L…"
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
          icon={<Ship className="h-5 w-5" />}
          title={shipments.length === 0 ? "No shipments booked" : "No shipments match your filters"}
          description={
            shipments.length === 0
              ? "A shipment can be booked once an order has passed inspection."
              : "Try a different search term or filter."
          }
        />
      ) : (
        <Table>
          <THead>
            <TH>Shipment</TH>
            <TH>P.I. No.</TH>
            <TH>Customer</TH>
            <TH>Vessel</TH>
            <TH>Container</TH>
            <TH>ETD</TH>
            <TH>Weight KG</TH>
            <TH>Outstanding</TH>
            <TH>Status</TH>
          </THead>
          <tbody>
            {visible.map((s) => {
              const owed = outstandingOn(s.salesOrderId);
              return (
                <TR key={s.id} onClick={() => navigate(`/shipments/${s.id}`)}>
                  <TD className="font-mono font-semibold text-pine-800">{s.id}</TD>
                  <TD className="font-mono text-xs text-paper-700">{refForOrder(s.salesOrderId)}</TD>
                  <TD className="font-medium">{customerName(s.salesOrderId)}</TD>
                  <TD className="text-xs text-paper-600">{s.vessel || <span className="text-paper-300">-</span>}</TD>
                  <TD className="font-mono text-xs">
                    {s.containerNo || <span className="text-paper-300">-</span>}
                  </TD>
                  <TD className="font-mono text-xs">{s.etd ? formatDate(s.etd) : <span className="text-paper-300">-</span>}</TD>
                  <TD className="font-mono">{s.grossWeightKg.toFixed(2)}</TD>
                  {/* Stated, not enforced. The container can still sail; somebody just has to know
                      what is owed while it does. */}
                  <TD className={clsx("font-mono", owed > 0 ? "font-semibold text-alert-700" : "text-pine-700")}>
                    {owed > 0 ? formatMoney(owed, currencyOf(s.salesOrderId)) : "Paid"}
                  </TD>
                  <TD>
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[s.status])}>
                      {s.status}
                    </span>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      <Modal
        open={booking}
        onClose={() => setBooking(false)}
        title="Which P.I. is being shipped?"
        subtitle={`${bookable.length} released by the customer and not yet booked`}
        width="max-w-2xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setBooking(false)}>
            Cancel
          </Button>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-paper-500">
            Only P.I.s whose inspection report the customer has confirmed are offered. Booking pulls the weight from
            what was actually packed.
          </p>
          {bookable.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-paper-400">
              Nothing is waiting to be booked. A P.I. appears here once its inspection is confirmed.
            </p>
          )}
          {bookable.map((so) => (
            <button
              key={so.id}
              onClick={() => {
                const shipmentId = createShipment(so.id);
                pushToast({ tone: "success", title: "Shipment booked", description: shipmentId });
                setBooking(false);
                navigate(`/shipments/${shipmentId}`);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-paper-200 px-3 py-2.5 text-left hover:border-pine-600 hover:bg-pine-50/50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-paper-800">
                  <span className="font-mono text-pine-800">{refForOrder(so.id)}</span>
                  <span className="ml-2 font-mono text-[11px] text-paper-400">{so.id}</span>
                </span>
                <span className="block text-[11px] text-paper-500">{customerName(so.id)}</span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-manifest-600">Book →</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
