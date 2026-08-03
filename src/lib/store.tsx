import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
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
} from "./mockData";

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

let idCounter = 1000;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("sales_manager");
  const [quotations, setQuotations] = useState<Quotation[]>(QUOTATIONS);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(SALES_ORDERS);
  const [payments, setPayments] = useState<PaymentRecord[]>(PAYMENTS);
  const [invoices, setInvoices] = useState<CommercialInvoice[]>(INVOICES);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(APPROVALS);
  const [activity, setActivity] = useState<ActivityEntry[]>(ACTIVITY);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>(PRICING_RULES);
  const [lookupTables, setLookupTables] = useState<LookupTable[]>(LOOKUP_TABLES);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
