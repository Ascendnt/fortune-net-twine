import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Printer, FileDown } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InvoiceDocumentPreview } from "@/components/domain/InvoiceDocumentPreview";
import { useStore } from "@/lib/store";
import { CUSTOMERS } from "@/lib/mockData";
import { formatDate, formatMoney } from "@/lib/format";

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, pushToast } = useStore();
  const inv = invoices.find((i) => i.id === id);
  const customer = inv ? CUSTOMERS.find((c) => c.id === inv.customerId) : undefined;

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

  return (
    <div>
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
              icon={<FileDown className="h-3.5 w-3.5" />}
              onClick={() => pushToast({ tone: "info", title: "PDF export simulated" })}
            >
              Export PDF
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4 no-print">
          <Card>
            <CardHeader title="Summary" eyebrow="Invoice" />
            <KeyValue label="Issue date" value={formatDate(inv.issueDate)} />
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
