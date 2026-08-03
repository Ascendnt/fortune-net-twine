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

// A customer may have several named contacts (buyer, accounts, logistics, etc.) — the export
// client master shows real accounts with 2-3 people on file. `contactPerson` on Customer stays as
// the primary/default; `contacts` holds the full addressable list a quotation can pick "Attn:" from.
export interface Contact {
  id: string;
  name: string;
  title?: string; // e.g. "Director", "Purchasing"
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

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
  // Which legal entity issues this customer's documents — the export client list shows PI/CI
  // headers actually alternate between two entities per account, not a single fixed company name.
  letterhead?: "NETTEX MFG. AND EXPORT CORP." | "FORTUNE NET & TWINE MFG. CORP.";
  // Who books/represents this account (e.g. "HOUSE ACCOUNT" vs a regional agent like "INSUPES").
  agent?: string;
  // Full contact list for this account. When absent, contactPerson is the only known contact.
  contacts?: Contact[];
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
  unitPrice: number; // last quoted / reference sell price — historical PIs keep using this as-is
  unitWeightKg: number;
  // ---- Pricing engine inputs (Part A/C of the discovery doc: rules read this as their P0/base) ----
  givenPriceKg: number; // "Given Price" per kg — base value the pricing rule chain starts from
  defaultLaborHours: number;
  defaultLaborRate: number;
  defaultWastageKg: number;
  defaultTwineKg: number;
  defaultTwineRate: number;
}

// ---------- Pricing rule engine ----------
// Rules are data, not hardcoded types (Part C recommendation #1) — each rule declares its own
// "basis" explicitly instead of leaving of-base vs of-result implied by a label, which is what
// made COMMISSION and PERCENTAGE easy to confuse in the original build.

export type PricingRuleOperation = "add" | "subtract";
export type PricingRuleBasis = "percent_of_base" | "percent_of_result" | "flat_amount" | "lookup_table";

export interface PricingRule {
  id: string;
  code: string;
  label: string;
  operation: PricingRuleOperation;
  basis: PricingRuleBasis;
  rate: number; // used when basis is percent_of_base / percent_of_result / flat_amount
  lookupTableId?: string; // used when basis is lookup_table
  sequence: number; // chain order — each rule's output feeds the next rule's input
  enabled: boolean; // available to be applied to a line; disabling retires a rule without deleting history
}

export interface LookupTableRow {
  key: string;
  value: number;
}

export interface LookupTable {
  id: string;
  name: string;
  rows: LookupTableRow[];
}

export interface PricingChainStep {
  ruleId: string;
  code: string;
  label: string;
  before: number;
  after: number;
}

// Snapshot of how a line's unit price was built — kept alongside the line so margin can be
// reviewed later without recomputing, and so the customer-facing PI/CI never needs to show it.
export interface LinePricing {
  givenPriceKg: number;
  appliedRuleIds: string[];
  laborHours: number;
  laborRate: number;
  wastageKg: number;
  twineKg: number;
  twineRate: number;
  chain: PricingChainStep[];
  newPriceKg: number;
  pricePerPiece: number;
  laborCost: number;
  wastageCost: number;
  twineCost: number;
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
  // Present when the line was built through the pricing rule engine (Step 2 onward in NewQuotation).
  // Older/seed lines have no pricing snapshot and keep using unitPrice/totalPrice as authored.
  pricing?: LinePricing;
  // Set once a Commercial Invoice is generated against actual shipped quantity, which may differ
  // from the quoted qtyPcs on partial shipments (Part B, field mapping: Qty -> Shipped Qty).
  shippedQtyPcs?: number;
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
  // Which of the customer's contacts this PI is addressed to ("Attn:"). Falls back to the
  // customer's primary contactPerson when unset (older/seed quotations).
  attentionContact?: string;
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
