import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { QuotationsList } from "@/pages/quotations/QuotationsList";
import { QuotationDetail } from "@/pages/quotations/QuotationDetail";
import { NewQuotation } from "@/pages/quotations/NewQuotation";
import { OrdersList } from "@/pages/orders/OrdersList";
import { OrderDetail } from "@/pages/orders/OrderDetail";
import { PaymentsPage } from "@/pages/payments/PaymentsPage";
import { InvoiceDetail } from "@/pages/invoices/InvoiceDetail";
import { CustomersList } from "@/pages/customers/CustomersList";
import { DocumentCenter } from "@/pages/documents/DocumentCenter";
import { ApprovalsInbox } from "@/pages/approvals/ApprovalsInbox";
import { ActivityLog } from "@/pages/activity/ActivityLog";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { PhasePlaceholder } from "@/pages/PhasePlaceholder";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/quotations" element={<QuotationsList />} />
          <Route path="/quotations/new" element={<NewQuotation />} />
          <Route path="/quotations/:id" element={<QuotationDetail />} />

          <Route path="/orders" element={<OrdersList />} />
          <Route path="/orders/:id" element={<OrderDetail />} />

          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />

          <Route path="/customers" element={<CustomersList />} />
          <Route path="/documents" element={<DocumentCenter />} />
          <Route path="/approvals" element={<ApprovalsInbox />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route
            path="/inquiries"
            element={
              <PhasePlaceholder
                title="Customer Inquiries"
                note="Inquiry intake and technical-feasibility triage are scoped for the Next horizon (Q4 2026), once discovery confirms the intake form fields and factory routing rules."
              />
            }
          />
          <Route
            path="/technical"
            element={
              <PhasePlaceholder
                title="Technical Assessments"
                note="The Factory Technical Team's comparison workspace ships alongside Customer Inquiries in the Next horizon."
              />
            }
          />
          <Route
            path="/production"
            element={
              <PhasePlaceholder
                title="Production"
                note="Production scheduling and monitoring is sequenced for a later horizon, once the Sales module foundation is live."
              />
            }
          />
          <Route
            path="/packing"
            element={
              <PhasePlaceholder
                title="Packing & Inspection"
                note="Tentative packing lists and inspection reports are sequenced for a later horizon."
              />
            }
          />
          <Route
            path="/shipments"
            element={
              <PhasePlaceholder
                title="Shipments"
                note="Full shipment booking and tracking is sequenced for a later horizon — this prototype demonstrates the payment-linked loading control on the Sales Order page instead."
              />
            }
          />

          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
