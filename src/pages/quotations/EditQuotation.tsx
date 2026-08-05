import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { QuotationBuilder } from "./QuotationBuilder";

export function EditQuotation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { quotations } = useStore();
  const quotation = quotations.find((q) => q.id === id);

  if (!quotation) {
    return (
      <div>
        <PageHeader title="Quotation not found" breadcrumb={["Fortune Net & Twine ERP", "Quotations"]} />
        <Button variant="secondary" onClick={() => navigate("/quotations")}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to Quotations
        </Button>
      </div>
    );
  }

  // Remounting on id change keeps the builder's initial state honest — it reads `existing` once.
  return <QuotationBuilder key={quotation.id} existing={quotation} />;
}
