import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Printer, FileDown, Loader2, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InvoiceDocumentPreview } from "@/components/domain/InvoiceDocumentPreview";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadElementAsPdf } from "@/lib/pdf";
import type { InvoiceStatus } from "@/lib/types";
import { resolveDiscount } from "@/lib/totals";
import { NON_NEGATIVE, NON_NEGATIVE_INT, toNonNegative, toPercent } from "@/lib/num";
import type { DiscountMode } from "@/lib/totals";

const formClass =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const miniClass =
  "w-24 rounded-md border border-paper-200 bg-white px-2 py-1 text-right text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const formLabel = "mb-1 block text-xs font-medium text-paper-600";

const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "sent", "paid", "overdue"];

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, customers, updateInvoice, removeInvoice, pushToast } = useStore();
  const inv = invoices.find((i) => i.id === id);
  const customer = inv ? customers.find((c) => c.id === inv.customerId) : undefined;
  const [pdfLoading, setPdfLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!inv) {
    return (
      <div>
        <PageHeader title="Invoice not found" breadcrumb={["Fortune Net & Twine ERP", "Documents"]} />
        <Button variant="secondary" onClick={() => navigate(-1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const itemsTotal = inv.items.reduce((s, li) => s + li.totalPrice, 0);
  const discountValue = resolveDiscount(itemsTotal, inv.discount, inv.discountMode);
  const total = itemsTotal + inv.freight - discountValue + inv.tax;
  const isPartial = inv.items.some((li) => li.shippedQtyPcs !== undefined && li.shippedQtyPcs !== li.qtyPcs);

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      await downloadElementAsPdf("ci-document-root", `${inv!.id}.pdf`);
      pushToast({ tone: "success", title: "PDF downloaded", description: `${inv!.id}.pdf saved to your downloads.` });
    } catch (err) {
      pushToast({
        tone: "danger",
        title: "PDF download failed",
        description: err instanceof Error ? err.message : "Unexpected error while generating the PDF.",
      });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <div className="no-print">
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales Orders", inv.salesOrderId, inv.id]}
        eyebrow="Commercial Invoice"
        title={inv.id}
        description={`${customer?.name} · linked to ${inv.salesOrderId}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={inv.status} />
            <Button variant="secondary" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
              Print
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pdfLoading}
              icon={
                pdfLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )
              }
              onClick={handleDownloadPdf}
            >
              {pdfLoading ? "Generating…" : "Download PDF"}
            </Button>
            <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-alert-600"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        }
      />
      </div>

      <div className="grid grid-cols-1 gap-5 print:block xl:grid-cols-[320px_1fr]">
        <div className="space-y-4 no-print">
          <Card>
            <CardHeader title="Summary" eyebrow="Invoice" />
            <KeyValue label="Issue date" value={formatDate(inv.issueDate)} />
            <KeyValue label="Shipment" value={isPartial ? "Partial, recalculated on shipped qty" : "Full quoted qty"} />
            <KeyValue label="Total due" value={formatMoney(total, inv.currency)} mono />
            <KeyValue label="Shipped weight" value={`${inv.shippedWeightKg.toFixed(1)} kg`} mono />
            <KeyValue
              label="Sales order"
              value={
                <Link to={`/orders/${inv.salesOrderId}`} className="text-manifest-600 hover:underline">
                  {inv.salesOrderId}
                </Link>
              }
            />
            <KeyValue label="Reference PI" value={inv.quotationId} />
          </Card>
        </div>
        <InvoiceDocumentPreview inv={inv} customer={customer} />
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${inv.id}`}
        subtitle="Adjust shipped quantities for a partial shipment, or correct the charges and shipping references."
        width="max-w-3xl"
        footer={
          <Button variant="primary" size="sm" onClick={() => setEditing(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-paper-400">
              Shipped quantity per line
            </p>
            <div className="overflow-hidden rounded-lg border border-paper-200">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-paper-50 text-left font-mono text-[10px] uppercase tracking-wide text-paper-500">
                    <th className="px-2 py-1.5">Code</th>
                    <th className="px-2 py-1.5">Description</th>
                    <th className="w-20 px-2 py-1.5 text-right">Quoted</th>
                    <th className="w-28 px-2 py-1.5 text-right">Shipped</th>
                    <th className="w-28 px-2 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((li) => {
                    const shipped = li.shippedQtyPcs ?? li.qtyPcs;
                    return (
                      <tr key={li.id} className="border-t border-paper-100">
                        <td className="px-2 py-1.5 font-mono text-pine-800">{li.itemCode}</td>
                        <td className="px-2 py-1.5 text-paper-600">{li.description}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-paper-400">{li.qtyPcs}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            {...NON_NEGATIVE_INT}
                            value={shipped}
                            onChange={(e) => {
                              const qty = toNonNegative(e.target.value);
                              updateInvoice(inv.id, {
                                items: inv.items.map((x) =>
                                  x.id === li.id
                                    ? { ...x, shippedQtyPcs: qty, totalPrice: x.unitPrice * qty }
                                    : x
                                ),
                              });
                            }}
                            className={miniClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold text-pine-800">
                          {formatMoney(li.totalPrice, inv.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={formLabel}>Freight</label>
              <input
                {...NON_NEGATIVE}
                value={inv.freight}
                onChange={(e) => updateInvoice(inv.id, { freight: toNonNegative(e.target.value) })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Discount</label>
              <div className="flex gap-2">
                <input
                  {...NON_NEGATIVE}
                  value={inv.discount}
                  onChange={(e) =>
                    updateInvoice(inv.id, {
                      discount:
                        inv.discountMode === "percent" ? toPercent(e.target.value) : toNonNegative(e.target.value),
                    })
                  }
                  className={formClass}
                />
                <select
                  value={inv.discountMode ?? "amount"}
                  onChange={(e) => {
                    const mode = e.target.value as DiscountMode;
                    updateInvoice(inv.id, {
                      discountMode: mode,
                      discount: mode === "percent" ? Math.min(100, inv.discount) : inv.discount,
                    });
                  }}
                  className="w-24 shrink-0 rounded-lg border border-paper-200 bg-white px-2 py-2 text-sm"
                >
                  <option value="amount">{inv.currency}</option>
                  <option value="percent">%</option>
                </select>
              </div>
              {inv.discountMode === "percent" && inv.discount > 0 && (
                <p className="mt-1 text-[11px] text-paper-500">
                  {inv.discount}% is <span className="font-mono">{formatMoney(discountValue, inv.currency)}</span>
                </p>
              )}
            </div>
            <div>
              <label className={formLabel}>Tax</label>
              <input
                {...NON_NEGATIVE}
                value={inv.tax}
                onChange={(e) => updateInvoice(inv.id, { tax: toNonNegative(e.target.value) })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Shipped weight (kg)</label>
              <input
                {...NON_NEGATIVE}
                value={inv.shippedWeightKg}
                onChange={(e) => updateInvoice(inv.id, { shippedWeightKg: toNonNegative(e.target.value) })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Bill of lading no.</label>
              <input
                value={inv.billOfLadingNo ?? ""}
                onChange={(e) => updateInvoice(inv.id, { billOfLadingNo: e.target.value })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Container no.</label>
              <input
                value={inv.containerNo ?? ""}
                onChange={(e) => updateInvoice(inv.id, { containerNo: e.target.value })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Issue date</label>
              <input
                type="date"
                value={inv.issueDate}
                onChange={(e) => updateInvoice(inv.id, { issueDate: e.target.value })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Status</label>
              <select
                value={inv.status}
                onChange={(e) => updateInvoice(inv.id, { status: e.target.value as InvoiceStatus })}
                className={formClass}
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-paper-500">
                Total due{" "}
                <span className="font-mono font-semibold text-pine-800">{formatMoney(total, inv.currency)}</span>
              </p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${inv.id}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                removeInvoice(inv.id);
                pushToast({ tone: "info", title: "Invoice deleted", description: inv.id });
                navigate(`/orders/${inv.salesOrderId}`);
              }}
            >
              Delete invoice
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          {inv.salesOrderId} will no longer link to a commercial invoice, and you'll be able to generate a fresh one.
        </p>
      </Modal>
    </div>
  );
}
