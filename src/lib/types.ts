// Domain types for the Fortune Net & Twine Export Sales ERP — Quotation to Invoice module.
// Modeled on the client SOP (FNT & NMEC) and the Export Sales ERP System Framework.

export type Role =
  | "sales_rep"
  | "sales_manager"
  | "factory_technical"
  | "finance"
  | "logistics"
  | "management"
  | "admin";

export interface RoleInfo {
  id: Role;
  label: string;
  department: string;
  description: string;
}

export type Currency = "USD" | "KRW" | "EUR";

// ---------- Master data ----------

export interface Customer {
  id: string;
  name: string;
  consignee: string;
  country: string;
  address: string;
  contactPerson: string;
  email: string;
  phone: string;
  defaultPaymentTerms: string;
  defaultCurrency: Currency;
  totalOrders: number;
  totalValueUSD: number;
  outstandingBalanceUSD: number;
  since: string; // ISO date
}

export interface ItemMaster {
  code: string;
  description: string;
  material: string;
  plySize: string;
  meshSize: string;
  meshDepth: string;
  color: string;
  uom: "PCS" | "KGS";
  unitPrice: number;
  unitWeightKg: number;
}

// ---------- Quotation / Proforma Invoice ----------

export type QuotationStatus =
  | "draft"
  | "for_approval"
  | "approved"
  | "sent"
  | "under_negotiation"
  | "accepted"
  | "rejected"
  | "expired"
  | "revised";

export interface QuotationLineItem {
  id: string;
  itemCode: string;
  description: string;
  specification: string;
  qtyPcs: number;
  unit: string;
  unitPrice: number;
  weightKg: number;
  totalPrice: number;
}

export interface QuotationRevision {
  revisionNo: number;
  date: string;
  changedBy: string;
  note: string;
}

export interface Quotation {
  id: string; // PI number, e.g. PI-33012
  revisionNo: number;
  revisions: QuotationRevision[];
  customerId: string;
  consignee: string;
  status: QuotationStatus;
  currency: Currency;
  validityDays: number;
  issueDate: string;
  paymentTerms: string;
  moq: string;
  leadTimeWeeks: number;
  estimatedShipmentDate: string;
  items: QuotationLineItem[];
  freight: number;
  discount: number;
  tax: number;
  depositPercent: number;
  assignedSalesperson: string;
  linkedInquiryId?: string;
  linkedTechAssessmentId?: string;
  salesOrderId?: string;
  remarks: string;
  approver?: string;
  approvedDate?: string;
  customerResponseNote?: string;
}

// ---------- Sales Order lifecycle ----------

export type OrderStage =
  | "quotation"
  | "customer_confirmation"
  | "internal_verification"
  | "deposit"
  | "production"
  | "packing"
  | "inspection"
  | "shipment"
  | "final_payment"
  | "documents"
  | "completed";

export const ORDER_STAGES: { id: OrderStage; label: string; role: string }[] = [
  { id: "quotation", label: "Quotation", role: "Sales" },
  { id: "customer_confirmation", label: "Customer Confirmation", role: "Sales" },
  { id: "internal_verification", label: "Internal Verification", role: "Factory Technical" },
  { id: "deposit", label: "Deposit", role: "Finance" },
  { id: "production", label: "Production", role: "Production" },
  { id: "packing", label: "Packing", role: "Logistics" },
  { id: "inspection", label: "Inspection", role: "QC" },
  { id: "shipment", label: "Shipment", role: "Logistics" },
  { id: "final_payment", label: "Final Payment", role: "Finance" },
  { id: "documents", label: "Documents", role: "Sales" },
  { id: "completed", label: "Completed", role: "—" },
];

export type StageStatus = "completed" | "in_progress" | "blocked" | "pending";

export interface StageRecord {
  stage: OrderStage;
  status: StageStatus;
  completedDate?: string;
  responsibleRole: string;
  pendingAction?: string;
  blocker?: string;
}

export type OrderPriority = "standard" | "high" | "urgent";

export interface SalesOrder {
  id: string; // SO number
  quotationId: string;
  customerId: string;
  consignee: string;
  country: string;
  currency: Currency;
  orderValue: number;
  orderDate: string;
  requestedDeliveryDate: string;
  currentStage: OrderStage;
  priority: OrderPriority;
  assignedSalesperson: string;
  stages: StageRecord[];
  productionStatus:
    | "pending_scheduling"
    | "scheduled"
    | "materials_pending"
    | "in_production"
    | "partially_completed"
    | "completed"
    | "on_hold"
    | "not_started";
  productionQtyOrdered: number;
  productionQtyCompleted: number;
  productionQtyRejected: number;
  plannedCompletionDate?: string;
  actualCompletionDate?: string;
  delayReason?: string;
  invoiceId?: string;
}

// ---------- Payments ----------

export type PaymentType = "deposit" | "balance" | "adjustment";
export type PaymentStatus =
  | "expected"
  | "submitted_for_verification"
  | "partially_paid"
  | "verified"
  | "rejected"
  | "overdue";

export interface PaymentRecord {
  id: string;
  salesOrderId: string;
  type: PaymentType;
  expectedAmount: number;
  amountReceived: number;
  dateReceived?: string;
  bankRef?: string;
  method?: "Wire Transfer" | "Telegraphic Transfer" | "LC" | "Check" | "Cash";
  remittanceAttached?: boolean;
  verifiedBy?: string;
  verificationDate?: string;
  status: PaymentStatus;
  dueDate?: string;
  remarks?: string;
}

// ---------- Commercial Invoice ----------

export type InvoiceStatus = "draft" | "issued" | "sent" | "paid" | "overdue";

export interface CommercialInvoice {
  id: string; // CI number
  salesOrderId: string;
  quotationId: string;
  customerId: string;
  issueDate: string;
  currency: Currency;
  items: QuotationLineItem[];
  freight: number;
  discount: number;
  tax: number;
  status: InvoiceStatus;
  shippedWeightKg: number;
  billOfLadingNo?: string;
  containerNo?: string;
}

// ---------- Documents ----------

export type DocumentType =
  | "Requirements List"
  | "Net Plan"
  | "Technical Assessment"
  | "Proforma Invoice"
  | "Purchase Order"
  | "Sales Order"
  | "Packing List"
  | "Remittance Copy"
  | "Commercial Invoice"
  | "Customer Confirmation"
  | "Internal Approval";

export interface DocRecord {
  id: string;
  name: string;
  type: DocumentType;
  relatedOrderId?: string;
  version: number;
  uploadedBy: string;
  uploadDate: string;
  approvalStatus: "pending" | "approved" | "n/a";
  isCurrent: boolean;
}

// ---------- Approvals ----------

export type ApprovalType =
  | "Technical Assessment Approval"
  | "PI Approval"
  | "Discount Approval"
  | "Sales Order Verification"
  | "Payment Clearance"
  | "Loading Authorization"
  | "Final Document Release";

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  referenceId: string;
  customerId: string;
  requestedBy: string;
  requestedDate: string;
  dueDate: string;
  level: "L1 Supervisor" | "L2 Manager" | "L3 Management";
  status: "pending" | "approved" | "rejected" | "returned";
  reason: string;
}

// ---------- Activity log ----------

export interface ActivityEntry {
  id: string;
  timestamp: string;
  user: string;
  department: string;
  action: string;
  previousStatus?: string;
  newStatus?: string;
  recordType: string;
  recordId: string;
  comment?: string;
}

// ---------- Toast/notification ----------

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: "success" | "info" | "warning" | "danger";
}
