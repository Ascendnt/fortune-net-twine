import { describe, it, expect } from "vitest";
import {
  actualAmountFor,
  buildInspectionLines,
  groupInspectionLines,
  isSuspiciousVariance,
  pricePerKg,
  settleInspection,
  settlementByOrder,
  weightVerdict,
} from "./inspectionPricing";
import type { InspectionLine, PackingList, QuotationLineItem } from "./types";

function line(over: Partial<InspectionLine> = {}): InspectionLine {
  return {
    id: "INSL-1",
    salesOrderId: "SO-1",
    itemId: "LI-1",
    itemCode: "N-1596",
    description: "Nylon braided net",
    baleNo: "1",
    qtyPcs: 10,
    computedWeightKg: 100,
    netWeightKg: 100,
    grossWeightKg: 102,
    pricePerKg: 5,
    quotedAmount: 500,
    ...over,
  };
}

describe("pricePerKg", () => {
  it("derives the agreed rate from the quoted amount and weight", () => {
    expect(pricePerKg({ totalPrice: 500, weightKg: 100 })).toBe(5);
  });

  it("returns zero when there is no weight to price against", () => {
    // A lacing or twine row sold by the piece. Repricing it by weight would zero it out.
    expect(pricePerKg({ totalPrice: 500, weightKg: 0 })).toBe(0);
    expect(pricePerKg({ totalPrice: 500, weightKg: -1 })).toBe(0);
    expect(pricePerKg({ totalPrice: 500, weightKg: Number.NaN })).toBe(0);
  });
});

describe("actualAmountFor", () => {
  it("leaves the amount alone when the weight came out exactly as quoted", () => {
    expect(actualAmountFor(line())).toBe(500);
  });

  it("bills the extra kilos at the agreed rate when the goods come out heavy", () => {
    expect(actualAmountFor(line({ netWeightKg: 105 }))).toBe(525);
  });

  it("bills less when the goods come out light", () => {
    expect(actualAmountFor(line({ netWeightKg: 96 }))).toBe(480);
  });

  it("keeps the quoted amount for a line that was never sold by weight", () => {
    expect(actualAmountFor(line({ pricePerKg: 0, computedWeightKg: 0, netWeightKg: 0 }))).toBe(500);
  });

  it("does not round mid-calculation", () => {
    // 100.7 x 25.61625/kg, the sort of figure that goes wrong if the rate is rounded first.
    const amount = actualAmountFor(line({ pricePerKg: 25.61625, quotedAmount: 2561.625, netWeightKg: 100.7 }));
    expect(amount).toBeCloseTo(2579.556, 3);
  });
});

describe("settleInspection", () => {
  const lines = [
    line({ id: "a", computedWeightKg: 100, netWeightKg: 104, quotedAmount: 500 }),
    line({ id: "b", computedWeightKg: 200, netWeightKg: 196, quotedAmount: 1000 }),
  ];

  it("totals the computed and the measured side by side", () => {
    const s = settleInspection(lines);
    expect(s.quotedValue).toBe(1500);
    // 104 x 5.00 = 520, 196 x 5.00 = 980.
    expect(s.actualValue).toBe(1500);
    expect(s.computedWeightKg).toBe(300);
    expect(s.netWeightKg).toBe(300);
  });

  it("reports the difference and its percentage", () => {
    const s = settleInspection([line({ netWeightKg: 110 })]);
    expect(s.difference).toBe(50);
    expect(s.differencePct).toBeCloseTo(10, 10);
  });

  it("reports a negative difference when the shipment came out light", () => {
    const s = settleInspection([line({ netWeightKg: 90 })]);
    expect(s.difference).toBe(-50);
    expect(s.differencePct).toBeCloseTo(-10, 10);
  });

  it("states the weight difference the way the printed report does", () => {
    // The Remarks block at the foot of the sheet: computed against net, and the percentage.
    const s = settleInspection([line({ computedWeightKg: 100, netWeightKg: 99.65 })]);
    expect(s.weightDifferenceKg).toBeCloseTo(-0.35, 10);
    expect(s.weightDifferencePct).toBeCloseTo(-0.35, 10);
  });

  it("adds up gross weight alongside net, because the report carries both", () => {
    expect(settleInspection([line({ grossWeightKg: 102 }), line({ grossWeightKg: 98 })]).grossWeightKg).toBe(200);
  });

  it("does not divide by zero on an order with no value", () => {
    const s = settleInspection([line({ quotedAmount: 0, pricePerKg: 0, computedWeightKg: 0, netWeightKg: 0 })]);
    expect(s.differencePct).toBe(0);
    expect(s.weightDifferencePct).toBe(0);
  });

  it("is all zeroes for an empty sheet", () => {
    expect(settleInspection([])).toEqual({
      quotedValue: 0,
      actualValue: 0,
      difference: 0,
      differencePct: 0,
      computedWeightKg: 0,
      netWeightKg: 0,
      grossWeightKg: 0,
      weightDifferenceKg: 0,
      weightDifferencePct: 0,
    });
  });
});

