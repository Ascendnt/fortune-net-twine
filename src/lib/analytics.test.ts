import { describe, it, expect } from "vitest";
import {
  activeCustomers,
  availablePeriods,
  collectionByMethod,
  conversionByCustomer,
  convertedOrders,
  customerByYear,
  headlineMetrics,
  issuedQuotations,
  makePeriod,
  materialOf,
  materialBreakdown,
  monthOnMonth,
  monthlyOrderValue,
  periodLabel,
  receivablesAging,
  shipmentCycleDays,
} from "./analytics";
import type { Customer, PaymentRecord, Quotation, SalesOrder, Shipment } from "./types";

function item(over: Partial<Quotation["items"][number]> = {}) {
  return {
    id: "L1",
    itemCode: "NET-96-210-20-350",
    description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net',
    specification: "122md x 50fl",
    qtyPcs: 4,
    unit: "PCS",
    unitPrice: 1000,
    weightKg: 100,
    totalPrice: 4000,
    ...over,
  } as Quotation["items"][number];
}

function quotation(over: Partial<Quotation> = {}): Quotation {
  return {
    id: "PI-1",
    revisionNo: 0,
    revisions: [],
    customerId: "CUST-1",
    consignee: "Acme",
    status: "sent",
    currency: "USD",
    validityDays: 10,
    issueDate: "2026-06-10",
    paymentTerms: "30% DP",
    leadTimeWeeks: 6,
    estimatedShipmentDate: "2026-09-01",
    items: [item()],
    freight: 0,
    discount: 0,
    tax: 0,
    depositPercent: 30,
    assignedSalesperson: "Grace Tan",
    ...over,
  } as Quotation;
}

function order(over: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: "SO-1",
    quotationId: "PI-1",
    customerId: "CUST-1",
    consignee: "Acme",
    country: "Norway",
    currency: "USD",
    orderValue: 4000,
    orderDate: "2026-06-20",
    requestedDeliveryDate: "2026-09-01",
    currentStage: "production",
    priority: "standard",
    assignedSalesperson: "Grace Tan",
    stages: [],
    productionStatus: "in_production",
    productionQtyOrdered: 4,
    productionQtyCompleted: 0,
    productionQtyRejected: 0,
    ...over,
  } as SalesOrder;
}

const customers = [
  { id: "CUST-1", name: "Acme Nets", country: "Norway" },
  { id: "CUST-2", name: "Sumipesca S.A.", country: "Spain" },
] as Customer[];

const JUNE = makePeriod("2026-06");

describe("periods", () => {
  it("labels a month and a year the way the deck writes them", () => {
    expect(periodLabel("2026-06")).toBe("June 2026");
    expect(periodLabel("2026")).toBe("2026");
  });

  it("offers only periods the data covers, newest first", () => {
    const periods = availablePeriods(
      "month",
      [quotation({ issueDate: "2026-04-02" })],
      [order({ orderDate: "2026-06-20" })],
      "2026-06-30"
    );
    expect(periods.map((p) => p.key)).toEqual(["2026-06", "2026-04"]);
  });

  it("always offers the current period, even with nothing in it", () => {
    const periods = availablePeriods("month", [], [], "2026-08-13");
    expect(periods.map((p) => p.key)).toEqual(["2026-08"]);
  });
});

describe("issuedQuotations and convertedOrders", () => {
  it("counts value and weight for the period", () => {
    const summary = issuedQuotations([quotation(), quotation({ id: "PI-2", issueDate: "2026-05-01" })], JUNE);
    expect(summary.count).toBe(1);
    expect(summary.value).toBe(4000);
    expect(summary.weightKg).toBe(100);
  });

  it("attributes an order to the month it was confirmed, not the month it was quoted", () => {
    // A PI issued in May and won in June is June's win. Crediting May would compare a month's
    // conversion against quotations it never closed.
    const orders = [order({ orderDate: "2026-06-20" })];
    const quotes = [quotation({ issueDate: "2026-05-02" })];
    expect(convertedOrders(orders, quotes, JUNE).count).toBe(1);
    expect(issuedQuotations(quotes, JUNE).count).toBe(0);
  });

  it("carries the order's weight through from its quotation", () => {
    expect(convertedOrders([order()], [quotation()], JUNE).weightKg).toBe(100);
  });
});

