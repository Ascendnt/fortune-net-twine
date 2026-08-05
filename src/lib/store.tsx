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
} from "./types";
import { ORDER_STAGES } from "./types";
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
 * Brings quotations saved by an earlier build forward. Right now that means dropping NOTE groups,
 * which no longer exist: a quotation saved before they were removed would otherwise render an
 * unlabelled empty band. They contributed to neither the grand total nor the total weight, so
 * removing them cannot change a figure.
 */
function migrateQuotations(quotations: Quotation[]): Quotation[] {
  return quotations.map((q) =>
    q.batches?.some((b) => !KNOWN_BATCH_TYPES.has(b.type))
      ? { ...q, batches: q.batches.filter((b) => KNOWN_BATCH_TYPES.has(b.type)) }
      : q
  );
}

let idCounter = 1000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("sales_manager");
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
  const [customers, setCustomers] = useState<Customer[]>(() => loadPersisted(PERSIST_KEYS.customers, CUSTOMERS));
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => persist(PERSIST_KEYS.quotations, quotations), [quotations]);
  useEffect(() => persist(PERSIST_KEYS.pricingRules, pricingRules), [pricingRules]);
  useEffect(() => persist(PERSIST_KEYS.lookupTables, lookupTables), [lookupTables]);
  useEffect(() => persist(PERSIST_KEYS.specMaster, specMaster), [specMaster]);
  useEffect(() => persist(PERSIST_KEYS.lacingCatalog, lacingCatalog), [lacingCatalog]);
  useEffect(() => persist(PERSIST_KEYS.customers, customers), [customers]);

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

  const createQuotation = useCallback(
    (q: Omit<Quotation, "id" | "revisionNo" | "revisions" | "status">): string => {
      idCounter += 1;
      const id = `PI-${33000 + (idCounter % 1000)}`;
      const newQ: Quotation = {
        ...q,
        id,
        revisionNo: 0,
        status: "draft",
        revisions: [{ revisionNo: 0, date: new Date().toISOString().slice(0, 10), changedBy: currentUser, note: "Initial issue" }],
      };
      setQuotations((prev) => [newQ, ...prev]);
      logActivity({
        action: "Drafted new Proforma Invoice",
        recordType: "Quotation",
        recordId: id,
      });
      return id;
    },
    [currentUser, logActivity]
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
            revisions: [
              ...q.revisions,
              { revisionNo: newRevNo, date: new Date().toISOString().slice(0, 10), changedBy: currentUser, note },
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

  const convertToSalesOrder = useCallback(
    (quotationId: string): string => {
      const q = quotations.find((x) => x.id === quotationId);
      if (!q) return "";
      const soId = nextId("SO");
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
        stages: [
          { stage: "quotation", status: "completed", completedDate: new Date().toISOString().slice(0, 10), responsibleRole: "Sales" },
          { stage: "customer_confirmation", status: "in_progress", responsibleRole: "Sales", pendingAction: "Awaiting signed PO from customer" },
          { stage: "internal_verification", status: "pending", responsibleRole: "Factory Technical" },
          { stage: "deposit", status: "pending", responsibleRole: "Finance" },
          { stage: "production", status: "pending", responsibleRole: "Production" },
          { stage: "packing", status: "pending", responsibleRole: "Logistics" },
          { stage: "inspection", status: "pending", responsibleRole: "QC" },
          { stage: "shipment", status: "pending", responsibleRole: "Logistics" },
          { stage: "final_payment", status: "pending", responsibleRole: "Finance" },
          { stage: "documents", status: "pending", responsibleRole: "Sales" },
          { stage: "completed", status: "pending", responsibleRole: "—" },
        ],
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
