import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  Role,
  Quotation,
  SalesOrder,
  PaymentRecord,
  CommercialInvoice,
  ApprovalRequest,
  ActivityEntry,
  ToastMessage,
  QuotationStatus,
  PricingRule,
  LookupTable,
  Customer,
  Contact,
  QuotationSnapshot,
  QuotationRevision,
  CustomerInquiry,
  InquiryStatus,
  TechnicalAssessment,
  MailMessage,
  OrderStage,
  StageRecord,
  ProductionRun,
  PackingList,
  InspectionRecord,
  Shipment,
} from "./types";
import { ORDER_STAGES, isLiveStage } from "./types";
import { INQUIRIES, TECHNICAL_ASSESSMENTS, MAIL_MESSAGES } from "./inquiryData";
import { PRODUCTION_RUNS, PACKING_LISTS, INSPECTIONS, SHIPMENTS } from "./operationsData";
import { emptyPricing, flattenBatches, newBatch, newBatchItem } from "./batches";
import { recomputeSpecLine, totalsForQuotation } from "./totals";
import type { BatchItem, QuotationBatch } from "./types";
import {
  QUOTATIONS,
  SALES_ORDERS,
  PAYMENTS,
  INVOICES,
  APPROVALS,
  ACTIVITY,
  PRICING_RULES,
  LOOKUP_TABLES,
  CUSTOMERS,
} from "./mockData";
import { USERS, findUser } from "./users";
import type { User } from "./users";
import { LACING_CATALOG, SPEC_MASTER } from "./specMaster";
import type { LacingCatalogRow, SpecMasterRow } from "./specMaster";
import { PERSIST_KEYS, clearPersisted, loadPersisted, persist } from "./persist";
import { revisionLabel } from "./format";
import { applyApproval, applyDecline, canVerifyPayment } from "./paymentApproval";
import { migratePackingList, sectionTotals } from "./packing";
import { stageReleasedBy } from "./paymentLedger";
import { buildInspectionLines, settleInspection } from "./inspectionPricing";
import type { PaymentApproval, PackingLine, ShipmentScope, OrderDocument } from "./types";

interface StoreState {
  /** Derived from the signed-in user. Falls back to the least privileged role when signed out. */
  role: Role;
  users: User[];
  signedInUser: User | undefined;
  signIn: (userId: string) => void;
  signOut: () => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  currentUser: string;

  // ---- Front of the pipeline ----
  inquiries: CustomerInquiry[];
  assessments: TechnicalAssessment[];
  mail: MailMessage[];
  addInquiry: (inquiry: Omit<CustomerInquiry, "id">) => string;
  updateInquiry: (id: string, patch: Partial<CustomerInquiry>) => void;
  removeInquiry: (id: string) => void;
  /** Sends the inquiry to the plant and opens a pending assessment against it. */
  forwardInquiryToPlant: (id: string, note: string) => string;
  updateAssessment: (id: string, patch: Partial<TechnicalAssessment>) => void;
  /** Turns the plant's costing into a draft quotation and links all three records together. */
  createQuotationFromAssessment: (assessmentId: string) => string;
  /** Closes an inquiry without quoting it. */
  closeInquiry: (id: string, status: Extract<InquiryStatus, "no_quote" | "lost">, reason: string) => void;
  /** Customer's own PO becomes a sales order with no proforma behind it. */
  createDirectSalesOrder: (inquiryId: string, args: { poNo: string; value: number; deliveryDate: string }) => string;
  markMailRead: (id: string) => void;
  createInquiryFromMail: (mailId: string) => string;

  // ---- Operations ----
  productionRuns: ProductionRun[];
  packingLists: PackingList[];
  inspections: InspectionRecord[];
  shipments: Shipment[];
  updateProductionRun: (id: string, patch: Partial<ProductionRun>) => void;
  addProductionRun: (run: Omit<ProductionRun, "id">) => string;
  removeProductionRun: (id: string) => void;
  /** Marks every run on an order finished and moves the order to Packing. */
  completeProduction: (salesOrderId: string) => void;
  createPackingList: (salesOrderId: string, scope?: ShipmentScope, lines?: Omit<PackingLine, "id">[]) => string;
  updatePackingList: (id: string, patch: Partial<PackingList>) => void;
  removePackingList: (id: string) => void;
  /** Files attached to sales orders. */
  orderDocuments: OrderDocument[];
  addOrderDocument: (doc: Omit<OrderDocument, "id" | "uploadedBy" | "uploadedDate">) => void;
  removeOrderDocument: (id: string) => void;
  addPackingSection: (listId: string, title: string) => void;
  updatePackingSection: (listId: string, sectionId: string, title: string) => void;
  removePackingSection: (listId: string, sectionId: string) => void;
  addPackingLine: (listId: string, sectionId: string, line: Omit<PackingLine, "id">) => void;
  updatePackingLine: (listId: string, sectionId: string, lineId: string, patch: Partial<PackingLine>) => void;
  removePackingLine: (listId: string, sectionId: string, lineId: string) => void;
  reopenPackingList: (id: string) => void;
  /** Closes the list, opens an inspection against it, and moves the order on. */
  finalizePackingList: (id: string) => void;
  updateInspection: (id: string, patch: Partial<InspectionRecord>) => void;
  /** Records the weight actually measured against one inspection line. */
  updateInspectionLine: (inspectionId: string, lineId: string, actualWeightKg: number) => void;
  /** Records the verdict. A pass releases the order to Shipment; a fail blocks it. */
  recordInspection: (id: string, result: "pass" | "fail", args: { cartonsChecked: number; defectsFound: number; remarks: string }) => void;
  createShipment: (salesOrderId: string) => string;
  updateShipment: (id: string, patch: Partial<Shipment>) => void;
  /** Departure stamps the B/L and container onto the commercial invoice. */
  departShipment: (id: string) => void;

  quotations: Quotation[];
  salesOrders: SalesOrder[];
  payments: PaymentRecord[];
  invoices: CommercialInvoice[];
  approvals: ApprovalRequest[];
  activity: ActivityEntry[];

  pricingRules: PricingRule[];
  lookupTables: LookupTable[];
  updatePricingRule: (id: string, patch: Partial<Pick<PricingRule, "enabled" | "rate">>) => void;
  updateLookupRow: (tableId: string, key: string, value: number) => void;

  // Specification master (the N-code catalog behind "Add Specification") and the lacing catalog.
  // Both live in the store rather than as static imports so "Create New Specs" can add a row that
  // is immediately visible everywhere and survives a refresh.
  specMaster: SpecMasterRow[];
  lacingCatalog: LacingCatalogRow[];
  /** How many times each specification code has been picked into a quotation. */
  specUsage: Record<string, number>;
  recordSpecUsage: (codes: string[]) => void;
  addSpecMasterRow: (row: SpecMasterRow) => void;
  updateSpecMasterRow: (code: string, patch: Partial<SpecMasterRow>) => void;
  removeSpecMasterRow: (code: string) => void;
  addLacingRow: (row: LacingCatalogRow) => void;
  updateLacingRow: (code: string, patch: Partial<LacingCatalogRow>) => void;
  removeLacingRow: (code: string) => void;

  // Rule and lookup maintenance. Editing a rate was already possible; adding and retiring whole
  // rules and lookup buckets is what makes the pricing engine genuinely self-service.
  addPricingRule: (rule: PricingRule) => void;
  removePricingRule: (id: string) => void;
  addLookupRowToTable: (tableId: string, key: string, value: number) => void;
  removeLookupRowFromTable: (tableId: string, key: string) => void;

  addCustomer: (customer: Omit<Customer, "id">) => string;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  removeCustomer: (id: string) => void;

  updateQuotation: (id: string, patch: Partial<Quotation>) => void;
  removeQuotation: (id: string) => void;
  /** Copies a quotation for the same customer as a fresh draft, and returns the new PI number. */
  duplicateQuotation: (id: string) => string;
  /** Restores a revision's captured content as a new current revision. Nothing is destroyed. */
  restoreRevision: (id: string, revisionNo: number) => void;
  updateRevisionNote: (id: string, revisionNo: number, note: string) => void;

  addPayment: (payment: Omit<PaymentRecord, "id">) => string;
  updatePayment: (id: string, patch: Partial<PaymentRecord>) => void;
  removePayment: (id: string) => void;
  approvePayment: (id: string, args: { actualApprover: string; overrideReason: string }) => void;
  declinePayment: (id: string, args: { actualApprover: string; reason: string }) => void;
  reopenPaymentApproval: (id: string) => void;

  updateInvoice: (id: string, patch: Partial<CommercialInvoice>) => void;
  removeInvoice: (id: string) => void;

  updateSalesOrder: (id: string, patch: Partial<SalesOrder>) => void;
  removeSalesOrder: (id: string) => void;

  /** Wipes persisted state and restores every slice to its seeded demo values. */
  resetDemoData: () => void;

  // Customer master data lives here (not a static import) so contacts — and, later, other
  // one-time-setup-but-still-editable fields — can be added/edited from the Customers page and
  // be reflected everywhere else in the app (New Quotation's Attn picker, PI/CI previews, etc.).
  customers: Customer[];
  addContact: (customerId: string, contact: Omit<Contact, "id">) => void;
  updateContact: (customerId: string, contactId: string, patch: Partial<Contact>) => void;
  removeContact: (customerId: string, contactId: string) => void;

