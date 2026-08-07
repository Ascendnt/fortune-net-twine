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
  PackingCarton,
  InspectionRecord,
  Shipment,
} from "./types";
import { ORDER_STAGES } from "./types";
import { INQUIRIES, TECHNICAL_ASSESSMENTS, MAIL_MESSAGES } from "./inquiryData";
import { PRODUCTION_RUNS, PACKING_LISTS, INSPECTIONS, SHIPMENTS } from "./operationsData";
import { emptyPricing, flattenBatches, newBatch, newBatchItem } from "./batches";
import { recomputeSpecLine } from "./totals";
import type { BatchItem, QuotationBatch } from "./types";
import {
  QUOTATIONS,
  SALES_ORDERS,
  PAYMENTS,
  INVOICES,
  APPROVALS,
  ACTIVITY,
  CURRENT_USER_BY_ROLE,
  PRICING_RULES,
  LOOKUP_TABLES,
  CUSTOMERS,
} from "./mockData";
import { LACING_CATALOG, SPEC_MASTER } from "./specMaster";
import type { LacingCatalogRow, SpecMasterRow } from "./specMaster";
import { PERSIST_KEYS, clearPersisted, loadPersisted, persist } from "./persist";

interface StoreState {
  role: Role;
  setRole: (r: Role) => void;
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
  createPackingList: (salesOrderId: string) => string;
  updatePackingList: (id: string, patch: Partial<PackingList>) => void;
  addCarton: (packingListId: string, carton: Omit<PackingCarton, "id">) => void;
  removeCarton: (packingListId: string, cartonId: string) => void;
  /** Closes the list, opens an inspection against it, and moves the order on. */
  finalizePackingList: (id: string) => void;
  updateInspection: (id: string, patch: Partial<InspectionRecord>) => void;
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

function migrateQuotations(quotations: Quotation[]): Quotation[] {
  return quotations.map((q) => {
    // Revisions used to be numbered from 0. Shift any zero-based history up by one so the first
    // issue reads as Revision 1 everywhere.
    const zeroBased = q.revisions.some((r) => r.revisionNo === 0);
    const revisions = zeroBased ? q.revisions.map((r) => ({ ...r, revisionNo: r.revisionNo + 1 })) : q.revisions;
    return {
    ...q,
    revisionNo: zeroBased ? q.revisionNo + 1 : q.revisionNo,
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
  // System Administrator by default: it is the only role with sight of every module and permission
  // to act at every stage, so nothing in the process is hidden behind a role switch.
  const [role, setRole] = useState<Role>("admin");
  // Slices that a user can meaningfully change are restored from localStorage; the rest stay as
  // seeded demo fixtures. See lib/persist.ts for the degradation rules.
  const [quotations, setQuotations] = useState<Quotation[]>(() =>
    migrateQuotations(loadPersisted(PERSIST_KEYS.quotations, QUOTATIONS))
  );
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(SALES_ORDERS);
  const [payments, setPayments] = useState<PaymentRecord[]>(PAYMENTS);
  const [invoices, setInvoices] = useState<CommercialInvoice[]>(INVOICES);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(APPROVALS);
  const [activity, setActivity] = useState<ActivityEntry[]>(ACTIVITY);
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
    loadPersisted(PERSIST_KEYS.packing, PACKING_LISTS)
  );
  const [inspections, setInspections] = useState<InspectionRecord[]>(() =>
    loadPersisted(PERSIST_KEYS.inspections, INSPECTIONS)
  );
  const [shipments, setShipments] = useState<Shipment[]>(() => loadPersisted(PERSIST_KEYS.shipments, SHIPMENTS));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => persist(PERSIST_KEYS.quotations, quotations), [quotations]);
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

  const addSpecMasterRow = useCallback((row: SpecMasterRow) => {
    setSpecMaster((prev) => (prev.some((r) => r.code === row.code) ? prev : [row, ...prev]));
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

  const addPayment = useCallback((payment: Omit<PaymentRecord, "id">): string => {
    const id = nextId("PAY");
    setPayments((prev) => [...prev, { ...payment, id }]);
    return id;
  }, []);

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

  const currentUser = CURRENT_USER_BY_ROLE[role] ?? "Guest User";

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
      // Revisions are numbered from 1: the first issue is Revision 1, not Revision 0.
      const newQ: Quotation = {
        ...q,
        id,
        revisionNo: 1,
        status: "draft",
        revisions: [
          {
            revisionNo: 1,
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
    },
    [currentUser, logActivity]
  );

  const duplicateQuotation = useCallback(
    (id: string): string => {
      const source = quotations.find((q) => q.id === id);
      if (!source) return "";
      const newId = nextPiNumber(quotations);
      const today = new Date().toISOString().slice(0, 10);
      // Same customer and terms, but a brand new document: back to draft at Revision 1, with the
      // approval trail and any sales-order link cleared so the copy stands on its own.
      const copy: Quotation = {
        ...source,
        id: newId,
        issueDate: today,
        status: "draft",
        revisionNo: 1,
        revisions: [
          {
            revisionNo: 1,
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

  const restoreRevision = useCallback(
    (id: string, revisionNo: number) => {
      const today = new Date().toISOString().slice(0, 10);
      setQuotations((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const target = q.revisions.find((r) => r.revisionNo === revisionNo);
          if (!target?.snapshot) return q;
          const nextNo = q.revisionNo + 1;
          return {
            ...q,
            ...target.snapshot,
            revisionNo: nextNo,
            status: "revised",
            approver: undefined,
            approvedDate: undefined,
            revisions: [
              // The live content is captured into the outgoing revision first, so a restore never
              // loses whatever was on screen. The new revision then holds the restored content,
              // which keeps the rule "a revision's snapshot is that revision's content" true for
              // every entry, and makes the restore itself reversible.
              ...refreshCurrentSnapshot(q),
              {
                revisionNo: nextNo,
                date: today,
                changedBy: currentUser,
                note: `Restored from Revision ${revisionNo}`,
                snapshot: target.snapshot,
              },
            ],
          };
        })
      );
      logActivity({ action: `Restored Revision ${revisionNo}`, recordType: "Quotation", recordId: id });
    },
    [currentUser, logActivity]
  );

  const convertToSalesOrder = useCallback(
    (quotationId: string): string => {
      const q = quotations.find((x) => x.id === quotationId);
      if (!q) return "";
      // The sales order carries its quotation's number: PI-33011 becomes SO-33011. An arbitrary
      // sequence meant nothing on the SO tied it back to the PI it came from.
      const soId = q.id.startsWith("PI-") ? q.id.replace(/^PI-/, "SO-") : nextId("SO");
      const totalValue =
        q.items.reduce((sum, li) => sum + li.totalPrice, 0) + q.freight - q.discount + q.tax;

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
                  if (idx === targetIdx) return { ...rec, status: "in_progress", pendingAction };
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

  const createPackingList = useCallback(
    (salesOrderId: string): string => {
      const id = salesOrderId.replace(/^SO-/, "PL-");
      setPackingLists((prev) =>
        prev.some((p) => p.id === id)
          ? prev
          : [
              {
                id,
                salesOrderId,
                createdDate: new Date().toISOString().slice(0, 10),
                packedBy: currentUser,
                cartons: [],
              },
              ...prev,
            ]
      );
      return id;
    },
    [currentUser]
  );

  const updatePackingList = useCallback((id: string, patch: Partial<PackingList>) => {
    setPackingLists((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const addCarton = useCallback((packingListId: string, carton: Omit<PackingCarton, "id">) => {
    setPackingLists((prev) =>
      prev.map((p) =>
        p.id === packingListId ? { ...p, cartons: [...p.cartons, { ...carton, id: nextId("CTN") }] } : p
      )
    );
  }, []);

  const removeCarton = useCallback((packingListId: string, cartonId: string) => {
    setPackingLists((prev) =>
      prev.map((p) => (p.id === packingListId ? { ...p, cartons: p.cartons.filter((c) => c.id !== cartonId) } : p))
    );
  }, []);

  const finalizePackingList = useCallback(
    (id: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const list = packingLists.find((p) => p.id === id);
      if (!list) return;
      setPackingLists((prev) => prev.map((p) => (p.id === id ? { ...p, finalizedDate: today } : p)));

      // Closing the list opens the inspection it will be checked against, so nothing has to be
      // created by hand between the two stages.
      const inspectionId = list.salesOrderId.replace(/^SO-/, "QC-");
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
              },
              ...prev,
            ]
      );
      advanceOrderTo(list.salesOrderId, "final_payment", "Collect balance before inspection release");
      logActivity({ action: `Packing list ${id} finalized`, recordType: "Sales Order", recordId: list.salesOrderId });
    },
    [packingLists, advanceOrderTo, logActivity]
  );

  const updateInspection = useCallback((id: string, patch: Partial<InspectionRecord>) => {
    setInspections((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const recordInspection = useCallback(
    (id: string, result: "pass" | "fail", args: { cartonsChecked: number; defectsFound: number; remarks: string }) => {
      const today = new Date().toISOString().slice(0, 10);
      const record = inspections.find((i) => i.id === id);
      if (!record) return;
      setInspections((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...args, result, inspectedDate: today, inspector: i.inspector || currentUser } : i))
      );

      if (result === "pass") {
        advanceOrderTo(record.salesOrderId, "shipment", "Book the container and raise the bill of lading");
      } else {
        // A failure holds the cartons and blocks the order rather than silently moving on.
        setPackingLists((prev) =>
          prev.map((p) =>
            p.id === record.packingListId
              ? { ...p, cartons: p.cartons.map((c) => (c.status === "packed" ? { ...c, status: "held" } : c)) }
              : p
          )
        );
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
        comment: args.remarks,
      });
    },
    [inspections, currentUser, advanceOrderTo, logActivity]
  );

  const createShipment = useCallback(
    (salesOrderId: string): string => {
      const id = salesOrderId.replace(/^SO-/, "SH-");
      const list = packingLists.find((p) => p.salesOrderId === salesOrderId);
      setShipments((prev) =>
        prev.some((s) => s.id === id)
          ? prev
          : [
              {
                id,
                salesOrderId,
                status: "booked",
                vessel: "",
                containerNo: "",
                billOfLadingNo: "",
                portOfLoading: "Manila, Philippines",
                portOfDischarge: "",
                bookedDate: new Date().toISOString().slice(0, 10),
                // Gross weight comes from what was actually packed, not what was quoted.
                grossWeightKg: list?.cartons.reduce((s, c) => s + c.grossWeightKg, 0) ?? 0,
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
      setPackingLists((prev) =>
        prev.map((p) =>
          p.salesOrderId === shipment.salesOrderId
            ? { ...p, cartons: p.cartons.map((c) => ({ ...c, status: "shipped" as const })) }
            : p
        )
      );
      // The B/L and container belong on the commercial invoice; this is the moment they are known.
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.salesOrderId === shipment.salesOrderId
            ? { ...inv, billOfLadingNo: shipment.billOfLadingNo, containerNo: shipment.containerNo }
            : inv
        )
      );
      advanceOrderTo(shipment.salesOrderId, "documents", "Release shipping documents to the customer and bank");
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
    },
    [payments, currentUser, logActivity]
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
              return { ...s, status: "in_progress" as const, blocker: undefined };
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
      setRole,
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
      addCarton,
      removeCarton,
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
      addCarton,
      removeCarton,
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
