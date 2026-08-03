import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Printer, FileDown, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InvoiceDocumentPreview } from "@/components/domain/InvoiceDocumentPreview";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { downloadElementAsPdf } from "@/lib/pdf";

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, customers, pushToast } = useStore();
  const inv = invoices.find((i) => i.id === id);
  const customer = inv ? customers.find((c) => c.id === inv.customerId) : undefined;
  const [pdfLoading, setPdfLoading] = useState(false);

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

  const total = inv.items.reduce((s, li) => s + li.totalPrice, 0) + inv.freight - inv.discount + inv.tax;
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
          </div>
        }
      />
      </div>

      <div className="grid grid-cols-1 gap-5 print:block xl:grid-cols-[320px_1fr]">
        <div className="space-y-4 no-print">
          <Card>
            <CardHeader title="Summary" eyebrow="Invoice" />
            <KeyValue label="Issue date" value={formatDate(inv.issueDate)} />
            <KeyValue label="Shipment" value={isPartial ? "Partial — recalculated on shipped qty" : "Full quoted qty"} />
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
    </div>
  );
}