  toasts: ToastMessage[];
  pushToast: (t: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;

  logActivity: (e: Omit<ActivityEntry, "id" | "timestamp" | "user" | "department">) => void;

  createQuotation: (q: Omit<Quotation, "id" | "revisionNo" | "revisions" | "status">) => string;
  updateQuotationStatus: (id: string, status: QuotationStatus, note?: string) => void;
  createRevision: (id: string, note: string) => void;
  /** Pushes the given quotation's figures onto the sales order raised from it. */
  syncSalesOrderFromQuotation: (quotation: Quotation) => void;
  convertToSalesOrder: (quotationId: string) => string;
  verifyPayment: (paymentId: string) => void;
  rejectPayment: (paymentId: string) => void;
  resolveApproval: (id: string, decision: "approved" | "rejected" | "returned") => void;
  /** shippedQty maps QuotationLineItem id -> actual shipped pcs; defaults to the quoted qty when omitted. */
  generateInvoice: (salesOrderId: string, shippedQty?: Record<string, number>) => string;
  advanceStage: (salesOrderId: string) => void;
}

const StoreContext = createContext<StoreState | null>(null);

const KNOWN_BATCH_TYPES = new Set(["assembled", "normal", "lacing"]);

/**
 * The source client master writes an em dash where a field was never recorded. Carried into the app
 * verbatim, that dash reads as a real value: it pre-fills a quotation's payment terms and then
 * prints "—" on a customer-facing PI. Placeholder dashes are normalised to empty on load, so the
 * field is visibly blank and the UI can say the terms aren't on file.
 */
const PLACEHOLDER = /^[—–-]$/;
function blankIfPlaceholder(value: string | undefined): string {
  return value && !PLACEHOLDER.test(value.trim()) ? value : "";
}

function normalizeCustomers(customers: Customer[]): Customer[] {
  return customers.map((c) => ({
    ...c,
    defaultPaymentTerms: blankIfPlaceholder(c.defaultPaymentTerms),
    phone: blankIfPlaceholder(c.phone),
    email: blankIfPlaceholder(c.email),
  }));
}

/**
 * Brings quotations saved by an earlier build forward. Right now that means dropping NOTE groups,
 * which no longer exist: a quotation saved before they were removed would otherwise render an
 * unlabelled empty band. They contributed to neither the grand total nor the total weight, so
 * removing them cannot change a figure.
 */
/**
 * A fresh stage list for a new sales order: everything before `current` completed, `current` in
 * progress, the rest pending. Built from ORDER_STAGES so the lifecycle is defined in exactly one
 * place.
 */
function freshStages(current: OrderStage, pendingAction?: string): StageRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  const currentIdx = ORDER_STAGES.findIndex((s) => s.id === current);
  return ORDER_STAGES.map((s, idx) => ({
    stage: s.id,
    status: idx < currentIdx ? "completed" : idx === currentIdx ? "in_progress" : "pending",
    completedDate: idx < currentIdx ? today : undefined,
    responsibleRole: s.role,
    pendingAction: idx === currentIdx ? pendingAction : undefined,
  }));
}

/** Captures the content a revision needs in order to be restored later. */
function snapshotOf(q: Quotation): QuotationSnapshot {
  return {
    batches: q.batches,
    items: q.items,
    paymentTerms: q.paymentTerms,
    shipmentTerms: q.shipmentTerms,
    incoterms: q.incoterms,
    leadTimeDate: q.leadTimeDate,
    validityDate: q.validityDate,
    depositPercent: q.depositPercent,
    remarks: q.remarks,
    consignee: q.consignee,
    attentionContact: q.attentionContact,
    currency: q.currency,
  };
}

/**
 * Next unused PI number. Now that a sales order derives its number from its quotation
 * (PI-33011 becomes SO-33011), a duplicate PI number would produce a duplicate SO number, so
 * numbers are checked against the existing set rather than trusting a counter.
 */
function nextPiNumber(existing: Quotation[]): string {
  const taken = new Set(existing.map((q) => q.id));
  let n = 33001;
  while (taken.has(`PI-${n}`)) n += 1;
  return `PI-${n}`;
}

/**
 * Re-captures the current revision's snapshot from the quotation's live content before the history
 * grows. A snapshot is taken when its revision is created, but the quotation keeps being edited
 * afterwards, so without this refresh those edits would never reach the history and restoring an
 * earlier revision would silently discard them.
 */
function refreshCurrentSnapshot(q: Quotation): QuotationRevision[] {
  return q.revisions.map((r) => (r.revisionNo === q.revisionNo ? { ...r, snapshot: snapshotOf(q) } : r));
}

/** Weight units are written singular now: KGS/LBS saved by an earlier build become KG/LB. */
const UNIT_FIX: Record<string, string> = { KGS: "KG", LBS: "LB" };
const singular = (u: string) => UNIT_FIX[u] ?? u;

/**
 * Brings sales orders onto the current lifecycle.
 *
 * Production, Internal Verification and Documents were removed as stages. An order sitting on one
 * of them would otherwise be stranded: `advanceStage` finds its index in ORDER_STAGES, and a stage
 * that is no longer there returns -1, so the button would silently do nothing. Each retired stage
 * therefore rolls forward to the next live one, and its stage record is dropped so the stepper does
 * not draw a step that cannot be reached.
 */
function migrateSalesOrders(orders: SalesOrder[]): SalesOrder[] {
  const today = new Date().toISOString().slice(0, 10);
  // Where an order sitting on a retired stage should land. Production and Internal Verification
  // both happen before anything is packed; Documents was the last step before completion.
  const FORWARD: Partial<Record<OrderStage, OrderStage>> = {
    production: "packing",
    internal_verification: "deposit",
    documents: "completed",
  };
  return orders.map((o) => {
    const stages = o.stages.filter((rec) => isLiveStage(rec.stage));
    const currentStage = isLiveStage(o.currentStage) ? o.currentStage : (FORWARD[o.currentStage] ?? "packing");
    if (stages.length === o.stages.length && currentStage === o.currentStage) return o;
    // Rebuilt rather than patched: after dropping steps, the completed/in-progress/pending pattern
    // has to line up with the new list or the stepper shows a finished step after a pending one.
    const currentIdx = ORDER_STAGES.findIndex((s) => s.id === currentStage);
    return {
      ...o,
      currentStage,
      stages: ORDER_STAGES.map((s, idx) => {
        const existing = stages.find((rec) => rec.stage === s.id);
        // A blocker is a fact about the order and is always kept. Everything else is derived from
        // where the order now sits: the old statuses were assigned against a different list, so
        // carrying them across would leave a completed step sitting after a pending one.
        const status =
          existing?.status === "blocked"
            ? "blocked"
            : idx < currentIdx
              ? "completed"
              : idx === currentIdx
                ? "in_progress"
                : "pending";
        return {
          stage: s.id,
          status,
          completedDate: status === "completed" ? (existing?.completedDate ?? today) : undefined,
          responsibleRole: s.role,
          pendingAction: idx === currentIdx ? existing?.pendingAction : undefined,
          blocker: existing?.blocker,
        };
      }),
    };
  });
}

function migrateQuotations(quotations: Quotation[]): Quotation[] {
  return quotations.map((q) => {
    // The first issue of a quotation is not a revision of anything, so it carries no number. R1 is
    // the second draft. An earlier build numbered the first issue as Revision 1, so any history
    // that starts at 1 is shifted back down by one.
    const oneBased = q.revisions.length > 0 && !q.revisions.some((r) => r.revisionNo === 0);
    const revisions = oneBased ? q.revisions.map((r) => ({ ...r, revisionNo: r.revisionNo - 1 })) : q.revisions;
    return {
    ...q,
    revisionNo: oneBased ? q.revisionNo - 1 : q.revisionNo,
    revisions,
    items: q.items.map((li) => (UNIT_FIX[li.unit] ? { ...li, unit: singular(li.unit) } : li)),
    batches: q.batches
      ?.filter((b) => KNOWN_BATCH_TYPES.has(b.type))
      .map((b) =>
        b.items
          ? { ...b, items: b.items.map((i) => ({ ...i, weightUom: singular(i.weightUom), qtyUom: singular(i.qtyUom) })) }
          : b
      ),
    };
  });
}