describe("conversionByCustomer", () => {
  it("keeps a customer who was quoted but did not order", () => {
    // Deleting them would remove exactly the rows the sales meeting is about.
    const rows = conversionByCustomer(
      [quotation({ customerId: "CUST-2", id: "PI-9" })],
      [],
      customers,
      JUNE
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].orderValue).toBe(0);
    expect(rows[0].conversionPct).toBe(0);
  });

  it("computes the rate as order value over quoted value", () => {
    const rows = conversionByCustomer([quotation()], [order({ orderValue: 2000 })], customers, JUNE);
    expect(rows[0].conversionPct).toBeCloseTo(50, 10);
  });

  it("reports over 100% when an earlier quotation lands in this period", () => {
    const rows = conversionByCustomer([], [order({ orderValue: 5000 })], customers, JUNE);
    expect(rows[0].orderValue).toBe(5000);
    // Nothing was quoted in the period, so there is no denominator and no rate to state.
    expect(rows[0].conversionPct).toBe(0);
  });

  it("does not divide by zero", () => {
    expect(conversionByCustomer([], [order({ orderValue: 0 })], customers, JUNE)[0].conversionPct).toBe(0);
  });
});

describe("monthlyOrderValue", () => {
  const orders = [
    order({ id: "a", orderDate: "2025-03-04", orderValue: 100 }),
    order({ id: "b", orderDate: "2026-03-04", orderValue: 250 }),
    order({ id: "c", orderDate: "2026-03-20", orderValue: 50 }),
  ];

  it("sums each month for each year", () => {
    const points = monthlyOrderValue(orders, ["2025", "2026"]);
    const march = points.find((p) => p.month === "Mar")!;
    expect(march.values["2025"]).toBe(100);
    expect(march.values["2026"]).toBe(300);
  });

  it("reports a real zero for a month inside the data that had no orders", () => {
    expect(monthlyOrderValue(orders, ["2025"]).find((p) => p.month === "Jan")!.values["2025"]).toBe(0);
  });

  it("reports null beyond the last month there is data for, so the chart breaks rather than crashes to zero", () => {
    const points = monthlyOrderValue(orders, ["2026"]);
    expect(points.find((p) => p.month === "Dec")!.values["2026"]).toBeNull();
  });
});

describe("monthOnMonth", () => {
  const orders = [
    order({ id: "a", orderDate: "2025-06-10", orderValue: 1000 }),
    order({ id: "b", orderDate: "2026-05-10", orderValue: 800 }),
    order({ id: "c", orderDate: "2026-06-10", orderValue: 500 }),
    order({ id: "d", orderDate: "2026-01-10", orderValue: 200 }),
    order({ id: "e", orderDate: "2025-01-10", orderValue: 100 }),
  ];

  it("states the same month a year ago, last month, and the year to date", () => {
    const rows = monthOnMonth(orders, JUNE);
    expect(rows).toHaveLength(3);
    expect(rows[0].from).toBe(1000);
    expect(rows[0].to).toBe(500);
    expect(rows[0].percent).toBeCloseTo(-50, 10);
    expect(rows[1].from).toBe(800);
    expect(rows[1].to).toBe(500);
    // Year to date is Jan–Jun in both years: 100+1000 against 200+800+500.
    expect(rows[2].from).toBe(1100);
    expect(rows[2].to).toBe(1500);
  });

  it("rolls January back into the previous December rather than month zero", () => {
    const rows = monthOnMonth(orders, makePeriod("2026-01"));
    expect(rows[1].label).toContain("December 2025");
  });

  it("compares whole years when the period is a year", () => {
    const rows = monthOnMonth(orders, makePeriod("2026"));
    expect(rows).toHaveLength(1);
    expect(rows[0].from).toBe(1100);
    expect(rows[0].to).toBe(1500);
  });

  it("reports no percentage at all when there was nothing to compare against", () => {
    // Not zero. Zero would read as "unchanged", which is a different and untrue statement.
    expect(monthOnMonth([], JUNE).every((r) => r.percent === null)).toBe(true);
  });

  it("still reports the difference when only one side has figures", () => {
    const rows = monthOnMonth([order({ orderDate: "2026-06-10", orderValue: 500 })], JUNE);
    expect(rows[0].difference).toBe(500);
    expect(rows[0].percent).toBeNull();
  });
});

