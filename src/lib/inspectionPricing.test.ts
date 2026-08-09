import { describe, it, expect } from "vitest";
import {
  actualAmountFor,
  buildInspectionLines,
  isSuspiciousVariance,
  pricePerKg,
  settleInspection,
} from "./inspectionPricing";
import type { InspectionLine, QuotationLineItem } from "./types";

function line(over: Partial<InspectionLine> = {}): InspectionLine {
  return {
    id: "INSL-1",
    itemId: "LI-1",
    itemCode: "N-1596",
    description: "Nylon braided net",
    qtyPcs: 10,
    quotedWeightKg: 100,
    actualWeightKg: 100,
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
    // 105 kg at the 5.00/kg the quotation implies.
    expect(actualAmountFor(line({ actualWeightKg: 105 }))).toBe(525);
  });

  it("bills less when the goods come out light", () => {
    expect(actualAmountFor(line({ actualWeightKg: 96 }))).toBe(480);
  });

  it("keeps the quoted amount for a line that was never sold by weight", () => {
    expect(actualAmountFor(line({ quotedWeightKg: 0, actualWeightKg: 0 }))).toBe(500);
  });

  it("does not round mid-calculation", () => {
    // 100.7 x (2561.625/100) — the sort of figure that goes wrong if the rate is rounded first.
    const amount = actualAmountFor(line({ quotedWeightKg: 100, quotedAmount: 2561.625, actualWeightKg: 100.7 }));
    expect(amount).toBeCloseTo(2579.556, 3);
  });
});

describe("settleInspection", () => {
  const lines = [
    line({ id: "a", quotedWeightKg: 100, actualWeightKg: 104, quotedAmount: 500 }),
    line({ id: "b", quotedWeightKg: 200, actualWeightKg: 196, quotedAmount: 1000 }),
  ];

  it("totals the quoted and the actual side by side", () => {
    const s = settleInspection(lines);
    expect(s.quotedValue).toBe(1500);
    // 104 x 5.00 = 520, 196 x 5.00 = 980.
    expect(s.actualValue).toBe(1500);
    expect(s.quotedWeightKg).toBe(300);
    expect(s.actualWeightKg).toBe(300);
  });

  it("reports the difference and its percentage", () => {
    const s = settleInspection([line({ actualWeightKg: 110 })]);
    expect(s.difference).toBe(50);
    expect(s.differencePct).toBeCloseTo(10, 10);
  });

  it("reports a negative difference when the shipment came out light", () => {
    const s = settleInspection([line({ actualWeightKg: 90 })]);
    expect(s.difference).toBe(-50);
    expect(s.differencePct).toBeCloseTo(-10, 10);
  });

  it("does not divide by zero on an order with no value", () => {
    const s = settleInspection([line({ quotedAmount: 0, quotedWeightKg: 0, actualWeightKg: 0 })]);
    expect(s.differencePct).toBe(0);
  });

  it("is all zeroes for an empty sheet", () => {
    expect(settleInspection([])).toEqual({
      quotedValue: 0,
      actualValue: 0,
      difference: 0,
      differencePct: 0,
      quotedWeightKg: 0,
      actualWeightKg: 0,
    });
  });
});

describe("buildInspectionLines", () => {
  const items = [
    { id: "LI-1", itemCode: "N-1596", description: "Net", qtyPcs: 10, weightKg: 100, totalPrice: 500 },
  ] as QuotationLineItem[];

  it("seeds actual weight from the quoted weight, not from zero", () => {
    // An inspector who weighs some lines and saves must not wipe the ones they had not reached.
    const [l] = buildInspectionLines(items);
    expect(l.actualWeightKg).toBe(100);
    expect(l.quotedWeightKg).toBe(100);
  });

  it("carries the quoted amount through for comparison", () => {
    expect(buildInspectionLines(items)[0].quotedAmount).toBe(500);
  });

  it("leaves the order value unchanged when nothing is touched", () => {
    const s = settleInspection(buildInspectionLines(items));
    expect(s.actualValue).toBe(s.quotedValue);
    expect(s.difference).toBe(0);
  });
});

describe("isSuspiciousVariance", () => {
  it("stays quiet about the few percent nets normally drift by", () => {
    expect(isSuspiciousVariance(settleInspection([line({ actualWeightKg: 103 })]))).toBe(false);
  });

  it("flags a variance large enough to be a misplaced decimal point", () => {
    expect(isSuspiciousVariance(settleInspection([line({ actualWeightKg: 1000 })]))).toBe(true);
  });

  it("flags a large variance in either direction", () => {
    expect(isSuspiciousVariance(settleInspection([line({ actualWeightKg: 10 })]))).toBe(true);
  });
});