let idCounter = 1000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  /**
   * Who is signed in.
   *
   * Identity, not authentication: there is no server to prove anyone is who they say. What it does
   * buy is that approvals, overrides and the activity log name a real person rather than a role
   * label, which is the difference between an audit trail and a list of job titles.
   *
   * The choice persists, so a refresh does not dump someone back at the sign-in screen mid-task.
   */
  const [users, setUsers] = useState<User[]>(() => loadPersisted(PERSIST_KEYS.users, USERS));
  const [signedInUserId, setSignedInUserId] = useState<string | null>(() =>
    loadPersisted(PERSIST_KEYS.session, null as string | null)
  );
  // Slices that a user can meaningfully change are restored from localStorage; the rest stay as
  // seeded demo fixtures. See lib/persist.ts for the degradation rules.
  const [quotations, setQuotations] = useState<Quotation[]>(() =>
    migrateQuotations(loadPersisted(PERSIST_KEYS.quotations, QUOTATIONS))
  );
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(() =>
    migrateSalesOrders(loadPersisted(PERSIST_KEYS.salesOrders, SALES_ORDERS))
  );
  const [specUsage, setSpecUsage] = useState<Record<string, number>>(() =>
    loadPersisted(PERSIST_KEYS.specUsage, {} as Record<string, number>)
  );
  const [orderDocuments, setOrderDocuments] = useState<OrderDocument[]>(() =>
    loadPersisted(PERSIST_KEYS.orderDocuments, [] as OrderDocument[])
  );
  const [payments, setPayments] = useState<PaymentRecord[]>(() => loadPersisted(PERSIST_KEYS.payments, PAYMENTS));
  const [invoices, setInvoices] = useState<CommercialInvoice[]>(() =>
    loadPersisted(PERSIST_KEYS.invoices, INVOICES)
  );
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(() =>
    loadPersisted(PERSIST_KEYS.approvals, APPROVALS)
  );
  const [activity, setActivity] = useState<ActivityEntry[]>(() => loadPersisted(PERSIST_KEYS.activity, ACTIVITY));
  const [pricingRules, setPricingRules] = useState<PricingRule[]>(() =>
    loadPersisted(PERSIST_KEYS.pricingRules, PRICING_RULES)
  );
  const [lookupTables, setLookupTables] = useState<LookupTable[]>(() =>
    loadPersisted(PERSIST_KEYS.lookupTables, LOOKUP_TABLES)
  );
  const [specMaster, setSpecMaster] = useState<SpecMasterRow[]>(() =>
    loadPersisted(PERSIST_KEYS.specMaster, SPEC_MASTER)
  );
  const [lacingCatalog, setLacingCatalog] = useState<LacingCatalogRow[]>(() =>
    loadPersisted(PERSIST_KEYS.lacingCatalog, LACING_CATALOG)
  );
  const [customers, setCustomers] = useState<Customer[]>(() =>
    normalizeCustomers(loadPersisted(PERSIST_KEYS.customers, CUSTOMERS))
  );
  const [inquiries, setInquiries] = useState<CustomerInquiry[]>(() =>
    loadPersisted(PERSIST_KEYS.inquiries, INQUIRIES)
  );
  const [assessments, setAssessments] = useState<TechnicalAssessment[]>(() =>
    loadPersisted(PERSIST_KEYS.assessments, TECHNICAL_ASSESSMENTS)
  );
  const [mail, setMail] = useState<MailMessage[]>(() => loadPersisted(PERSIST_KEYS.mail, MAIL_MESSAGES));
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>(() =>
    loadPersisted(PERSIST_KEYS.production, PRODUCTION_RUNS)
  );
  const [packingLists, setPackingLists] = useState<PackingList[]>(() =>
    loadPersisted(PERSIST_KEYS.packing, PACKING_LISTS).map(migratePackingList)
  );
  const [inspections, setInspections] = useState<InspectionRecord[]>(() =>
    loadPersisted(PERSIST_KEYS.inspections, INSPECTIONS)
  );
  const [shipments, setShipments] = useState<Shipment[]>(() => loadPersisted(PERSIST_KEYS.shipments, SHIPMENTS));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => persist(PERSIST_KEYS.quotations, quotations), [quotations]);
  useEffect(() => persist(PERSIST_KEYS.salesOrders, salesOrders), [salesOrders]);
  useEffect(() => persist(PERSIST_KEYS.payments, payments), [payments]);
  useEffect(() => persist(PERSIST_KEYS.invoices, invoices), [invoices]);
  useEffect(() => persist(PERSIST_KEYS.approvals, approvals), [approvals]);
  useEffect(() => persist(PERSIST_KEYS.activity, activity), [activity]);
  useEffect(() => persist(PERSIST_KEYS.pricingRules, pricingRules), [pricingRules]);
  useEffect(() => persist(PERSIST_KEYS.lookupTables, lookupTables), [lookupTables]);
  useEffect(() => persist(PERSIST_KEYS.specMaster, specMaster), [specMaster]);
  useEffect(() => persist(PERSIST_KEYS.lacingCatalog, lacingCatalog), [lacingCatalog]);
  useEffect(() => persist(PERSIST_KEYS.customers, customers), [customers]);
  useEffect(() => persist(PERSIST_KEYS.inquiries, inquiries), [inquiries]);
  useEffect(() => persist(PERSIST_KEYS.assessments, assessments), [assessments]);
  useEffect(() => persist(PERSIST_KEYS.mail, mail), [mail]);
  useEffect(() => persist(PERSIST_KEYS.production, productionRuns), [productionRuns]);
  useEffect(() => persist(PERSIST_KEYS.packing, packingLists), [packingLists]);
  useEffect(() => persist(PERSIST_KEYS.inspections, inspections), [inspections]);
  useEffect(() => persist(PERSIST_KEYS.shipments, shipments), [shipments]);
  useEffect(() => persist(PERSIST_KEYS.specUsage, specUsage), [specUsage]);
  useEffect(() => persist(PERSIST_KEYS.orderDocuments, orderDocuments), [orderDocuments]);
  useEffect(() => persist(PERSIST_KEYS.users, users), [users]);
  useEffect(() => persist(PERSIST_KEYS.session, signedInUserId), [signedInUserId]);

  const addSpecMasterRow = useCallback((row: SpecMasterRow) => {
    setSpecMaster((prev) => (prev.some((r) => r.code === row.code) ? prev : [row, ...prev]));
  }, []);

  /**
   * Counts a specification as picked, so the picker can lead with the codes this office actually
   * quotes. A catalog of hundreds sorted by code buries the twenty that make up most of the work.
   */
  const recordSpecUsage = useCallback((codes: string[]) => {
    if (codes.length === 0) return;
    setSpecUsage((prev) => {
      const next = { ...prev };
      for (const code of codes) next[code] = (next[code] ?? 0) + 1;
      return next;
    });
  }, []);

  const updateSpecMasterRow = useCallback((code: string, patch: Partial<SpecMasterRow>) => {
    setSpecMaster((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  }, []);

  const removeSpecMasterRow = useCallback((code: string) => {
    setSpecMaster((prev) => prev.filter((r) => r.code !== code));
  }, []);

  const addLacingRow = useCallback((row: LacingCatalogRow) => {
    setLacingCatalog((prev) => (prev.some((r) => r.code === row.code) ? prev : [...prev, row]));
  }, []);

  const updateLacingRow = useCallback((code: string, patch: Partial<LacingCatalogRow>) => {
    setLacingCatalog((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  }, []);

  const removeLacingRow = useCallback((code: string) => {
    setLacingCatalog((prev) => prev.filter((r) => r.code !== code));
  }, []);

  const addPricingRule = useCallback((rule: PricingRule) => {
    setPricingRules((prev) => [...prev, rule]);
  }, []);

  const removePricingRule = useCallback((id: string) => {
    setPricingRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addLookupRowToTable = useCallback((tableId: string, key: string, value: number) => {
    setLookupTables((prev) =>
      prev.map((t) =>
        t.id !== tableId || t.rows.some((r) => r.key === key)
          ? t
          : // "default" stays last so it reads as the fallback it is.
            { ...t, rows: [...t.rows.filter((r) => r.key !== "default"), { key, value }, ...t.rows.filter((r) => r.key === "default")] }
      )
    );
  }, []);

  const removeLookupRowFromTable = useCallback((tableId: string, key: string) => {
    setLookupTables((prev) =>
      prev.map((t) => (t.id !== tableId ? t : { ...t, rows: t.rows.filter((r) => r.key !== key) }))
    );
  }, []);

  const addCustomer = useCallback((customer: Omit<Customer, "id">): string => {
    const id = nextId("CUS");
    setCustomers((prev) => [{ ...customer, id }, ...prev]);
    return id;
  }, []);

  const updateCustomer = useCallback((id: string, patch: Partial<Customer>) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeCustomer = useCallback((id: string) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateQuotation = useCallback((id: string, patch: Partial<Quotation>) => {
    setQuotations((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const removeQuotation = useCallback((id: string) => {
    setQuotations((prev) => prev.filter((q) => q.id !== id));
  }, []);

  // duplicateQuotation and restoreRevision need `currentUser` and `logActivity`, which are declared
  // further down. They live alongside createRevision for that reason — see below.

  const updateRevisionNote = useCallback((id: string, revisionNo: number, note: string) => {
    setQuotations((prev) =>
      prev.map((q) =>
        q.id !== id
          ? q
          : { ...q, revisions: q.revisions.map((r) => (r.revisionNo === revisionNo ? { ...r, note } : r)) }
      )
    );
  }, []);

  // The payment approval callbacks are NOT here. They read `currentUser` and `logActivity`, both
  // of which are declared further down, and a `const` referenced above its declaration is a
  // temporal-dead-zone crash at first render, not just a type error. They live immediately after
  // `logActivity` instead. See the block starting "Raises a payment line".

  const updatePayment = useCallback((id: string, patch: Partial<PaymentRecord>) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const removePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateInvoice = useCallback((id: string, patch: Partial<CommercialInvoice>) => {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const removeInvoice = useCallback((id: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    // Clear the back-reference so the sales order stops offering "view invoice" for a record that
    // no longer exists.
    setSalesOrders((prev) => prev.map((so) => (so.invoiceId === id ? { ...so, invoiceId: undefined } : so)));
  }, []);

  const updateSalesOrder = useCallback((id: string, patch: Partial<SalesOrder>) => {
    setSalesOrders((prev) => prev.map((so) => (so.id === id ? { ...so, ...patch } : so)));
  }, []);

  const removeSalesOrder = useCallback((id: string) => {
    setSalesOrders((prev) => prev.filter((so) => so.id !== id));
    setPayments((prev) => prev.filter((p) => p.salesOrderId !== id));
    setQuotations((prev) => prev.map((q) => (q.salesOrderId === id ? { ...q, salesOrderId: undefined } : q)));
  }, []);

  const resetDemoData = useCallback(() => {
    clearPersisted();
    setQuotations(QUOTATIONS);
    setSalesOrders(SALES_ORDERS);
    setPayments(PAYMENTS);
    setInvoices(INVOICES);
    setApprovals(APPROVALS);
    setActivity(ACTIVITY);
    setPricingRules(PRICING_RULES);
    setLookupTables(LOOKUP_TABLES);
    setSpecMaster(SPEC_MASTER);
    setLacingCatalog(LACING_CATALOG);
    setCustomers(CUSTOMERS);
    setInquiries(INQUIRIES);
    setAssessments(TECHNICAL_ASSESSMENTS);
    setMail(MAIL_MESSAGES);
    setProductionRuns(PRODUCTION_RUNS);
    setPackingLists(PACKING_LISTS);
    setInspections(INSPECTIONS);
    setShipments(SHIPMENTS);
  }, []);

  const addContact = useCallback((customerId: string, contact: Omit<Contact, "id">) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId) return c;
        const newContact: Contact = { ...contact, id: nextId("CT") };
        const existing = c.contacts ?? (c.contactPerson ? [{ id: nextId("CT"), name: c.contactPerson, isPrimary: true }] : []);
        return { ...c, contacts: [...existing, newContact] };
      })
    );
  }, []);

  const updateContact = useCallback((customerId: string, contactId: string, patch: Partial<Contact>) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId || !c.contacts) return c;
        const contacts = c.contacts.map((ct) => (ct.id === contactId ? { ...ct, ...patch } : ct));
        const primary = contacts.find((ct) => ct.isPrimary) ?? contacts[0];
        return { ...c, contacts, contactPerson: primary?.name ?? c.contactPerson };
      })
    );
  }, []);

  const removeContact = useCallback((customerId: string, contactId: string) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== customerId || !c.contacts) return c;
        const contacts = c.contacts.filter((ct) => ct.id !== contactId);
        const primary = contacts.find((ct) => ct.isPrimary) ?? contacts[0];
        return { ...c, contacts, contactPerson: primary?.name ?? c.contactPerson };
      })
    );
  }, []);

  const updatePricingRule = useCallback((id: string, patch: Partial<Pick<PricingRule, "enabled" | "rate">>) => {
    setPricingRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const updateLookupRow = useCallback((tableId: string, key: string, value: number) => {
    setLookupTables((prev) =>
      prev.map((t) => (t.id !== tableId ? t : { ...t, rows: t.rows.map((row) => (row.key === key ? { ...row, value } : row)) }))
    );
  }, []);

  // Both derived from the signed-in user, so there is one source of truth for who is acting.
  // Signed out, the role falls back to sales_rep — the least privileged — rather than admin, so a
  // broken session can never hand someone more authority than they had.
  const signedInUser = findUser(users, signedInUserId);
  const role: Role = signedInUser?.role ?? "sales_rep";
  const currentUser = signedInUser?.name ?? "Guest User";

  const signIn = useCallback((userId: string) => {
    setSignedInUserId(userId);
  }, []);

  const signOut = useCallback(() => {
    setSignedInUserId(null);
  }, []);

  const updateUser = useCallback((id: string, patch: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const pushToast = useCallback((t: Omit<ToastMessage, "id">) => {
    const id = nextId("TOAST");
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const logActivity = useCallback(
    (e: Omit<ActivityEntry, "id" | "timestamp" | "user" | "department">) => {
      const roleDept: Record<Role, string> = {
        sales_rep: "Sales",
        sales_manager: "Sales",
        factory_technical: "Technical",
        finance: "Finance",
        logistics: "Logistics",
        management: "Executive",
        admin: "Admin",
      };
      const entry: ActivityEntry = {
        ...e,
        id: nextId("ACT"),
        timestamp: new Date().toISOString(),
        user: currentUser,
        department: roleDept[role],
      };
      setActivity((prev) => [entry, ...prev]);
    },
    [currentUser, role]
  );

  // ---- Payment approval ----
  //
  // These sit here, directly after `logActivity`, because they read both it and `currentUser`.
  // Placing them with the other payment callbacks further up put them above those declarations,
  // which is a temporal-dead-zone crash on first render, not merely a compile error.

  /**
   * Raises a payment line. Whoever raises it is recorded as the author and the line enters the
   * approval queue; it cannot be verified until somebody in Management or Finance signs it off.
   *
   * A caller may pass its own `approval` block, in which case it is respected. The deposit and
   * balance milestones generated from an accepted quotation do exactly that, since those amounts
   * were already signed off as part of the quotation.
   */
  const addPayment = useCallback(
    (payment: Omit<PaymentRecord, "id">): string => {
      const id = nextId("PAY");
      const approval: PaymentApproval = payment.approval ?? {
        state: "pending_approval",
        author: currentUser,
        authoredDate: new Date().toISOString().slice(0, 10),
      };
      setPayments((prev) => [...prev, { ...payment, id, approval }]);
      logActivity({
        action: `Raised ${payment.type} payment for approval`,
        newStatus: "Pending approval",
        recordType: "Payment",
        recordId: id,
      });
      return id;
    },
    [currentUser, logActivity]
  );

  /**
   * Signs a payment off. `actualApprover` is normally the current user; it is passed in so the
   * override case, where somebody signs in place of the named approver, records who really did it.
   */
  const approvePayment = useCallback(
    (paymentId: string, args: { actualApprover: string; overrideReason: string }) => {
      const today = new Date().toISOString().slice(0, 10);
      const target = payments.find((p) => p.id === paymentId);
      const approval = target ? applyApproval(target.approval, { ...args, today }) : undefined;
      setPayments((prev) => prev.map((p) => (p.id === paymentId && approval ? { ...p, approval } : p)));
      logActivity({
        action:
          approval?.overrideReason && target
            ? `Approved ${target.type} payment in place of ${approval.intendedApprover}`
            : `Approved ${target?.type ?? ""} payment`.trim(),
        previousStatus: "Pending approval",
        newStatus: "Approved",
        recordType: "Payment",
        recordId: paymentId,
        comment: args.overrideReason || undefined,
      });
    },
    [payments, logActivity]
  );

  /** Declines a payment. The line stays on the order so the decline is visible, not erased. */
  const declinePayment = useCallback(
    (paymentId: string, args: { actualApprover: string; reason: string }) => {
      const today = new Date().toISOString().slice(0, 10);
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, approval: applyDecline(p.approval, { ...args, today }) } : p))
      );
      logActivity({
        action: "Declined payment",
        previousStatus: "Pending approval",
        newStatus: "Declined",
        recordType: "Payment",
        recordId: paymentId,
        comment: args.reason || undefined,
      });
    },
    [logActivity]
  );

  /**
   * Sends a declined line back for another look, rather than making the author delete it and start
   * again — which would lose the fact that it was ever declined.
   */
  const reopenPaymentApproval = useCallback(
    (paymentId: string) => {
      setPayments((prev) =>
        prev.map((p) =>
          p.id !== paymentId || !p.approval
            ? p
            : {
                ...p,
                approval: {
                  ...p.approval,
                  state: "pending_approval",
                  decidedDate: undefined,
                  declineReason: undefined,
                },
              }
        )
      );
      logActivity({
        action: "Reopened payment for approval",
        newStatus: "Pending approval",
        recordType: "Payment",
        recordId: paymentId,
      });
    },
    [logActivity]
  );

  // ---- Front of the pipeline: inquiry -> assessment -> quotation, or straight to an order ----

  const addInquiry = useCallback(
    (inquiry: Omit<CustomerInquiry, "id">): string => {
      const id = nextId("INQ");
      setInquiries((prev) => [{ ...inquiry, id }, ...prev]);
      logActivity({ action: "Customer inquiry logged", recordType: "Inquiry", recordId: id });
      return id;
    },
    [logActivity]
  );

  const updateInquiry = useCallback((id: string, patch: Partial<CustomerInquiry>) => {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const removeInquiry = useCallback((id: string) => {
    setInquiries((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const forwardInquiryToPlant = useCallback(
    (id: string, note: string): string => {
      const inquiry = inquiries.find((i) => i.id === id);
      if (!inquiry) return "";
      const today = new Date().toISOString().slice(0, 10);
      const assessmentId = nextId("TA");

      // Forwarding opens a pending assessment immediately, so the wait on the plant is visible as
      // a record rather than living in someone's sent folder.
      setAssessments((prev) => [
        {
          id: assessmentId,
          inquiryId: id,
          customerId: inquiry.customerId,
          requestedDate: today,
          verdict: "pending",
          assessedBy: "—",
          plantRemarks: "",
          lines: [],
        },
        ...prev,
      ]);
      setInquiries((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: "forwarded_to_plant", forwardedDate: today, assessmentId } : i
        )
      );
      // The mock mailbox gets the outgoing message so the flow reads end to end.
      setMail((prev) => [
        {
          id: nextId("M"),
          folder: "sent",
          from: "sales@fortunenet.com.ph",
          to: "planta@fortunenet.com.ph",
          subject: `FWD: ${inquiry.subject} — ${id}`,
          body: note || "Forwarding for feasibility and costing.",
          date: new Date().toISOString(),
          read: true,
          linkedInquiryId: id,
          attachmentNames: inquiry.attachments.map((a) => a.name),
        },
        ...prev,
      ]);
      logActivity({ action: "Inquiry forwarded to plant", recordType: "Inquiry", recordId: id, comment: note });
      return assessmentId;
    },
    [inquiries, logActivity]
  );

  const updateAssessment = useCallback((id: string, patch: Partial<TechnicalAssessment>) => {
    setAssessments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    // A plant reply moves its inquiry forward without anyone having to remember to do it.
    if (patch.verdict && patch.verdict !== "pending") {
      setAssessments((prevA) => {
        const target = prevA.find((a) => a.id === id);
        if (target) {
          setInquiries((prevI) =>
            prevI.map((i) =>
              i.id === target.inquiryId && i.status === "forwarded_to_plant"
                ? { ...i, status: "assessment_received" }
                : i
            )
          );
        }
        return prevA;
      });
    }
  }, []);

  const closeInquiry = useCallback(
    (id: string, status: Extract<InquiryStatus, "no_quote" | "lost">, reason: string) => {
      setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status, closeReason: reason } : i)));
      logActivity({
        action: status === "lost" ? "Inquiry marked lost" : "Inquiry closed without quotation",
        recordType: "Inquiry",
        recordId: id,
        comment: reason,
      });
    },
    [logActivity]
  );

  const markMailRead = useCallback((id: string) => {
    setMail((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
  }, []);

  const createQuotation = useCallback(
    (q: Omit<Quotation, "id" | "revisionNo" | "revisions" | "status">): string => {
      // Computed synchronously, not inside the setState updater: React may defer that updater
      // until render, and StrictMode runs it twice, so an id assigned in there would still be
      // empty when this function returns it to the caller for navigation.
      const id = nextPiNumber(quotations);
      // The first issue is not a revision of anything, so it carries no revision number. The second
      // draft becomes R1.
      const newQ: Quotation = {
        ...q,
        id,
        revisionNo: 0,
        status: "draft",
        revisions: [
          {
            revisionNo: 0,
            date: new Date().toISOString().slice(0, 10),
            changedBy: currentUser,
            note: "Initial issue",
            snapshot: snapshotOf({ ...q, id } as Quotation),
          },
        ],
      };
      setQuotations((prev) => [newQ, ...prev]);
      logActivity({
        action: "Drafted new Proforma Invoice",
        recordType: "Quotation",
        recordId: id,
      });
      return id;
    },
    [quotations, currentUser, logActivity]
  );

  const createQuotationFromAssessment = useCallback(
    (assessmentId: string): string => {
      const assessment = assessments.find((a) => a.id === assessmentId);
      if (!assessment || assessment.lines.length === 0) return "";
      const customer = customers.find((c) => c.id === assessment.customerId);
      const today = new Date().toISOString().slice(0, 10);

      // The plant's costing IS the pre-quotation. Lines sharing a specification sentence become one
      // item, exactly as they would if someone had built them by hand, and the plant's cost per kg
      // lands in USD/WT. No pricing rules are applied: margin is the salesperson's decision, so the
      // quotation opens at cost with every adjustment switched off.
      const items: BatchItem[] = [];
      for (const line of assessment.lines) {
        let item = items.find((i) => i.specification === line.specification);
        if (!item) {
          item = newBatchItem({
            specification: line.specification,
            material: line.material,
            netType: line.netType,
            weightUom: "KG",
            qtyUom: "PCS",
          });
          items.push(item);
        }
        item.specs.push(
          recomputeSpecLine(
            {
              id: `${assessmentId}-${line.id}`,
              specCode: line.specCode ?? "—",
              description: line.description,
              meshDepth: "",
              length: "",
              weightPerPc: line.weightPerPc,
              givenPriceKg: line.costPerKg,
              qtyPcs: line.qtyPcs,
              pricing: emptyPricing(line.costPerKg),
              unitPrice: 0,
              amount: 0,
              weightKg: 0,
            },
            pricingRules,
            lookupTables
          )
        );
      }

      const batches: QuotationBatch[] = [{ ...newBatch("normal"), items }];
      const quotationId = createQuotation({
        customerId: assessment.customerId,
        consignee: customer?.consignee ?? customer?.name ?? "",
        attentionContact: customer?.contactPerson,
        currency: customer?.defaultCurrency ?? "USD",
        paymentTerms: customer?.defaultPaymentTerms ?? "",
        issueDate: today,
        leadTimeDate: today,
        validityDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        validityDays: 7,
        leadTimeWeeks: 0,
        estimatedShipmentDate: today,
        batches,
        items: flattenBatches(batches),
        freight: 0,
        discount: 0,
        tax: 0,
        depositPercent: 30,
        assignedSalesperson: currentUser,
        remarks: assessment.leadTimeNote ?? "",
      });

      setAssessments((prev) => prev.map((a) => (a.id === assessmentId ? { ...a, quotationId } : a)));
      setInquiries((prev) =>
        prev.map((i) => (i.id === assessment.inquiryId ? { ...i, status: "quoted", quotationId } : i))
      );
      logActivity({
        action: `Quotation pre-filled from assessment ${assessmentId}`,
        recordType: "Quotation",
        recordId: quotationId,
      });
      return quotationId;
    },
    [assessments, customers, pricingRules, lookupTables, createQuotation, currentUser, logActivity]
  );

  const updateQuotationStatus = useCallback(
    (id: string, status: QuotationStatus, note?: string) => {
      setQuotations((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const updated: Quotation = { ...q, status };
          if (status === "approved") {
            updated.approver = currentUser;
            updated.approvedDate = new Date().toISOString().slice(0, 10);
          }
          if (note) updated.customerResponseNote = note;
          return updated;
        })
      );
      logActivity({
        action: `Quotation status changed to "${status.replace(/_/g, " ")}"`,
        newStatus: status,
        recordType: "Quotation",
        recordId: id,
        comment: note,
      });
    },
    [currentUser, logActivity]
  );

  const createRevision = useCallback(
    (id: string, note: string) => {
      setQuotations((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const newRevNo = q.revisionNo + 1;
          return {
            ...q,
            revisionNo: newRevNo,
            status: "revised",
            // A revision invalidates the previous sign-off. Leaving these set kept the old
            // approver's name printed on a document they never saw, and left the quotation
            // looking approved when it now needs approving again.
            approver: undefined,
            approvedDate: undefined,
            // The customer's acceptance goes with it. They accepted the document as it stood; a
            // revision is a different document, whatever the number on it. Carrying "Accepted"
            // forward would show a sales order resting on agreement that was never given.
            customerResponseNote: undefined,
            revisions: [
              ...refreshCurrentSnapshot(q),
              {
                revisionNo: newRevNo,
                date: new Date().toISOString().slice(0, 10),
                changedBy: currentUser,
                note,
                snapshot: snapshotOf(q),
              },
            ],
          };
        })
      );
      logActivity({
        action: "New revision created",
        recordType: "Quotation",
        recordId: id,
        comment: note,
      });

      /**
       * A revision reopens the figures, and a sales order raised on the old figures did not survive
       * that: it goes back to being a quotation until the revision is accepted and converted again.
       *
       * Only when nothing real has happened on the order yet. Once money has actually arrived,
       * deleting the order would delete the payment record of that money along with it — the
       * revision needs to be reconciled with Finance at that point, not silently erase the order.
       */
      const q = quotations.find((x) => x.id === id);
      const order = q?.salesOrderId ? salesOrders.find((so) => so.id === q.salesOrderId) : undefined;
      if (order && !payments.some((p) => p.salesOrderId === order.id && p.amountReceived > 0)) {
        removeSalesOrder(order.id);
        logActivity({
          action: `${order.id} reverted to quotation — sent back for revision`,
          recordType: "Sales Order",
          recordId: order.id,
        });
        pushToast({
          tone: "info",
          title: `${order.id} sent back to quotation`,
          description: "Nothing had been paid against it, so it was reverted rather than carried forward.",
        });
      }
    },
    [currentUser, logActivity, quotations, salesOrders, payments, removeSalesOrder, pushToast]
  );

  /**
   * Pushes a quotation's current figures onto the sales order raised from it.
   *
   * A sales order is not a copy taken once and left alone: it is the same agreement, further along.
   * When the quotation behind it is revised, an order still carrying the old value quietly
   * disagrees with the document the customer holds, and the difference surfaces at final payment
   * when it is expensive.
   *
   * Called explicitly by the quotation editor rather than folded into `updateQuotation`, so it is
   * obvious at the call site that saving a quotation can move money on an order.
   */
  const syncSalesOrderFromQuotation = useCallback(
    (q: Quotation) => {
      // The quotation is passed in rather than looked up by id. The caller has just saved it, and
      // React has not flushed that state yet, so a lookup here would sync the order against the
      // figures the user just replaced.
      if (!q.salesOrderId) return;
      const { grandTotal } = totalsForQuotation(q);
      const order = salesOrders.find((so) => so.id === q.salesOrderId);
      if (!order || Math.abs(order.orderValue - grandTotal) < 0.005) return;

      setSalesOrders((prev) =>
        prev.map((so) => (so.id === q.salesOrderId ? { ...so, orderValue: grandTotal } : so))
      );
      // The deposit and balance follow the value, but only while they are still expected. A
      // payment already verified is money that actually arrived, and rewriting it would falsify
      // the bank record.
      setPayments((prev) => {
        const mine = prev.filter((p) => p.salesOrderId === q.salesOrderId);
        const deposit = grandTotal * (q.depositPercent / 100);
        return prev.map((p) => {
          if (p.salesOrderId !== q.salesOrderId || p.status === "verified") return p;
          if (p.type === "deposit") return { ...p, expectedAmount: Math.round(deposit * 100) / 100 };
          if (p.type === "balance") {
            const verifiedDeposit = mine
              .filter((x) => x.type === "deposit" && x.status === "verified")
              .reduce((s, x) => s + x.amountReceived, 0);
            const balance = Math.max(0, grandTotal - (verifiedDeposit || deposit));
            return { ...p, expectedAmount: Math.round(balance * 100) / 100 };
          }
          return p;
        });
      });

      logActivity({
        action: `Order value updated to ${grandTotal.toFixed(2)} from ${q.id}`,
        previousStatus: order.orderValue.toFixed(2),
        newStatus: grandTotal.toFixed(2),
        recordType: "Sales Order",
        recordId: q.salesOrderId,
      });
    },
    [salesOrders, logActivity]
  );

  const duplicateQuotation = useCallback(
    (id: string): string => {
      const source = quotations.find((q) => q.id === id);
      if (!source) return "";
      const newId = nextPiNumber(quotations);
      const today = new Date().toISOString().slice(0, 10);
      // Same customer and terms, but a brand new document: back to draft at its first issue, with
      // the approval trail and any sales-order link cleared so the copy stands on its own.
      const copy: Quotation = {
        ...source,
        id: newId,
        issueDate: today,
        status: "draft",
        revisionNo: 0,
        revisions: [
          {
            revisionNo: 0,
            date: today,
            changedBy: currentUser,
            note: `Duplicated from ${source.id}`,
            snapshot: snapshotOf({ ...source, id: newId }),
          },
        ],
        approver: undefined,
        approvedDate: undefined,
        customerResponseNote: undefined,
        salesOrderId: undefined,
      };
      setQuotations((prev) => [copy, ...prev]);
      logActivity({ action: `Duplicated ${id}`, recordType: "Quotation", recordId: newId });
      return newId;
    },
    [quotations, currentUser, logActivity]
  );

  /**
   * Puts a quotation back to an earlier revision.
   *
   * The revision number goes *back* rather than forward. Restoring R1 means the document is R1
   * again: that is the number already printed on the copy the customer holds, and inventing an R4
   * that is byte-for-byte R1 would put a number on the customer's desk that matches nothing.
   *
   * The restore is not silently lost, though. Whatever was on screen is captured into its own
   * revision first, so the abandoned content is still recoverable, and the restore itself is
   * written to the activity log with who did it and when. The audit trail lives there, where every
   * other "who changed what" question is already answered, instead of inflating the revision count
   * on the document.
   */
  const restoreRevision = useCallback(
    (id: string, revisionNo: number) => {
      setQuotations((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const target = q.revisions.find((r) => r.revisionNo === revisionNo);
          if (!target?.snapshot) return q;
          return {
            ...q,
            ...target.snapshot,
            revisionNo,
            status: "revised",
            approver: undefined,
            approvedDate: undefined,
            // The outgoing content is written into its own revision before the swap, so nothing on
            // screen is thrown away by restoring.
            revisions: refreshCurrentSnapshot(q),
          };
        })
      );
      logActivity({
        action: `Restored ${revisionLabel(revisionNo).toLowerCase()}`,
        previousStatus: revisionLabel(quotations.find((q) => q.id === id)?.revisionNo ?? 0),
        newStatus: revisionLabel(revisionNo),
        recordType: "Quotation",
        recordId: id,
      });
    },
    [quotations, logActivity]
  );

  const convertToSalesOrder = useCallback(
    (quotationId: string): string => {
      const q = quotations.find((x) => x.id === quotationId);
      if (!q) return "";
      // The sales order carries its quotation's number: PI-33011 becomes SO-33011. An arbitrary
      // sequence meant nothing on the SO tied it back to the PI it came from.
      const soId = q.id.startsWith("PI-") ? q.id.replace(/^PI-/, "SO-") : nextId("SO");
      // Shared with syncSalesOrderFromQuotation so the value an order is raised with and the value
      // it is later corrected to come from the same formula. Adding items + freight - discount + tax
      // by hand here missed that discount can be a percent, not an amount, and ignored batches
      // entirely — so a percent-discount quotation converted to an order carrying the wrong value,
      // deposit and balance from the moment it was raised.
      const { grandTotal: totalValue } = totalsForQuotation(q);

      const newOrder: SalesOrder = {
        id: soId,
        quotationId: q.id,
        customerId: q.customerId,
        consignee: q.consignee,
        country: "—",
        currency: q.currency,
        orderValue: totalValue,
        orderDate: new Date().toISOString().slice(0, 10),
        requestedDeliveryDate: q.estimatedShipmentDate,
        currentStage: "customer_confirmation",
        priority: "standard",
        assignedSalesperson: q.assignedSalesperson,
        productionStatus: "not_started",
        productionQtyOrdered: q.items.reduce((s, li) => s + li.qtyPcs, 0),
        productionQtyCompleted: 0,
        productionQtyRejected: 0,
        // Derived from ORDER_STAGES rather than written out, so reordering the lifecycle in one
        // place cannot leave newly created orders running the old sequence.
        stages: freshStages("customer_confirmation", "Awaiting signed PO from customer"),
      };

      setSalesOrders((prev) => [newOrder, ...prev]);
      setQuotations((prev) =>
        prev.map((x) => (x.id === quotationId ? { ...x, salesOrderId: soId, status: "accepted" } : x))
      );

      const depositAmt = totalValue * (q.depositPercent / 100);
      const balanceAmt = totalValue - depositAmt;
      // Deliberately raised without an approval block, which reads as approved. These two amounts
      // are the deposit percentage and the balance of a quotation that has already been approved
      // and accepted, so asking for a second sign-off on the same figures would be theatre. It is
      // payments added by hand afterwards, where somebody chose an amount, that need approving.
      setPayments((prev) => [
        ...prev,
        {
          id: nextId("PMT"),
          salesOrderId: soId,
          type: "deposit",
          expectedAmount: Math.round(depositAmt * 100) / 100,
          amountReceived: 0,
          status: "expected",
        },
        {
          id: nextId("PMT"),
          salesOrderId: soId,
          type: "balance",
          expectedAmount: Math.round(balanceAmt * 100) / 100,
          amountReceived: 0,
          status: "expected",
        },
      ]);

      logActivity({
        action: "Sales order created from accepted quotation",
        previousStatus: "Quotation",
        newStatus: "Customer Confirmation",
        recordType: "Sales Order",
        recordId: soId,
        comment: `Converted from ${quotationId}`,
      });

      return soId;
    },
    [quotations, logActivity]
  );

  const createDirectSalesOrder = useCallback(
    (inquiryId: string, args: { poNo: string; value: number; deliveryDate: string }): string => {
      const inquiry = inquiries.find((i) => i.id === inquiryId);
      if (!inquiry) return "";
      const customer = customers.find((c) => c.id === inquiry.customerId);
      const today = new Date().toISOString().slice(0, 10);
      // Numbered off the inquiry, since there is no PI to take a number from.
      const soId = inquiryId.replace(/^INQ-/, "SO-");

      // No quotation behind this order: the customer's PO is the agreement. It therefore starts at
      // Deposit rather than Customer Confirmation, because the customer has already confirmed, in
      // writing, by raising the PO.
      const newOrder: SalesOrder = {
        id: soId,
        inquiryId,
        customerPoNo: args.poNo,
        customerId: inquiry.customerId,
        consignee: customer?.consignee ?? customer?.name ?? "",
        country: customer?.country ?? "—",
        currency: customer?.defaultCurrency ?? "USD",
        orderValue: args.value,
        orderDate: today,
        requestedDeliveryDate: args.deliveryDate,
        currentStage: "deposit",
        priority: "standard",
        assignedSalesperson: currentUser,
        productionStatus: "not_started",
        productionQtyOrdered: 0,
        productionQtyCompleted: 0,
        productionQtyRejected: 0,
        stages: freshStages("deposit", `Awaiting deposit against ${args.poNo}`),
      };

      setSalesOrders((prev) => [newOrder, ...prev]);
      setInquiries((prev) =>
        prev.map((i) =>
          i.id === inquiryId
            ? {
                ...i,
                status: "direct_order",
                salesOrderId: soId,
                closeReason: `Customer issued PO ${args.poNo}; no proforma required.`,
              }
            : i
        )
      );

      const depositPercent = 30;
      const depositAmt = args.value * (depositPercent / 100);
      // As above: derived from the customer's own PO value, so they carry no approval block and
      // read as approved.
      setPayments((prev) => [
        ...prev,
        {
          id: nextId("PMT"),
          salesOrderId: soId,
          type: "deposit",
          expectedAmount: depositAmt,
          amountReceived: 0,
          status: "expected",
          dueDate: today,
          remarks: `Against customer PO ${args.poNo}`,
        },
        {
          id: nextId("PMT"),
          salesOrderId: soId,
          type: "balance",
          expectedAmount: args.value - depositAmt,
          amountReceived: 0,
          status: "expected",
          dueDate: args.deliveryDate,
        },
      ]);

      logActivity({
        action: `Sales order raised directly from ${inquiryId} on customer PO ${args.poNo}`,
        recordType: "Sales Order",
        recordId: soId,
      });
      return soId;
    },
    [inquiries, customers, currentUser, logActivity]
  );

  const createInquiryFromMail = useCallback(
    (mailId: string): string => {
      const message = mail.find((m) => m.id === mailId);
      if (!message) return "";
      const id = nextId("INQ");
      setInquiries((prev) => [
        {
          id,
          customerId: message.suggestedCustomerId ?? customers[0]?.id ?? "",
          receivedDate: message.date.slice(0, 10),
          source: "email",
          subject: message.subject,
          requirement: message.body,
          status: "new",
          assignedTo: currentUser,
          attachments: message.attachmentNames.map((name, i) => ({
            id: `att-${i}`,
            name,
            origin: "Customer email",
            uploadedBy: currentUser,
            date: message.date.slice(0, 10),
          })),
        },
        ...prev,
      ]);
      setMail((prev) => prev.map((m) => (m.id === mailId ? { ...m, read: true, linkedInquiryId: id } : m)));
      logActivity({ action: "Inquiry raised from email", recordType: "Inquiry", recordId: id });
      return id;
    },
    [mail, customers, currentUser, logActivity]
  );

  // ---- Operations -------------------------------------------------------------------------
  //
  // Each stage completing pushes its sales order forward. That single helper is what makes the
  // four operations screens feel like one process rather than four disconnected lists.

  const advanceOrderTo = useCallback(
    (salesOrderId: string, stage: OrderStage, pendingAction?: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const targetIdx = ORDER_STAGES.findIndex((s) => s.id === stage);
      setSalesOrders((prev) =>
        prev.map((so) =>
          so.id !== salesOrderId
            ? so
            : {
                ...so,
                currentStage: stage,
                stages: so.stages.map((rec) => {
                  const idx = ORDER_STAGES.findIndex((s) => s.id === rec.stage);
                  if (idx < targetIdx) {
                    return rec.status === "completed" ? rec : { ...rec, status: "completed", completedDate: today };
                  }
                  if (idx === targetIdx) {
                    // "Completed" is the terminal stage — there is nothing left to do once it is
                    // reached, so it is marked done immediately rather than left "in progress"
                    // forever with a pending action the UI never offers a button for.
                    return stage === "completed"
                      ? { ...rec, status: "completed", completedDate: today, pendingAction: undefined }
                      : { ...rec, status: "in_progress", pendingAction };
                  }
                  return { ...rec, status: "pending", pendingAction: undefined };
                }),
              }
        )
      );
    },
    []
  );

  const addProductionRun = useCallback((run: Omit<ProductionRun, "id">): string => {
    const id = nextId("PR");
    setProductionRuns((prev) => [{ ...run, id }, ...prev]);
    return id;
  }, []);

  const updateProductionRun = useCallback((id: string, patch: Partial<ProductionRun>) => {
    setProductionRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeProductionRun = useCallback((id: string) => {
    setProductionRuns((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const completeProduction = useCallback(
    (salesOrderId: string) => {
      const today = new Date().toISOString().slice(0, 10);
      setProductionRuns((prev) =>
        prev.map((r) => (r.salesOrderId === salesOrderId && !r.completedDate ? { ...r, completedDate: today } : r))
      );
      // The order's headline production figures are the sum of its runs, so the sales order and
      // the factory floor can never disagree.
      setSalesOrders((prev) =>
        prev.map((so) => {
          if (so.id !== salesOrderId) return so;
          const runs = productionRuns.filter((r) => r.salesOrderId === salesOrderId);
          return {
            ...so,
            productionStatus: "completed",
            actualCompletionDate: today,
            productionQtyOrdered: runs.reduce((s, r) => s + r.qtyOrdered, 0),
            productionQtyCompleted: runs.reduce((s, r) => s + r.qtyCompleted, 0),
            productionQtyRejected: runs.reduce((s, r) => s + r.qtyRejected, 0),
          };
        })
      );
      advanceOrderTo(salesOrderId, "packing", "Pack completed goods and raise the packing list");
      logActivity({ action: "Production completed", recordType: "Sales Order", recordId: salesOrderId });
    },
    [productionRuns, advanceOrderTo, logActivity]
  );

  /**
   * Opens a packing list against an order.
   *
   * An order can have several: nets ship in partial loads and each load gets its own list. The id
   * therefore carries a sequence, and the customer is stamped on so the list can be found from the
   * customer's statement rather than only from the order.
   */
  const createPackingList = useCallback(
    (salesOrderId: string, scope: ShipmentScope = "full", lines: Omit<PackingLine, "id">[] = []): string => {
      const order = salesOrders.find((o) => o.id === salesOrderId);
      const existing = packingLists.filter((p) => p.salesOrderId === salesOrderId).length;
      const base = salesOrderId.replace(/^SO-/, "PL-");
      const id = existing === 0 ? base : `${base}-${existing + 1}`;
      setPackingLists((prev) => [
        {
          id,
          salesOrderId,
          customerId: order?.customerId ?? "",
          createdDate: new Date().toISOString().slice(0, 10),
          packedBy: currentUser,
          scope,
          // Opened with the chosen items already on it. A list that starts empty makes the user
          // re-pick what they just picked, which is where rows get missed.
          sections: [
            {
              id: nextId("SEC"),
              title: "Section 1",
              lines: lines.map((l) => ({ ...l, id: nextId("PKL") })),
            },
          ],
        },
        ...prev,
      ]);
      logActivity({
        action: `Opened ${scope} packing list ${id}`,
        recordType: "Sales Order",
        recordId: salesOrderId,
      });
      return id;
    },
    [salesOrders, packingLists, currentUser, logActivity]
  );

  const updatePackingList = useCallback((id: string, patch: Partial<PackingList>) => {
    setPackingLists((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const removePackingList = useCallback((id: string) => {
    setPackingLists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Attaches a file to a sales order. The caller has already read and validated it. */
  const addOrderDocument = useCallback(
    (doc: Omit<OrderDocument, "id" | "uploadedBy" | "uploadedDate">) => {
      const id = nextId("DOC");
      setOrderDocuments((prev) => [
        { ...doc, id, uploadedBy: currentUser, uploadedDate: new Date().toISOString().slice(0, 10) },
        ...prev,
      ]);
      logActivity({
        action: `Uploaded ${doc.category} document "${doc.name}"`,
        recordType: "Sales Order",
        recordId: doc.salesOrderId,
      });
    },
    [currentUser, logActivity]
  );

  const removeOrderDocument = useCallback(
    (id: string) => {
      const doc = orderDocuments.find((d) => d.id === id);
      setOrderDocuments((prev) => prev.filter((d) => d.id !== id));
      if (doc) {
        logActivity({
          action: `Removed document "${doc.name}"`,
          recordType: "Sales Order",
          recordId: doc.salesOrderId,
        });
      }
    },
    [orderDocuments, logActivity]
  );

  const addPackingSection = useCallback((listId: string, title: string) => {
    setPackingLists((prev) =>
      prev.map((p) =>
        p.id !== listId
          ? p
          : {
              ...p,
              sections: [
                ...p.sections,
                { id: nextId("SEC"), title: title.trim() || `Section ${p.sections.length + 1}`, lines: [] },
              ],
            }
      )
    );
  }, []);

  const updatePackingSection = useCallback((listId: string, sectionId: string, title: string) => {
    setPackingLists((prev) =>
      prev.map((p) =>
        p.id !== listId
          ? p
          : { ...p, sections: p.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)) }
      )
    );
  }, []);

  const removePackingSection = useCallback((listId: string, sectionId: string) => {
    setPackingLists((prev) =>
      prev.map((p) => (p.id !== listId ? p : { ...p, sections: p.sections.filter((s) => s.id !== sectionId) }))
    );
  }, []);

  const addPackingLine = useCallback((listId: string, sectionId: string, line: Omit<PackingLine, "id">) => {
    setPackingLists((prev) =>
      prev.map((p) =>
        p.id !== listId
          ? p
          : {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId ? { ...s, lines: [...s.lines, { ...line, id: nextId("PKL") }] } : s
              ),
            }
      )
    );
  }, []);

  const updatePackingLine = useCallback(
    (listId: string, sectionId: string, lineId: string, patch: Partial<PackingLine>) => {
      setPackingLists((prev) =>
        prev.map((p) =>
          p.id !== listId
            ? p
            : {
                ...p,
                sections: p.sections.map((s) =>
                  s.id !== sectionId
                    ? s
                    : { ...s, lines: s.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
                ),
              }
        )
      );
    },
    []
  );

  const removePackingLine = useCallback((listId: string, sectionId: string, lineId: string) => {
    setPackingLists((prev) =>
      prev.map((p) =>
        p.id !== listId
          ? p
          : {
              ...p,
              sections: p.sections.map((s) =>
                s.id !== sectionId ? s : { ...s, lines: s.lines.filter((l) => l.id !== lineId) }
              ),
            }
      )
    );
  }, []);

  /** Reopens a closed list so a mistake can be corrected rather than worked around. */
  const reopenPackingList = useCallback(
    (id: string) => {
      setPackingLists((prev) => prev.map((p) => (p.id === id ? { ...p, finalizedDate: undefined } : p)));
      logActivity({ action: `Reopened packing list ${id}`, recordType: "Sales Order", recordId: id });
    },
    [logActivity]
  );

  const finalizePackingList = useCallback(
    (id: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const list = packingLists.find((p) => p.id === id);
      if (!list) return;
      setPackingLists((prev) => prev.map((p) => (p.id === id ? { ...p, finalizedDate: today } : p)));

      // Closing the list opens the inspection it will be checked against, so nothing has to be
      // created by hand between the two stages. The measurement sheet is seeded from the order's
      // own lines, pre-filled with the quoted weights, because inspection is where those quoted
      // figures are replaced by what the goods actually weigh.
      const inspectionId = list.salesOrderId.replace(/^SO-/, "QC-");
      const order = salesOrders.find((o) => o.id === list.salesOrderId);
      const quotation = order?.quotationId ? quotations.find((q) => q.id === order.quotationId) : undefined;
      setInspections((prev) =>
        prev.some((i) => i.id === inspectionId)
          ? prev
          : [
              {
                id: inspectionId,
                salesOrderId: list.salesOrderId,
                packingListId: id,
                inspector: "",
                result: "pending",
                cartonsChecked: 0,
                defectsFound: 0,
                remarks: "",
                lines: buildInspectionLines(quotation?.items ?? []),
              },
              ...prev,
            ]
      );
      advanceOrderTo(list.salesOrderId, "inspection", "Weigh the packed goods and settle the order value");
      logActivity({ action: `Packing list ${id} finalized`, recordType: "Sales Order", recordId: list.salesOrderId });
    },
    [packingLists, salesOrders, quotations, advanceOrderTo, logActivity]
  );

  const updateInspection = useCallback((id: string, patch: Partial<InspectionRecord>) => {
    setInspections((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const recordInspection = useCallback(
    (id: string, result: "pass" | "fail", args: { cartonsChecked: number; defectsFound: number; remarks: string }) => {
      const today = new Date().toISOString().slice(0, 10);
      const record = inspections.find((i) => i.id === id);
      if (!record) return;

      // The settlement is computed here, once, from the weights on the record. Passing inspection
      // is the moment the order value stops being an estimate.
      const settlement = settleInspection(record.lines ?? []);
      const revised = record.lines?.length ? settlement.actualValue : undefined;

      setInspections((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                ...args,
                result,
                inspectedDate: today,
                inspector: i.inspector || currentUser,
                revisedOrderValue: result === "pass" ? revised : undefined,
              }
            : i
        )
      );

      if (result === "pass") {
        if (revised !== undefined) {
          // The order carries the settled figure, and the balance still owed is restated against
          // it. Leaving the balance at the quoted amount would invoice for weight nobody shipped.
          setSalesOrders((prev) =>
            prev.map((so) => (so.id === record.salesOrderId ? { ...so, orderValue: revised } : so))
          );
          setPayments((prev) => {
            const mine = prev.filter((p) => p.salesOrderId === record.salesOrderId);
            const deposit = mine.filter((p) => p.type === "deposit").reduce((s, p) => s + p.expectedAmount, 0);
            const balanceDue = Math.max(0, revised - deposit);
            return prev.map((p) =>
              p.salesOrderId === record.salesOrderId && p.type === "balance" && p.status !== "verified"
                ? { ...p, expectedAmount: Math.round(balanceDue * 100) / 100 }
                : p
            );
          });
        }
        advanceOrderTo(record.salesOrderId, "final_payment", "Collect the balance on the settled order value");
      } else {
        // A failure blocks the order rather than silently moving on.
        setSalesOrders((prev) =>
          prev.map((so) =>
            so.id !== record.salesOrderId
              ? so
              : {
                  ...so,
                  stages: so.stages.map((rec) =>
                    rec.stage === "inspection"
                      ? { ...rec, status: "blocked", blocker: args.remarks || "Failed inspection" }
                      : rec
                  ),
                }
          )
        );
      }
      logActivity({
        action: `Inspection ${result === "pass" ? "passed" : "failed"}`,
        recordType: "Sales Order",
        recordId: record.salesOrderId,
        comment:
          result === "pass" && revised !== undefined && Math.abs(settlement.difference) > 0.005
            ? `${args.remarks ? args.remarks + " · " : ""}Order value settled at ${revised.toFixed(2)} on actual weight (${settlement.difference > 0 ? "+" : ""}${settlement.difference.toFixed(2)})`
            : args.remarks,
      });
    },
    [inspections, currentUser, advanceOrderTo, logActivity]
  );

  /** Records a weighed figure against one inspection line. */
  const updateInspectionLine = useCallback((inspectionId: string, lineId: string, actualWeightKg: number) => {
    setInspections((prev) =>
      prev.map((i) =>
        i.id !== inspectionId
          ? i
          : { ...i, lines: (i.lines ?? []).map((l) => (l.id === lineId ? { ...l, actualWeightKg } : l)) }
      )
    );
  }, []);

  const createShipment = useCallback(
    (salesOrderId: string): string => {
      const id = salesOrderId.replace(/^SO-/, "SH-");
      setShipments((prev) =>
        prev.some((s) => s.id === id)
          ? prev
          : [
              {
                id,
                salesOrderId,
                status: "booked",
                vessel: "",
                // Carried over from packing. The packer knows the container long before Logistics
                // opens the shipment, so asking for it twice invites two different answers. It
                // stays editable here, because containers do get reallocated.
                containerNo:
                  packingLists.find((p) => p.salesOrderId === salesOrderId && p.containerNo)?.containerNo ?? "",
                billOfLadingNo: "",
                portOfLoading: "Manila, Philippines",
                portOfDischarge: "",
                bookedDate: new Date().toISOString().slice(0, 10),
                // Gross weight comes from what was actually packed, not what was quoted. Every
                // closed list on the order counts, because a shipment can cover several loads.
                grossWeightKg: packingLists
                  .filter((p) => p.salesOrderId === salesOrderId)
                  .reduce((sum, p) => sum + sectionTotals(p.sections ?? []).grossKg, 0),
              },
              ...prev,
            ]
      );
      return id;
    },
    [packingLists]
  );

  const updateShipment = useCallback((id: string, patch: Partial<Shipment>) => {
    setShipments((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const departShipment = useCallback(
    (id: string) => {
      const shipment = shipments.find((s) => s.id === id);
      if (!shipment) return;
      const today = new Date().toISOString().slice(0, 10);
      setShipments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "departed", etd: s.etd ?? today } : s))
      );
      // The B/L and container belong on the commercial invoice; this is the moment they are known.
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.salesOrderId === shipment.salesOrderId
            ? { ...inv, billOfLadingNo: shipment.billOfLadingNo, containerNo: shipment.containerNo }
            : inv
        )
      );
      // Documents is no longer a stage of its own: the paperwork accumulates across the order
      // rather than at one point in it, so departure closes the order out. Completed is terminal —
      // there is no further action for anyone to take, so none is passed here.
      advanceOrderTo(shipment.salesOrderId, "completed");
      logActivity({
        action: `Shipment departed on ${shipment.vessel || "vessel TBA"}`,
        recordType: "Sales Order",
        recordId: shipment.salesOrderId,
      });
    },
    [shipments, advanceOrderTo, logActivity]
  );

  const verifyPayment = useCallback(
    (paymentId: string) => {
      setPayments((prev) =>
        prev.map((p) => {
          if (p.id !== paymentId) return p;
          // Verification is what releases the next stage of the order, so an unapproved line
          // cannot be verified. Approving afterwards would mean the approval gated nothing.
          if (!canVerifyPayment(p)) return p;
          const amountReceived = p.amountReceived > 0 ? p.amountReceived : p.expectedAmount;
          return {
            ...p,
            status: "verified",
            amountReceived,
            verifiedBy: currentUser,
            verificationDate: new Date().toISOString().slice(0, 10),
            dateReceived: p.dateReceived ?? new Date().toISOString().slice(0, 10),
          };
        })
      );
      const payment = payments.find((p) => p.id === paymentId);
      logActivity({
        action: `Verified ${payment?.type ?? "payment"} payment`,
        previousStatus: "Submitted for Verification",
        newStatus: "Verified",
        recordType: "Payment",
        recordId: paymentId,
      });

      /**
       * Verifying money is the event the process waits on, so it moves the order.
       *
       * The deposit is what lets the factory commit material; the balance is what lets the
       * container be booked. Without this the order sat at Deposit or Final Payment with the money
       * already in, and the next team never learned it was their turn — the only way forward was
       * somebody noticing and pressing Mark Step Complete by hand.
       *
       * The verified state is applied to a local copy first, because the setPayments above has not
       * flushed yet and the ledger has to be read against the payment as it now stands.
       */
      const order = payment ? salesOrders.find((o) => o.id === payment.salesOrderId) : undefined;
      // Mirrors the guard above: if the payment could not actually be marked verified, there is
      // nothing here to release the order against.
      if (payment && order && canVerifyPayment(payment)) {
        const settled: PaymentRecord = {
          ...payment,
          status: "verified",
          amountReceived: payment.amountReceived > 0 ? payment.amountReceived : payment.expectedAmount,
        };
        const after = payments.map((p) => (p.id === paymentId ? settled : p));
        const next = stageReleasedBy(order, settled, after);
        if (next) {
          advanceOrderTo(
            order.id,
            next,
            next === "packing"
              ? "Raise the packing list for this order"
              : "Book the container and raise the bill of lading"
          );
        }
      }
    },
    [payments, salesOrders, currentUser, advanceOrderTo, logActivity]
  );

  const rejectPayment = useCallback(
    (paymentId: string) => {
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? { ...p, status: "rejected" } : p)));
      logActivity({
        action: "Rejected payment verification",
        newStatus: "Rejected",
        recordType: "Payment",
        recordId: paymentId,
      });
    },
    [logActivity]
  );

  const resolveApproval = useCallback(
    (id: string, decision: "approved" | "rejected" | "returned") => {
      setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: decision } : a)));
      logActivity({
        action: `Approval request ${decision}`,
        newStatus: decision,
        recordType: "Approval",
        recordId: id,
      });
    },
    [logActivity]
  );

  const generateInvoice = useCallback(
    (salesOrderId: string, shippedQty?: Record<string, number>): string => {
      const order = salesOrders.find((o) => o.id === salesOrderId);
      const quotation = order ? quotations.find((q) => q.id === order.quotationId) : undefined;
      if (!order || !quotation) return "";
      const id = nextId("CI");

      // Snapshot the items (not a shared reference) and recalculate on actual shipped qty per
      // Part B of the discovery doc — Amount = U/P x Actual Shipped Qty, not the quoted qty.
      // unitPrice stays frozen from the quotation; only qty and the derived totals move.
      const items = quotation.items.map((li) => {
        const shipped = shippedQty?.[li.id] ?? li.qtyPcs;
        const weightPerPc = li.qtyPcs > 0 ? li.weightKg / li.qtyPcs : 0;
        return {
          ...li,
          shippedQtyPcs: shipped,
          totalPrice: Math.round(li.unitPrice * shipped * 100) / 100,
          weightKg: Math.round(weightPerPc * shipped * 100) / 100,
        };
      });
      const isPartial = items.some((li) => (li.shippedQtyPcs ?? li.qtyPcs) !== li.qtyPcs);

      const newInvoice: CommercialInvoice = {
        id,
        salesOrderId,
        quotationId: quotation.id,
        customerId: order.customerId,
        issueDate: new Date().toISOString().slice(0, 10),
        currency: order.currency,
        items,
        freight: quotation.freight,
        discount: quotation.discount,
        tax: quotation.tax,
        status: "issued",
        shippedWeightKg: items.reduce((s, li) => s + li.weightKg, 0),
      };
      setInvoices((prev) => [newInvoice, ...prev]);
      setSalesOrders((prev) => prev.map((o) => (o.id === salesOrderId ? { ...o, invoiceId: id } : o)));
      logActivity({
        action: isPartial ? "Generated Commercial Invoice (partial shipment)" : "Generated Commercial Invoice",
        recordType: "Commercial Invoice",
        recordId: id,
        comment: `From ${salesOrderId}`,
      });
      return id;
    },
    [salesOrders, quotations, logActivity]
  );

  const advanceStage = useCallback(
    (salesOrderId: string) => {
      const order = salesOrders.find((o) => o.id === salesOrderId);
      if (!order) return;
      const currentIdx = ORDER_STAGES.findIndex((s) => s.id === order.currentStage);
      if (currentIdx === -1 || currentIdx === ORDER_STAGES.length - 1) return;

      // Business-rule guardrails, per Export Sales ERP System Framework §7.
      if (order.currentStage === "deposit") {
        const deposit = payments.find((p) => p.salesOrderId === salesOrderId && p.type === "deposit");
        if (!deposit || deposit.status !== "verified") {
          pushToast({
            tone: "danger",
            title: "Cannot proceed — deposit not verified",
            description: "Finance must verify the deposit remittance before production release.",
          });
          return;
        }
      }
      if (order.currentStage === "shipment") {
        const balance = payments.find((p) => p.salesOrderId === salesOrderId && p.type === "balance");
        if (!balance || balance.status !== "verified") {
          pushToast({
            tone: "danger",
            title: "Cannot proceed — remaining balance not verified",
            description: "Container loading is blocked until Finance clears the remaining balance.",
          });
          return;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const nextStage = ORDER_STAGES[currentIdx + 1];

      setSalesOrders((prev) =>
        prev.map((o) => {
          if (o.id !== salesOrderId) return o;
          const stages = o.stages.map((s) => {
            if (s.stage === o.currentStage) {
              return { ...s, status: "completed" as const, completedDate: today, blocker: undefined, pendingAction: undefined };
            }
            if (s.stage === nextStage.id) {
              // Completed is terminal — reaching it finishes it on the spot rather than leaving it
              // "in progress" with nothing further for anyone to click.
              return nextStage.id === "completed"
                ? { ...s, status: "completed" as const, completedDate: today, blocker: undefined, pendingAction: undefined }
                : { ...s, status: "in_progress" as const, blocker: undefined };
            }
            return s;
          });
          return {
            ...o,
            currentStage: nextStage.id,
            stages,
            actualCompletionDate: nextStage.id === "completed" ? today : o.actualCompletionDate,
          };
        })
      );

      logActivity({
        action: `Advanced order to "${nextStage.label}"`,
        previousStatus: ORDER_STAGES[currentIdx].label,
        newStatus: nextStage.label,
        recordType: "Sales Order",
        recordId: salesOrderId,
      });
      pushToast({
        tone: "success",
        title: `Moved to ${nextStage.label}`,
        description: `${salesOrderId} is now owned by ${nextStage.role}.`,
      });
    },
    [salesOrders, payments, currentUser, logActivity, pushToast]
  );

  const value = useMemo(
    () => ({
      role,
      users,
      signedInUser,
      signIn,
      signOut,
      updateUser,
      currentUser,
      inquiries,
      assessments,
      mail,
      addInquiry,
      updateInquiry,
      removeInquiry,
      forwardInquiryToPlant,
      updateAssessment,
      createQuotationFromAssessment,
      closeInquiry,
      createDirectSalesOrder,
      markMailRead,
      createInquiryFromMail,
      productionRuns,
      packingLists,
      inspections,
      shipments,
      addProductionRun,
      updateProductionRun,
      removeProductionRun,
      completeProduction,
      createPackingList,
      updatePackingList,
      removePackingList,
      orderDocuments,
      addOrderDocument,
      removeOrderDocument,
      addPackingSection,
      updatePackingSection,
      removePackingSection,
      addPackingLine,
      updatePackingLine,
      removePackingLine,
      reopenPackingList,
      updateInspectionLine,
      finalizePackingList,
      updateInspection,
      recordInspection,
      createShipment,
      updateShipment,
      departShipment,
      quotations,
      salesOrders,
      payments,
      invoices,
      approvals,
      activity,
      pricingRules,
      lookupTables,
      updatePricingRule,
      updateLookupRow,
      specMaster,
      lacingCatalog,
      specUsage,
      recordSpecUsage,
      addSpecMasterRow,
      updateSpecMasterRow,
      removeSpecMasterRow,
      addLacingRow,
      updateLacingRow,
      removeLacingRow,
      addPricingRule,
      removePricingRule,
      addLookupRowToTable,
      removeLookupRowFromTable,
      addCustomer,
      updateCustomer,
      removeCustomer,
      updateQuotation,
      removeQuotation,
      duplicateQuotation,
      restoreRevision,
      updateRevisionNote,
      addPayment,
      updatePayment,
      removePayment,
      approvePayment,
      declinePayment,
      reopenPaymentApproval,
      updateInvoice,
      removeInvoice,
      updateSalesOrder,
      removeSalesOrder,
      resetDemoData,
      customers,
      addContact,
      updateContact,
      removeContact,
      toasts,
      pushToast,
      dismissToast,
      logActivity,
      createQuotation,
      updateQuotationStatus,
      createRevision,
      syncSalesOrderFromQuotation,
      convertToSalesOrder,
      verifyPayment,
      rejectPayment,
      resolveApproval,
      generateInvoice,
      advanceStage,
    }),
    [
      role,
      currentUser,
      inquiries,
      assessments,
      mail,
      addInquiry,
      updateInquiry,
      removeInquiry,
      forwardInquiryToPlant,
      updateAssessment,
      createQuotationFromAssessment,
      closeInquiry,
      createDirectSalesOrder,
      markMailRead,
      createInquiryFromMail,
      productionRuns,
      packingLists,
      inspections,
      shipments,
      addProductionRun,
      updateProductionRun,
      removeProductionRun,
      completeProduction,
      createPackingList,
      updatePackingList,
      removePackingList,
      orderDocuments,
      addOrderDocument,
      removeOrderDocument,
      addPackingSection,
      updatePackingSection,
      removePackingSection,
      addPackingLine,
      updatePackingLine,
      removePackingLine,
      reopenPackingList,
      updateInspectionLine,
      finalizePackingList,
      updateInspection,
      recordInspection,
      createShipment,
      updateShipment,
      departShipment,
      quotations,
      salesOrders,
      payments,
      invoices,
      approvals,
      activity,
      pricingRules,
      lookupTables,
      updatePricingRule,
      updateLookupRow,
      specMaster,
      lacingCatalog,
      specUsage,
      recordSpecUsage,
      addSpecMasterRow,
      updateSpecMasterRow,
      removeSpecMasterRow,
      addLacingRow,
      updateLacingRow,
      removeLacingRow,
      addPricingRule,
      removePricingRule,
      addLookupRowToTable,
      removeLookupRowFromTable,
      addCustomer,
      updateCustomer,
      removeCustomer,
      updateQuotation,
      removeQuotation,
      duplicateQuotation,
      restoreRevision,
      updateRevisionNote,
      addPayment,
      updatePayment,
      removePayment,
      approvePayment,
      declinePayment,
      reopenPaymentApproval,
      updateInvoice,
      removeInvoice,
      updateSalesOrder,
      removeSalesOrder,
      resetDemoData,
      customers,
      addContact,
      updateContact,
      removeContact,
      toasts,
      pushToast,
      dismissToast,
      logActivity,
      createQuotation,
      updateQuotationStatus,
      createRevision,
      syncSalesOrderFromQuotation,
      convertToSalesOrder,
      verifyPayment,
      rejectPayment,
      resolveApproval,
      generateInvoice,
      advanceStage,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
