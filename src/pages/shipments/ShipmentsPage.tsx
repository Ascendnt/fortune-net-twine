import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ship, Plus, Anchor, Search } from "lucide-react";
import { HowToUse } from "@/components/ui/HowToUse";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { ledgerForOrder } from "@/lib/paymentLedger";
import type { ShipmentStatus } from "@/lib/types";

// Shipment closes the loop. Booking pulls the gross weight from what was actually packed, and
// departure writes the bill of lading and container numbers onto the commercial invoice, which is
// the point at which those numbers first exist.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const label = "mb-1 block text-xs font-medium text-paper-600";

type ShipmentFilter = "all" | "booked" | "departed" | "unpaid" | "paid";

const FILTERS: { id: ShipmentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "booked", label: "Booked" },
  { id: "departed", label: "Sailed" },
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid in full" },
];

const STATUS_TONE: Record<ShipmentStatus, string> = {
  booked: "bg-manifest-100 text-manifest-800",
  loaded: "bg-amber-100 text-amber-800",
  departed: "bg-pine-100 text-pine-800",
  arrived: "bg-pine-100 text-pine-800",
};

export function ShipmentsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShipmentFilter>("all");
  const {
    shipments,
    salesOrders,
    customers,
    packingLists,
    inspections,
    invoices,
    payments,
    createShipment,
    updateShipment,
    departShipment,
    pushToast,
  } = useStore();

  // An order can only be booked once inspection has passed.
  const bookable = useMemo(
    () =>
      salesOrders.filter(
        (so) =>
          so.currentStage === "shipment" &&
          !shipments.some((s) => s.salesOrderId === so.id) &&
          inspections.some((i) => i.salesOrderId === so.id && i.result === "pass")
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
    return customers.find((c) => c.id === so?.customerId)?.name ?? "—";
  };

  /**
   * What is still owed on an order, across every payment line raised against it.
   *
   * Shipping is not blocked on it. A container that misses its sailing costs more than the risk on
   * a customer who has always paid, and that call belongs to the sales team, not to a rule in a
   * form. What the system owes them is the number, in front of them, at the moment they book —
   * rather than leaving it to be discovered on a statement weeks later.
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
      inspections.some((i) => i.salesOrderId === so.id && i.result === "pass")
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
        `${s.id} ${s.salesOrderId} ${customerName(s.salesOrderId)} ${s.vessel} ${s.billOfLadingNo}`.toLowerCase();
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
      />

      <HowToUse
        id="shipments-v2"
        steps={[
          "An order appears under Released and awaiting booking once its inspection has passed. Press Book shipment.",
          "Fill in the vessel, container, bill of lading and ports. ETD and ETA can be set now or once the line confirms them.",
          "Press Mark departed when the container sails. That stamps the B/L and container onto the commercial invoice.",
          "Watch the Outstanding column. Shipping is not blocked on payment, so a container can sail against a balance — but somebody has to be chasing it.",
          "Use the Unpaid filter to see, in one place, every shipment that has left with money still owed.",
        ]}
        note="Gross weight comes from the closed packing lists on the order, so it is what was actually packed rather than what was quoted."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Booked, not sailed" value={String(stats.booked)} tone="amber" />
        <StatCard label="In transit" value={String(stats.inTransit)} tone="pine" />
        <StatCard label="Gross weight shipped" value={`${stats.gross.toFixed(2)} KG`} />
        <StatCard
          label="Shipped but unpaid"
          value={formatMoney(totalOutstanding)}
          tone={totalOutstanding > 0 ? "alert" : "pine"}
        />
      </div>

      {/* The monitoring half of this screen. Goods leave before the money always arrives, and the
          sales team needs one place that says which containers are out with a balance against
          them, rather than reconstructing it from statements weeks later. */}
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
                  <Link
                    to={`/orders/${s.salesOrderId}`}
                    className="font-mono font-semibold text-manifest-600 hover:underline"
                  >
                    {s.salesOrderId}
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipment, order, customer, vessel or B/L…"
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

      {/* Orders that have passed inspection but are waiting on the balance. Without this the
          screen is silent about them, and the only clue that anything is pending is a container
          that never appears. */}
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
                    {so.id}
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

      {bookable.length > 0 && (
        <Card className="mb-4 border-manifest-200 bg-manifest-50/40">
          <CardHeader title="Released and awaiting booking" eyebrow="Passed inspection" />
          <div className="space-y-2">
            {bookable.map((so) => (
              <div key={so.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                <div>
                  <Link to={`/orders/${so.id}`} className="font-mono text-xs font-semibold text-manifest-600 hover:underline">
                    {so.id}
                  </Link>
                  <span className="ml-2 text-xs text-paper-600">{customerName(so.id)}</span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    const id = createShipment(so.id);
                    pushToast({ tone: "success", title: "Shipment booked", description: id });
                  }}
                >
                  Book shipment
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

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
        <div className="space-y-4">
          {visible.map((s) => {
            const list = packingLists.find((p) => p.salesOrderId === s.salesOrderId);
            const invoice = invoices.find((i) => i.salesOrderId === s.salesOrderId);
            const locked = s.status === "departed" || s.status === "arrived";
            const ready = Boolean(s.vessel.trim() && s.containerNo.trim() && s.billOfLadingNo.trim());

            return (
              <Card key={s.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span className="font-mono">{s.id}</span>
                      <Link to={`/orders/${s.salesOrderId}`} className="font-mono text-sm text-manifest-600 hover:underline">
                        {s.salesOrderId}
                      </Link>
                      <span className="text-sm font-normal text-paper-500">{customerName(s.salesOrderId)}</span>
                    </span>
                  }
                  eyebrow={`Booked ${formatDate(s.bookedDate)}${list ? ` · from ${list.id}` : ""}`}
                  action={
                    <div className="flex items-center gap-2">
                      <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-medium", STATUS_TONE[s.status])}>
                        {s.status}
                      </span>
                      {!locked && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Anchor className="h-3.5 w-3.5" />}
                          disabled={!ready}
                          title={ready ? undefined : "Vessel, container and B/L are required before departure"}
                          onClick={() => {
                            departShipment(s.id);
                            pushToast({
                              tone: "success",
                              title: "Shipment departed",
                              description: invoice
                                ? `B/L and container written to ${invoice.id}.`
                                : `${s.salesOrderId} moved to document release.`,
                            });
                          }}
                        >
                          Mark departed
                        </Button>
                      )}
                    </div>
                  }
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className={label}>Vessel and voyage</label>
                    <input
                      value={s.vessel}
                      disabled={locked}
                      onChange={(e) => updateShipment(s.id, { vessel: e.target.value })}
                      placeholder="MV Pacific Trader V.221E"
                      className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                    />
                  </div>
                  <div>
                    <label className={label}>Container no.</label>
                    <input
                      value={s.containerNo}
                      disabled={locked}
                      onChange={(e) => updateShipment(s.id, { containerNo: e.target.value })}
                      placeholder="TCLU 4821960"
                      className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                    />
                  </div>
                  <div>
                    <label className={label}>Bill of lading no.</label>
                    <input
                      value={s.billOfLadingNo}
                      disabled={locked}
                      onChange={(e) => updateShipment(s.id, { billOfLadingNo: e.target.value })}
                      placeholder="MNLJKT-2026-0447"
                      className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                    />
                  </div>
                  <div>
                    <label className={label}>Port of loading</label>
                    <input
                      value={s.portOfLoading}
                      disabled={locked}
                      onChange={(e) => updateShipment(s.id, { portOfLoading: e.target.value })}
                      className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                    />
                  </div>
                  <div>
                    <label className={label}>Port of discharge</label>
                    <input
                      value={s.portOfDischarge}
                      disabled={locked}
                      onChange={(e) => updateShipment(s.id, { portOfDischarge: e.target.value })}
                      className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={label}>ETD</label>
                      <input
                        type="date"
                        value={s.etd ?? ""}
                        disabled={locked}
                        onChange={(e) => updateShipment(s.id, { etd: e.target.value })}
                        className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                      />
                    </div>
                    <div>
                      <label className={label}>ETA</label>
                      <input
                        type="date"
                        value={s.eta ?? ""}
                        disabled={locked}
                        onChange={(e) => updateShipment(s.id, { eta: e.target.value })}
                        className={clsx(input, locked && "bg-paper-50 text-paper-500")}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-100 pt-3 text-xs">
                  <span className="text-paper-500">
                    Gross weight from packing:{" "}
                    <span className="font-mono font-semibold text-pine-800">{s.grossWeightKg.toFixed(2)} KG</span>
                  </span>
                  {/* Stated, not enforced. The container can still sail; somebody just has to know
                      what is still owed while it does. */}
                  {outstandingOn(s.salesOrderId) > 0 ? (
                    <span className="rounded-md bg-alert-50 px-2 py-1 text-alert-700">
                      Outstanding:{" "}
                      <span className="font-mono font-semibold">
                        {formatMoney(outstandingOn(s.salesOrderId), currencyOf(s.salesOrderId))}
                      </span>{" "}
                      · sales to follow up
                    </span>
                  ) : (
                    <span className="rounded-md bg-pine-50 px-2 py-1 text-pine-700">Paid in full</span>
                  )}
                  {invoice && (
                    <Link to={`/invoices/${invoice.id}`} className="font-mono text-manifest-600 hover:underline">
                      {invoice.id}
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
