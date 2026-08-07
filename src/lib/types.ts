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
  // How this table's row values are interpreted. MD/DW tables hold currency amounts added to the
  // running price; the insurance table holds a percentage of it (0.66 means 0.66%, per the system
  // simulation doc §7: `ADD INSURANCE : P -> P + P x 0.0066`). Without this the engine treated
  // 0.66 as $0.66 — roughly 8.6x the intended step on an 11.60 base.
  valueKind: "amount" | "percent";
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

// ---------- Batch tree (see lib/batches.ts for factories and flattening) ----------
// Re-exported here so `Quotation` can reference QuotationBatch without a circular import:
// batches.ts imports QuotationLineItem/LinePricing from this module.

// The reference system also offered a NOTE group, but the quotation header already carries a
// Remarks field that prints on the PI, so a second free-text mechanism was two ways to do one job.
// Remarks is the single place narrative text belongs.
export type BatchType = "assembled" | "normal" | "lacing";

/** The priced unit. One row per specification code picked from the master. */
export interface SpecLine {
  id: string;
  specCode: string;
  /** Composed dimension label, e.g. `NO.120(210/22x16) 3-1/2"STR 122MD x 70FL(1656ML)`. */
  description: string;
  meshDepth: string;
  length: string;
  weightPerPc: number; // readonly, from the master row
  givenPriceKg: number;
  qtyPcs: number;
  pricing: LinePricing;
  /**
   * Unit price. Entered by hand: the rule engine is available as a helper but is not applied
   * unless someone asks for it, so this is the authoritative figure either way.
   */
  unitPrice: number;
  /** True once U/P has been typed directly, which stops a recompute overwriting it. */
  manualUnitPrice?: boolean;
  amount: number; // U/P x qty
  weightKg: number; // weightPerPc x qty
}

/** One Item Selection result: a composed specification string plus the spec rows priced under it. */
export interface BatchItem {
  id: string;
  specification: string;
  /** Retained so Add Specification can filter the master and the spec stays re-editable. */
  material: string;
  netType: string;
  weightUom: string;
  qtyUom: string;
  specs: SpecLine[];
}

export interface LacingLine {
  id: string;
  code: string;
  description: string;
  kind: "twine" | "charge";
  kgs: number; // 0 for a flat charge
  rate: number; // per-kg for twine; the flat amount for a charge
  amount: number;
}

export interface QuotationBatch {
  id: string;
  type: BatchType;
  title?: string; // assembled only
  items?: BatchItem[]; // assembled | normal
  lacing?: LacingLine[]; // lacing only
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
  // Provenance within the batch tree, set by flattenBatches(). Lets the PI document regroup a flat
  // line list back into its authored batches without duplicating the tree in the document layer.
  batchId?: string;
  itemId?: string;
}

/** The parts of a quotation a revision captures, so an earlier revision can be restored. */
export interface QuotationSnapshot {
  batches?: QuotationBatch[];
  items: QuotationLineItem[];
  paymentTerms: string;
  shipmentTerms?: string;
  incoterms?: string;
  leadTimeDate?: string;
  validityDate?: string;
  depositPercent: number;
  remarks: string;
  consignee: string;
  attentionContact?: string;
  currency: Currency;
}