describe("customerByYear", () => {
  const orders = [
    order({ id: "a", customerId: "CUST-1", orderDate: "2024-02-01", orderValue: 100 }),
    order({ id: "b", customerId: "CUST-1", orderDate: "2025-02-01", orderValue: 300 }),
    order({ id: "c", customerId: "CUST-1", orderDate: "2026-02-01", orderValue: 400 }),
  ];

  it("excludes the year under test from its own benchmark", () => {
    // Average of 100 and 300 is 200; 400 against that is +100%. Including 2026 would make the
    // average 266.67 and understate the improvement.
    const [row] = customerByYear(orders, customers, ["2024", "2025", "2026"]);
    expect(row.averagePrior).toBe(200);
    expect(row.diffVsAveragePct).toBeCloseTo(100, 10);
  });

  it("drops customers with no history in the span", () => {
    expect(customerByYear(orders, customers, ["2020", "2021"])).toHaveLength(0);
  });

  it("does not divide by zero for a customer with no prior years", () => {
    const [row] = customerByYear(orders, customers, ["2026"]);
    expect(row.averagePrior).toBe(0);
    expect(row.diffVsAveragePct).toBe(0);
  });
});

describe("materialOf", () => {
  it("reads the family off the line's own description", () => {
    expect(materialOf({ description: 'No.96(210/20x16) 3-1/2" Nylon Braided Net' })).toBe("Nylon");
    expect(materialOf({ description: 'No.42(250/08x16) 8" Hi-Ex Braided Net' })).toBe("Polyethylene");
    expect(materialOf({ description: "Polyester twisted net" })).toBe("Polyester");
  });

  it("rolls the plant's polyethylene grades into one family, as the deck does", () => {
    for (const d of ["HDPE net", "HTPE twine", "H-Ex Lacing Twine, Tarred", "Polyethylene rope"]) {
      expect(materialOf({ description: d }), d).toBe("Polyethylene");
    }
  });

  it("says Other rather than guessing", () => {
    expect(materialOf({ description: "Steel shackle" })).toBe("Other");
  });
});

describe("materialBreakdown", () => {
  it("splits order value by family and shares it out", () => {
    const q = quotation({
      items: [
        item({ id: "L1", description: "Nylon Braided Net", totalPrice: 750, weightKg: 75 }),
        item({ id: "L2", description: "Hi-Ex Braided Net", totalPrice: 250, weightKg: 25 }),
      ],
    });
    const rows = materialBreakdown([order()], [q], JUNE);
    expect(rows.map((r) => r.material)).toEqual(["Nylon", "Polyethylene"]);
    expect(rows[0].sharePct).toBeCloseTo(75, 10);
    expect(rows[1].weightKg).toBe(25);
  });

  it("is empty rather than throwing when the period has no orders", () => {
    expect(materialBreakdown([], [], JUNE)).toEqual([]);
  });
});

describe("shipmentCycleDays", () => {
  const shipments = [
    { id: "SH-1", salesOrderId: "SO-1", etd: "2026-06-30", bookedDate: "2026-06-25" } as Shipment,
  ];

  it("measures confirmation to actual departure", () => {
    const result = shipmentCycleDays([order({ orderDate: "2026-06-20" })], shipments, JUNE);
    expect(result.shipped).toBe(1);
    expect(result.averageDays).toBe(10);
  });

  it("ignores a shipment that has not departed rather than counting it as instant", () => {
    const notGone = [{ id: "SH-2", salesOrderId: "SO-1", bookedDate: "2026-06-25" } as Shipment];
    expect(shipmentCycleDays([order()], notGone, JUNE).shipped).toBe(0);
  });
});

