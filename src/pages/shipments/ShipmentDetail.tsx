import { Link, useNavigate, useParams } from "react-router-dom";
import { Ship, Anchor, ChevronLeft } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { ledgerForOrder } from "@/lib/paymentLedger";
import { coversOrder } from "@/lib/packing";
import { STATUS_TONE } from "./status";

// One booked container: the vessel, the paperwork, and what is still owed on goods that may already
// have gone. Departure is the moment the bill of lading and container numbers first exist, so this
// is where they are typed and where they are stamped onto the commercial invoice.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const label = "mb-1 block text-xs font-medium text-paper-600";

export function ShipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    shipments,
    salesOrders,
    customers,
    packingLists,
    invoices,
    payments,
    updateShipment,
    departShipment,
    pushToast,
  } = useStore();

  const shipment = shipments.find((s) => s.id === id);

  if (!shipment) {
    return (
      <div>
        <PageHeader
          breadcrumb={["Fortune Net & Twine ERP", "Operations", "Shipments"]}
          eyebrow="Export Logistics"
          title="Shipment not found"
        />
        <EmptyState
          icon={<Ship className="h-5 w-5" />}
          title={`No shipment ${id ?? ""}`}
          description="It may have been removed."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/shipments")}>
              Back to shipments
            </Button>
          }
        />
      </div>
    );
  }

  const order = salesOrders.find((o) => o.id === shipment.salesOrderId);
  const customer = customers.find((c) => c.id === order?.customerId);
  const list = packingLists.find((p) => coversOrder(p, shipment.salesOrderId));
  const invoice = invoices.find((i) => i.salesOrderId === shipment.salesOrderId);
  const locked = shipment.status === "departed" || shipment.status === "arrived";
  const ready = Boolean(shipment.vessel.trim() && shipment.containerNo.trim() && shipment.billOfLadingNo.trim());
  /**
   * What is still owed on the order, across every payment line raised against it.
   *
   * Stated, not enforced. A container that misses its sailing costs more than the risk on a customer
   * who has always paid, and that call belongs to the sales team rather than to a rule in a form.
   */
  const outstanding = order ? ledgerForOrder(order, payments).outstanding : 0;

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Operations", shipment.id]}
        eyebrow="Export Logistics"
        title={shipment.id}
        description={`${customer?.name ?? "-"} · ${shipment.salesOrderId} · booked ${formatDate(shipment.bookedDate)}${
          list ? ` · packed on ${list.id}` : ""
        }`}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => navigate("/shipments")}
            >
              Back
            </Button>
            <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-medium", STATUS_TONE[shipment.status])}>
              {shipment.status}
            </span>
            {!locked && (
              <Button
                variant="primary"
                size="sm"
                icon={<Anchor className="h-3.5 w-3.5" />}
                disabled={!ready}
                title={ready ? undefined : "Vessel, container and B/L are required before departure"}
                onClick={() => {
                  departShipment(shipment.id);
                  pushToast({
                    tone: "success",
                    title: "Shipment departed",
                    description: invoice
                      ? `B/L and container written to ${invoice.id}.`
                      : `${shipment.salesOrderId} moved to document release.`,
                  });
                }}
              >
                Mark departed
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={label}>Vessel and voyage</label>
            <input
              value={shipment.vessel}
              disabled={locked}
              onChange={(e) => updateShipment(shipment.id, { vessel: e.target.value })}
              placeholder="MV Pacific Trader V.221E"
              className={clsx(input, locked && "bg-paper-50 text-paper-500")}
            />
          </div>
          <div>
            <label className={label}>Container no.</label>
            <input
              value={shipment.containerNo}
              disabled={locked}
              onChange={(e) => updateShipment(shipment.id, { containerNo: e.target.value })}
              placeholder="TCLU 4821960"
              className={clsx(input, locked && "bg-paper-50 text-paper-500")}
            />
          </div>
          <div>
            <label className={label}>Bill of lading no.</label>
            <input
              value={shipment.billOfLadingNo}
              disabled={locked}
              onChange={(e) => updateShipment(shipment.id, { billOfLadingNo: e.target.value })}
              placeholder="MNLJKT-2026-0447"
              className={clsx(input, locked && "bg-paper-50 text-paper-500")}
            />
          </div>
          <div>
            <label className={label}>Port of loading</label>
            <input
              value={shipment.portOfLoading}
              disabled={locked}
              onChange={(e) => updateShipment(shipment.id, { portOfLoading: e.target.value })}
              className={clsx(input, locked && "bg-paper-50 text-paper-500")}
            />
          </div>
          <div>
            <label className={label}>Port of discharge</label>
            <input
              value={shipment.portOfDischarge}
              disabled={locked}
              onChange={(e) => updateShipment(shipment.id, { portOfDischarge: e.target.value })}
              className={clsx(input, locked && "bg-paper-50 text-paper-500")}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>ETD</label>
              <input
                type="date"
                value={shipment.etd ?? ""}
                disabled={locked}
                onChange={(e) => updateShipment(shipment.id, { etd: e.target.value })}
                className={clsx(input, locked && "bg-paper-50 text-paper-500")}
              />
            </div>
            <div>
              <label className={label}>ETA</label>
              <input
                type="date"
                value={shipment.eta ?? ""}
                disabled={locked}
                onChange={(e) => updateShipment(shipment.id, { eta: e.target.value })}
                className={clsx(input, locked && "bg-paper-50 text-paper-500")}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-100 pt-3 text-xs">
          <span className="text-paper-500">
            Weight from packing:{" "}
            <span className="font-mono font-semibold text-pine-800">{shipment.grossWeightKg.toFixed(2)} KG</span>
          </span>
          {outstanding > 0 ? (
            <span className="rounded-md bg-alert-50 px-2 py-1 text-alert-700">
              Outstanding:{" "}
              <span className="font-mono font-semibold">{formatMoney(outstanding, order?.currency)}</span> · sales to
              follow up
            </span>
          ) : (
            <span className="rounded-md bg-pine-50 px-2 py-1 text-pine-700">Paid in full</span>
          )}
          <span className="flex items-center gap-3">
            <Link to={`/orders/${shipment.salesOrderId}`} className="font-mono text-manifest-600 hover:underline">
              {shipment.salesOrderId}
            </Link>
            {invoice && (
              <Link to={`/invoices/${invoice.id}`} className="font-mono text-manifest-600 hover:underline">
                {invoice.id}
              </Link>
            )}
            {outstanding > 0 && (
              <Link to="/payments" className="font-medium text-manifest-600 hover:underline">
                Record payment
              </Link>
            )}
          </span>
        </div>
      </Card>
    </div>
  );
}
