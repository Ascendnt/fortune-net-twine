import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { QuotationsList } from "@/pages/quotations/QuotationsList";
import { QuotationDetail } from "@/pages/quotations/QuotationDetail";
import { NewQuotation } from "@/pages/quotations/NewQuotation";
import { EditQuotation } from "@/pages/quotations/EditQuotation";
import { MasterDataPage } from "@/pages/masterdata/MasterDataPage";
import { InquiriesPage } from "@/pages/inquiries/InquiriesPage";
import { TechnicalAssessmentsPage } from "@/pages/technical/TechnicalAssessmentsPage";
import { OrdersList } from "@/pages/orders/OrdersList";
import { OrderDetail } from "@/pages/orders/OrderDetail";
import { PaymentsPage } from "@/pages/payments/PaymentsPage";
import { InvoiceDetail } from "@/pages/invoices/InvoiceDetail";
import { CustomersList } from "@/pages/customers/CustomersList";
import { ProductionPage } from "@/pages/production/ProductionPage";
import { PackingPage } from "@/pages/packing/PackingPage";
import { InspectionPage } from "@/pages/inspection/InspectionPage";
import { ShipmentsPage } from "@/pages/shipments/ShipmentsPage";
import { ApprovalsInbox } from "@/pages/approvals/ApprovalsInbox";
import { ActivityLog } from "@/pages/activity/ActivityLog";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/quotations" element={<QuotationsList />} />
          <Route path="/quotations/new" element={<NewQuotation />} />
          <Route path="/quotations/:id" element={<QuotationDetail />} />
          <Route path="/quotations/:id/edit" element={<EditQuotation />} />

          <Route path="/orders" element={<OrdersList />} />
          <Route path="/orders/:id" element={<OrderDetail />} />

          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />

          <Route path="/customers" element={<CustomersList />} />
          <Route path="/master-data" element={<MasterDataPage />} />
          <Route path="/approvals" element={<ApprovalsInbox />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/inquiries" element={<InquiriesPage />} />
          <Route path="/technical" element={<TechnicalAssessmentsPage />} />
          <Route path="/production" element={<ProductionPage />} />
          <Route path="/packing" element={<PackingPage />} />
          <Route path="/inspection" element={<InspectionPage />} />
          <Route path="/shipments" element={<ShipmentsPage />} />

          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