describe("weightVerdict", () => {
  it("calls a light load underweight", () => {
    expect(weightVerdict(settleInspection([line({ netWeightKg: 95 })]))).toBe("Underweight");
  });

  it("calls a heavy load overweight", () => {
    expect(weightVerdict(settleInspection([line({ netWeightKg: 105 })]))).toBe("Overweight");
  });

  it("does not make a finding out of rounding", () => {
    expect(weightVerdict(settleInspection([line({ netWeightKg: 100 })]))).toBe("On weight");
    expect(weightVerdict(settleInspection([line({ netWeightKg: 100.001 })]))).toBe("On weight");
  });
});

describe("settlementByOrder", () => {
  it("keeps each order's variance to itself on a consolidated container", () => {
    // Three orders in one container settle three balances. Pooling them would move money between
    // orders that have nothing to do with each other.
    const s = settlementByOrder([
      line({ id: "a", salesOrderId: "SO-1", netWeightKg: 110 }),
      line({ id: "b", salesOrderId: "SO-2", netWeightKg: 90 }),
    ]);
    expect(s["SO-1"].difference).toBe(50);
    expect(s["SO-2"].difference).toBe(-50);
  });
});

describe("groupInspectionLines", () => {
  it("gathers a specification's bales under one heading with its subtotals", () => {
    const groups = groupInspectionLines([
      line({ id: "a", baleNo: "1", qtyPcs: 1, computedWeightKg: 50, netWeightKg: 51, grossWeightKg: 52 }),
      line({ id: "b", baleNo: "2", qtyPcs: 1, computedWeightKg: 50, netWeightKg: 49, grossWeightKg: 50 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].bales.map((b) => b.baleNo)).toEqual(["1", "2"]);
    expect(groups[0].qtyPcs).toBe(2);
    expect(groups[0].netWeightKg).toBe(100);
    expect(groups[0].grossWeightKg).toBe(102);
  });

  it("keeps the same specification apart when it belongs to two different orders", () => {
    // Two orders for the same net is two contracts, priced and settled separately. Merging them
    // would hide which customer's order the weight belongs to.
    const groups = groupInspectionLines([
      line({ id: "a", salesOrderId: "SO-1" }),
      line({ id: "b", salesOrderId: "SO-2" }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("buildInspectionLines", () => {
  const items: Record<string, QuotationLineItem[]> = {
    "SO-1": [
      { id: "LI-1", itemCode: "N-1596", description: "Net", qtyPcs: 10, weightKg: 100, totalPrice: 500 },
    ] as QuotationLineItem[],
    "SO-2": [
      { id: "LI-9", itemCode: "N-2000", description: "Other net", qtyPcs: 4, weightKg: 80, totalPrice: 400 },
    ] as QuotationLineItem[],
  };

  function packingList(over: Partial<PackingList> = {}): PackingList {
    return {
      id: "PL-2026-0001",
      orders: [{ salesOrderId: "SO-1", piRef: "PI-1", scope: "full" }],
      customerId: "CUST-1",
      createdDate: "2026-08-01",
      packedBy: "Elena",
      sections: [
        {
          id: "S1",
          title: "Bales",
          lines: [
            { id: "p1", salesOrderId: "SO-1", itemId: "LI-1", itemCode: "N-1596", description: "Bale 1", baleNo: "1", qtyPcs: 5, netWeightKg: 51, grossWeightKg: 53 },
            { id: "p2", salesOrderId: "SO-1", itemId: "LI-1", itemCode: "N-1596", description: "Bale 2", baleNo: "2", qtyPcs: 5, netWeightKg: 49, grossWeightKg: 51 },
          ],
        },
      ],
      ...over,
    };
  }

  it("writes one row per bale, from what was actually packed", () => {
    const lines = buildInspectionLines(packingList(), items);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.baleNo)).toEqual(["1", "2"]);
  });

  it("seeds the weights from the packing list, where the goods were weighed", () => {
    const [first] = buildInspectionLines(packingList(), items);
    expect(first.netWeightKg).toBe(51);
    expect(first.grossWeightKg).toBe(53);
  });

  it("pro-rates the computed weight and amount over the pieces in each bale", () => {
    // Five of a ten-piece line carries half its quoted weight and half its money, not all of it.
    const [first] = buildInspectionLines(packingList(), items);
    expect(first.computedWeightKg).toBe(50);
    expect(first.quotedAmount).toBe(250);
  });

  it("falls back to the computed weight for a bale nobody weighed", () => {
    // A zero would reprice the line to nothing, which is a worse failure than accepting an
    // unweighed figure that the inspector can still correct.
    const list = packingList();
    list.sections[0].lines[0].netWeightKg = 0;
    expect(buildInspectionLines(list, items)[0].netWeightKg).toBe(50);
  });

  it("leaves the order value unchanged when the goods weigh what they were quoted to", () => {
    const list = packingList();
    list.sections[0].lines[0].netWeightKg = 50;
    list.sections[0].lines[1].netWeightKg = 50;
    const s = settleInspection(buildInspectionLines(list, items));
    expect(s.difference).toBeCloseTo(0, 10);
  });

  it("attributes every bale on a consolidated load to the order it belongs to", () => {
    const list = packingList({
      orders: [
        { salesOrderId: "SO-1", piRef: "PI-1", scope: "partial", partialNo: 1 },
        { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
      ],
    });
    list.sections[0].lines.push({
      id: "p3",
      salesOrderId: "SO-2",
      itemId: "LI-9",
      itemCode: "N-2000",
      description: "Bale 3",
      baleNo: "3",
      qtyPcs: 4,
      netWeightKg: 81,
      grossWeightKg: 83,
    });
    const lines = buildInspectionLines(list, items);
    expect(lines.filter((l) => l.salesOrderId === "SO-1")).toHaveLength(2);
    expect(lines.filter((l) => l.salesOrderId === "SO-2")).toHaveLength(1);
    expect(settlementByOrder(lines)["SO-2"].computedWeightKg).toBe(80);
  });

  it("still lists a row typed in by hand that names no order", () => {
    // It is going in the container. A row that appears on no block is a package nobody checks.
    const list = packingList();
    list.sections[0].lines.push({
      id: "p9",
      itemCode: "EXTRA",
      description: "Spare coil",
      qtyPcs: 1,
      netWeightKg: 12,
      grossWeightKg: 13,
    });
    const lines = buildInspectionLines(list, items);
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.itemCode === "EXTRA")?.netWeightKg).toBe(12);
  });
});

describe("isSuspiciousVariance", () => {
  it("stays quiet about the few percent nets normally drift by", () => {
    expect(isSuspiciousVariance(settleInspection([line({ netWeightKg: 103 })]))).toBe(false);
  });

  it("flags a variance large enough to be a misplaced decimal point", () => {
    expect(isSuspiciousVariance(settleInspection([line({ netWeightKg: 1000 })]))).toBe(true);
  });

  it("flags a large variance in either direction", () => {
    expect(isSuspiciousVariance(settleInspection([line({ netWeightKg: 10 })]))).toBe(true);
  });
});
