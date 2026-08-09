import { describe, it, expect } from "vitest";
import { buildNotifications } from "./notifications";
import type { InspectionRecord, PaymentRecord, Quotation, SalesOrder } from "./types";

const TODAY = "2026-08-09";

const empty = { quotations: [], salesOrders: [], payments: [], inspections: [] };

function order(patch: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: "SO-0001",
    customerId: "CUST-001",
    consignee: "Acme",
    country: "PH",
    currency: "USD",
    orderValue: 1000,
    orderDate: "2026-07-01",
    requestedDeliveryDate: "2026-09-01",
    currentStage: "production",
    priority: "normal",
    assignedSalesperson: "Grace Tan",
    stages: [],
    productionStatus: "in_production",
    productionQtyOrdered: 10,
    productionQtyCompleted: 0,
    productionQtyRejected: 0,
    ...patch,
  } as SalesOrder;
}

function payment(patch: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "PAY-001",
    salesOrderId: "SO-0001",
    type: "deposit",
    expectedAmount: 1000,
    amountReceived: 0,
    status: "expected",
    ...patch,
  };
}

function quotation(patch: Partial<Quotation> = {}): Quotation {
  return {
    id: "PI-33007",
    revisionNo: 0,
    revisions: [],
    customerId: "CUST-001",
    consignee: "Acme",
    status: "draft",
    currency: "USD",
    validityDays: 7,
    issueDate: "2026-08-01",
    paymentTerms: "TT",
    leadTimeWeeks: 4,
    estimatedShipmentDate: "2026-09-01",
    items: [],
    freight: 0,
    discount: 0,
    tax: 0,
    depositPercent: 30,
    assignedSalesperson: "Grace Tan",
    remarks: "",
    ...patch,
  } as Quotation;
}

function inspection(patch: Partial<InspectionRecord> = {}): InspectionRecord {
  return {
    id: "QC-0001",
    salesOrderId: "SO-0001",
    inspector: "",
    result: "pending",
    cartonsChecked: 0,
    defectsFound: 0,
    remarks: "",
    ...patch,
  };
}

describe("buildNotifications", () => {
  it("says nothing when there is nothing to act on", () => {
    expect(buildNotifications(empty, TODAY)).toEqual([]);
  });

  it("leads with blocked orders and carries the blocker through", () => {
    const n = buildNotifications(
      {
        ...empty,
        salesOrders: [
          order({ stages: [{ stage: "inspection", status: "blocked", blocker: "Failed inspection" }] as never }),
        ],
      },
      TODAY
    );
    expect(n).toHaveLength(1);
    expect(n[0].tone).toBe("alert");
    expect(n[0].detail).toBe("Failed inspection");
    expect(n[0].href).toBe("/orders/SO-0001");
  });

  it("copes with a blocked stage that has no reason recorded", () => {
    const n = buildNotifications(
      { ...empty, salesOrders: [order({ stages: [{ stage: "packing", status: "blocked" }] as never })] },
      TODAY
    );
    expect(n[0].detail).toBe("Blocked, no reason recorded");
  });

  it("raises overdue payments as alerts", () => {
    const n = buildNotifications({ ...empty, payments: [payment({ status: "overdue", dueDate: "2026-07-01" })] }, TODAY);
    expect(n[0].tone).toBe("alert");
    expect(n[0].href).toBe("/payments");
  });

  it("raises payments waiting for approval, naming who it is routed to", () => {
    const n = buildNotifications(
      {
        ...empty,
        payments: [
          payment({
            approval: {
              state: "pending_approval",
              author: "Grace Tan",
              authoredDate: "2026-08-01",
              intendedApprover: "Marcus Reyes",
            },
          }),
        ],
      },
      TODAY
    );
    expect(n[0].detail).toBe("Raised by Grace Tan, routed to Marcus Reyes");
  });

  it("says nothing about a payment that is already approved", () => {
    const n = buildNotifications(
      {
        ...empty,
        payments: [payment({ approval: { state: "approved", author: "Grace Tan", authoredDate: "2026-08-01" } })],
      },
      TODAY
    );
    expect(n).toEqual([]);
  });

  it("says nothing about legacy payments that carry no approval block", () => {
    expect(buildNotifications({ ...empty, payments: [payment()] }, TODAY)).toEqual([]);
  });

  it("flags quotations waiting for approval using the revised reference", () => {
    const n = buildNotifications(
      { ...empty, quotations: [quotation({ status: "for_approval", revisionNo: 2 })] },
      TODAY
    );
    expect(n[0].title).toContain("PI-33007-R2");
    expect(n[0].href).toBe("/quotations/PI-33007");
  });

  it("flags a sent quotation whose validity has passed", () => {
    const n = buildNotifications(
      { ...empty, quotations: [quotation({ status: "sent", validityDate: "2026-08-01" })] },
      TODAY
    );
    expect(n).toHaveLength(1);
    expect(n[0].title).toContain("passed its validity");
  });

  it("does not chase a draft for expiring, because a draft is not out with anyone", () => {
    const n = buildNotifications(
      { ...empty, quotations: [quotation({ status: "draft", validityDate: "2026-08-01" })] },
      TODAY
    );
    expect(n).toEqual([]);
  });

  it("does not flag a quotation whose validity is still ahead", () => {
    const n = buildNotifications(
      { ...empty, quotations: [quotation({ status: "sent", validityDate: "2026-08-20" })] },
      TODAY
    );
    expect(n).toEqual([]);
  });

  it("treats a validity falling on today as still valid", () => {
    const n = buildNotifications({ ...empty, quotations: [quotation({ status: "sent", validityDate: TODAY })] }, TODAY);
    expect(n).toEqual([]);
  });

  it("mentions inspections still to be done", () => {
    const n = buildNotifications({ ...empty, inspections: [inspection()] }, TODAY);
    expect(n[0].tone).toBe("info");
    expect(n[0].href).toBe("/inspection");
  });

  it("says nothing about an inspection that already has a result", () => {
    expect(buildNotifications({ ...empty, inspections: [inspection({ result: "pass" })] }, TODAY)).toEqual([]);
  });

  it("orders alerts before warnings before information", () => {
    const n = buildNotifications(
      {
        quotations: [quotation({ status: "for_approval" })],
        salesOrders: [order({ stages: [{ stage: "packing", status: "blocked", blocker: "Short" }] as never })],
        payments: [],
        inspections: [inspection()],
      },
      TODAY
    );
    expect(n.map((x) => x.tone)).toEqual(["alert", "warning", "info"]);
  });
});