export interface QuotationRevision {
  /** Revisions are numbered from 1: the first issue is Revision 1, not Revision 0. */
  revisionNo: number;
  date: string;
  changedBy: string;
  note: string;
  /** Content as it stood when this revision was created. Absent on older records. */
  snapshot?: QuotationSnapshot;
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
  // Cover-letter fields from the reference quotation header (simulation doc §2 step 1 / §3.1).
  // Shipment is written as a phrase ("30 days from receipt of deposit"), not a date — see
  // SHIPMENT_TERM_OPTIONS in mockData. Falls back to the computed estimatedShipmentDate when unset.
  shipmentTerms?: string;
  /** FOB or CIF. Replaced the free-text salutation line on the quotation header. */
  incoterms?: string;
  /**
   * Lead time and validity are entered as dates rather than durations. The legacy numeric
   * `leadTimeWeeks` / `validityDays` remain for quotations authored before the change, and are
   * used only when the corresponding date is absent.
   */
  leadTimeDate?: string;
  validityDate?: string;
  /** @deprecated Removed from the quotation form. Optional so new quotations can omit it. */
  moq?: string;
  leadTimeWeeks: number;
  estimatedShipmentDate: string;
  // The authored batch tree (ASSEMBLED / NORMAL / LACING). `items` below is its flattened
  // projection, produced by flattenBatches() on save — every downstream consumer (sales orders,
  // commercial invoices, reports) keeps reading `items` and needs no knowledge of batches.
  // Absent on seeded quotations authored before the batch model existed.
  batches?: QuotationBatch[];
  items: QuotationLineItem[];
  freight: number;
  discount: number;
  /**
   * How `discount` is read. "amount" subtracts it as money; "percent" subtracts that percentage
   * of the items total. Absent on older records, which were always amounts.
   */
  discountMode?: "amount" | "percent";
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

// ---------- Customer Inquiry ----------
// The front of the pipeline. An inquiry is a request that has arrived, usually by email; it is NOT
// a commitment that a quotation will follow. Some are declined, some are lost, and some arrive with
// the customer's own parts, prices and PO already settled, in which case they go straight to a
// sales order without a proforma ever being issued.

export type InquirySource = "email" | "phone" | "walk_in" | "agent";

export type InquiryStatus =
  | "new" // received, nothing done yet
  | "forwarded_to_plant" // sent to the factory for feasibility and costing
  | "assessment_received" // the plant has replied; a technical assessment exists
  | "quoted" // a quotation was raised from it
  | "direct_order" // no quotation needed; customer's own PO became a sales order
  | "no_quote" // deliberately not quoted (out of scope, capacity, etc.)
  | "lost"; // quoted or considered, but the customer went elsewhere

export interface InquiryAttachment {
  id: string;
  name: string;
  /** Where it came from, e.g. "Customer email" or "Plant reply". */
  origin: string;
  uploadedBy: string;
  date: string;
}

export interface CustomerInquiry {
  id: string;
  customerId: string;
  receivedDate: string;
  source: InquirySource;
  /** Subject line if it arrived by email, otherwise a short title. */
  subject: string;
  /** What the customer actually asked for, in their words. */
  requirement: string;
  status: InquiryStatus;
  assignedTo: string;
  /** Set when forwarded to the plant, so the wait can be measured. */
  forwardedDate?: string;
  /** Why an inquiry was closed without a quotation. Required for no_quote and lost. */
  closeReason?: string;
  attachments: InquiryAttachment[];
  /** Downstream links. All optional: an inquiry may end at any point. */
  assessmentId?: string;
  quotationId?: string;
  salesOrderId?: string;
}

// ---------- Mail (mock) ----------
// A stand-in for the proposed Gmail connector. Nothing here touches a real mailbox: these are
// local fixtures that let the intended flow be demonstrated end to end, namely customer inquiry
// arrives -> forwarded to the plant -> plant replies -> reply becomes a technical assessment.
// Swapping this for a real inbox is a matter of replacing the seed and the send action.

export type MailFolder = "inbox" | "sent" | "plant_reply";

export interface MailMessage {
  id: string;
  folder: MailFolder;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
  /** Set once this message has been turned into an inquiry or an assessment. */
  linkedInquiryId?: string;
  linkedAssessmentId?: string;
  /** Guessed from the sender's address, so an inquiry can be raised with one click. */
  suggestedCustomerId?: string;
  attachmentNames: string[];
}

// ---------- Technical Assessment ----------
// The plant's reply to an inquiry. Its whole purpose is to answer "can we make this, and what does
// it cost", and the answer arrives as draft lines with factory costs. Those lines pre-fill the
// quotation, so the quote starts from the plant's real figures rather than a blank form.

export type AssessmentVerdict = "feasible" | "feasible_with_changes" | "not_feasible" | "pending";

/** One line of the plant's costing, ready to become a quotation line. */
export interface AssessmentLine {
  id: string;
  /** Matches a SPEC_MASTER code when the plant recognised the spec; free text otherwise. */
  specCode?: string;
  description: string;
  /** Composed specification sentence, as the quotation would carry it. */
  specification: string;
  material: string;
  netType: string;
  weightPerPc: number;
  qtyPcs: number;
  /** The plant's cost per kg. This becomes the quotation's USD/WT starting figure. */
  costPerKg: number;
  /** Plant's note on this line, e.g. a substitution or a caveat. */
  note?: string;
}

export interface TechnicalAssessment {
  id: string;
  inquiryId: string;
  customerId: string;
  requestedDate: string;
  respondedDate?: string;
  verdict: AssessmentVerdict;
  assessedBy: string;
  /** The plant's overall reply, in their words. */
  plantRemarks: string;
  leadTimeNote?: string;
  lines: AssessmentLine[];
  /** Set once a quotation has been generated from this assessment. */
  quotationId?: string;
}

// ---------- Sales Order lifecycle ----------

export type OrderStage =
  | "quotation"
  | "customer_confirmation"
  | "deposit"
  | "production"
  | "packing"
  | "inspection"
  | "shipment"
  | "final_payment"
  | "documents"
  | "completed";

// Final payment sits BEFORE inspection: the balance is collected once packing is done, and
// inspection then releases the goods. Nothing ships until it is both paid for and inspected.
export const ORDER_STAGES: { id: OrderStage; label: string; role: string }[] = [
  { id: "quotation", label: "Quotation", role: "Sales" },
  { id: "customer_confirmation", label: "Customer Confirmation", role: "Sales" },
  { id: "deposit", label: "Deposit", role: "Finance" },
  { id: "production", label: "Production", role: "Production" },
  { id: "packing", label: "Packing", role: "Logistics" },
  { id: "final_payment", label: "Final Payment", role: "Finance" },
  { id: "inspection", label: "Inspection", role: "QC" },
  { id: "shipment", label: "Shipment", role: "Logistics" },
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
  /**
   * Optional. Most orders come from a quotation, but a customer who sends their own PO with parts
   * and prices already agreed produces an order with no proforma behind it.
   */
  quotationId?: string;
  /** Set when the order came straight from an inquiry rather than through a quotation. */
  inquiryId?: string;
  /** The customer's own PO reference, when they raised one. */
  customerPoNo?: string;
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

// ---------- Operations: production -> packing -> inspection -> shipment ----------
//
// Each of these hangs off a sales order and each one advances that order's stage when it completes.
// They also feed each other: production's completed quantity is what packing may pack, packing's
// actual weights are what the commercial invoice and bill of lading carry, inspection decides
// whether packed cartons may ship, and the shipment stamps its B/L and container onto the invoice.

export interface ProductionRun {
  id: string;
  salesOrderId: string;
  /** Mirrors the order's line so shortfalls are attributable, not just a single order-level number. */
  itemCode: string;
  description: string;
  qtyOrdered: number;
  qtyCompleted: number;
  qtyRejected: number;
  startedDate?: string;
  completedDate?: string;
  /** Free text: machine, shift, operator, whatever the floor records. */
  note?: string;
}

export type CartonStatus = "packed" | "held" | "shipped";

export interface PackingCarton {
  id: string;
  /** Carton or bale number as marked on the goods. */
  markNo: string;
  itemCode: string;
  qtyPcs: number;
  netWeightKg: number;
  grossWeightKg: number;
  status: CartonStatus;
}

export interface PackingList {
  id: string;
  salesOrderId: string;
  createdDate: string;
  packedBy: string;
  cartons: PackingCarton[];
  /** Set once the list is closed; no further cartons may be added. */
  finalizedDate?: string;
  remarks?: string;
}

export type InspectionResult = "pass" | "fail" | "pending";

export interface InspectionRecord {
  id: string;
  salesOrderId: string;
  packingListId?: string;
  inspectedDate?: string;
  inspector: string;
  result: InspectionResult;
  /** Cartons checked against cartons packed. */
  cartonsChecked: number;
  defectsFound: number;
  remarks: string;
}

export type ShipmentStatus = "booked" | "loaded" | "departed" | "arrived";

export interface Shipment {
  id: string;
  salesOrderId: string;
  status: ShipmentStatus;
  vessel: string;
  containerNo: string;
  billOfLadingNo: string;
  portOfLoading: string;
  portOfDischarge: string;
  etd?: string;
  eta?: string;
  bookedDate: string;
  /** Total gross weight actually loaded, taken from the packing list. */
  grossWeightKg: number;
  remarks?: string;
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
  discountMode?: "amount" | "percent";
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