describe("headlineMetrics", () => {
  it("counts what is open now, not what happened in a period", () => {
    const orders = [
      order({ id: "a", currentStage: "packing", requestedDeliveryDate: "2026-01-01" }),
      order({ id: "b", currentStage: "completed" }),
    ];
    const metrics = headlineMetrics(orders, [quotation({ status: "sent" })], [], "2026-08-13");
    expect(metrics.activeSalesOrders).toBe(1);
    expect(metrics.piPendingConfirmation).toBe(1);
    expect(metrics.nearOrReadyShipment).toBe(1);
    expect(metrics.pastDueShipment).toBe(1);
  });

  it("does not call an order past due once it has shipped", () => {
    const orders = [order({ currentStage: "documents", requestedDeliveryDate: "2026-01-01" })];
    expect(headlineMetrics(orders, [], [], "2026-08-13").pastDueShipment).toBe(0);
  });

  it("leaves completed orders out of the collection rate", () => {
    // Completed orders are paid by definition and would drag the rate to 100%, which is the one
    // thing it must not do.
    const payments = [
      { id: "p1", salesOrderId: "SO-done", type: "balance", expectedAmount: 1000, amountReceived: 1000, status: "verified" },
      { id: "p2", salesOrderId: "SO-live", type: "balance", expectedAmount: 1000, amountReceived: 250, status: "expected" },
    ] as PaymentRecord[];
    const orders = [order({ id: "SO-done", currentStage: "completed" }), order({ id: "SO-live" })];
    expect(headlineMetrics(orders, [], payments).collectionRatePct).toBeCloseTo(25, 10);
  });
});

describe("receivablesAging", () => {
  const payments = [
    { id: "p1", salesOrderId: "SO-1", type: "balance", expectedAmount: 1000, amountReceived: 0, status: "expected", dueDate: "2026-08-01" },
    { id: "p2", salesOrderId: "SO-1", type: "balance", expectedAmount: 500, amountReceived: 0, status: "overdue", dueDate: "2026-01-01" },
  ] as PaymentRecord[];

  it("ages from the due date, not from today alone", () => {
    const [row] = receivablesAging(customers, [order()], payments, "2026-08-13");
    expect(row.d0_30).toBe(1000);
    expect(row.d90_plus).toBe(500);
    expect(row.total).toBe(1500);
  });

  it("counts only what is still outstanding on a part-paid line", () => {
    const part = [{ ...payments[0], amountReceived: 400 }] as PaymentRecord[];
    expect(receivablesAging(customers, [order()], part, "2026-08-13")[0].total).toBe(600);
  });

  it("drops verified and rejected lines", () => {
    const settled = [{ ...payments[0], status: "verified" }] as PaymentRecord[];
    expect(receivablesAging(customers, [order()], settled, "2026-08-13")).toEqual([]);
  });
});

describe("collectionByMethod", () => {
  it("groups verified money by channel, largest first", () => {
    const payments = [
      { id: "a", salesOrderId: "SO-1", type: "deposit", expectedAmount: 100, amountReceived: 100, status: "verified", method: "Wire Transfer" },
      { id: "b", salesOrderId: "SO-1", type: "balance", expectedAmount: 300, amountReceived: 300, status: "verified", method: "Telegraphic Transfer" },
      { id: "c", salesOrderId: "SO-1", type: "balance", expectedAmount: 50, amountReceived: 0, status: "expected", method: "Wire Transfer" },
    ] as PaymentRecord[];
    expect(collectionByMethod(payments)).toEqual([
      { method: "Telegraphic Transfer", amount: 300, count: 1 },
      { method: "Wire Transfer", amount: 100, count: 1 },
    ]);
  });
});

describe("activeCustomers", () => {
  it("counts a customer once whether they quoted, ordered, or both", () => {
    expect(activeCustomers([quotation()], [order()], JUNE)).toBe(1);
  });
});
