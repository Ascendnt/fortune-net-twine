import { describe, expect, it } from "vitest";
import { emptyPricing, newBatch, newSpecLine } from "./batches";
import { LOOKUP_TABLES, PRICING_RULES } from "./mockData";
import { SPEC_MASTER } from "./specMaster";
import { batchTotal, batchWeight, quotationTotals, recomputeSpecLine, resolveDiscount, totalsFromItems } from "./totals";
import type { QuotationBatch, SpecLine } from "./types";

const N1596 = SPEC_MASTER.find((r) => r.code === "N-1596")!;

function pricedLine(over: Partial<SpecLine> = {}): SpecLine {
  return { ...newSpecLine(N1596), givenPriceKg: 5, qtyPcs: 10, ...over };
}

function normalBatch(specs: SpecLine[], id = "b1"): QuotationBatch {
  return {
    id,
    type: "normal",
    items: [
      {
        id: `${id}-i1`,
        specification: "NYLON BRAIDED NET SK DSTB DWS",
        material: "Nylon",
        netType: "Braided Net",
        weightUom: "KG",
        qtyUom: "PCS",
        specs,
      },
    ],
  };
}

describe("recomputeSpecLine", () => {
  it("resolves the mesh-depth lookup from the row's own 122MD field", () => {
    const line = recomputeSpecLine(
      { ...pricedLine(), pricing: { ...emptyPricing(5), appliedRuleIds: ["r_md"] } },
      PRICING_RULES,
      LOOKUP_TABLES
    );
    // Doc §5.2 row 6: base 5.0000 + MD -> 5.1750, x 495 -> 2,561.6250, x 10 -> 25,616.25
    expect(line.pricing.newPriceKg).toBeCloseTo(5.175, 4);
    expect(line.unitPrice).toBeCloseTo(2561.625, 3);
    expect(line.amount).toBeCloseTo(25616.25, 2);
    expect(line.weightKg).toBeCloseTo(4950, 2);
  });

  it("leaves the price at Given when no rule is applied, doc §5.1 row 1", () => {
    const line = recomputeSpecLine(pricedLine(), PRICING_RULES, LOOKUP_TABLES);
    expect(line.pricing.newPriceKg).toBe(5);
    expect(line.unitPrice).toBeCloseTo(2475, 2);
    expect(line.amount).toBeCloseTo(24750, 2);
  });

  it("keeps the Given Price and the pricing snapshot in step", () => {
    const line = recomputeSpecLine(pricedLine({ givenPriceKg: 11.6 }), PRICING_RULES, LOOKUP_TABLES);
    expect(line.pricing.givenPriceKg).toBe(11.6);
  });

  it("adds insurance as a percentage of the running total", () => {
    const line = recomputeSpecLine(
      { ...pricedLine(), pricing: { ...emptyPricing(5), appliedRuleIds: ["r_ins"] } },
      PRICING_RULES,
      LOOKUP_TABLES
    );
    expect(line.pricing.newPriceKg).toBeCloseTo(5.033, 4);
  });

  it("resolves an unlisted float length to the default rate rather than the first bucket", () => {
    const odd = { ...pricedLine(), length: "42FL", pricing: { ...emptyPricing(5), appliedRuleIds: ["r_dw"] } };
    expect(recomputeSpecLine(odd, PRICING_RULES, LOOKUP_TABLES).pricing.newPriceKg).toBe(5);
  });
});

describe("batch roll-ups", () => {
  it("sums spec amounts across the items in a batch", () => {
    const batch = normalBatch([pricedLine({ id: "a", amount: 100, weightKg: 10 }), pricedLine({ id: "b", amount: 250, weightKg: 25 })]);
    expect(batchTotal(batch)).toBe(350);
    expect(batchWeight(batch)).toBe(35);
  });

  it("treats a group with no items as zero rather than throwing", () => {
    expect(batchTotal({ id: "e", type: "normal" })).toBe(0);
    expect(batchWeight({ id: "e", type: "lacing" })).toBe(0);
  });

  it("counts lacing twine KGS as weight but a flat charge as none", () => {
    const lacing: QuotationBatch = {
      id: "l",
      type: "lacing",
      lacing: [
        { id: "l1", code: "LC-001", description: "Lacing Twine Nylon Tarred", kind: "twine", kgs: 100, rate: 2.5, amount: 250 },
        { id: "l2", code: "LC-006", description: "Lacing Charge", kind: "charge", kgs: 0, rate: 50, amount: 50 },
      ],
    };
    expect(batchTotal(lacing)).toBe(300);
    expect(batchWeight(lacing)).toBe(100);
  });

  it("treats an empty batch of any type as zero", () => {
    for (const type of ["assembled", "normal", "lacing"] as const) {
      expect(batchTotal(newBatch(type))).toBe(0);
      expect(batchWeight(newBatch(type))).toBe(0);
    }
  });
});

describe("discount mode", () => {
  it("treats a discount without a mode as money, so older records are unaffected", () => {
    expect(resolveDiscount(1000, 150)).toBe(150);
    expect(resolveDiscount(1000, 150, "amount")).toBe(150);
  });

  it("resolves a percentage against the items total", () => {
    expect(resolveDiscount(1000, 12)).toBe(12);
    expect(resolveDiscount(1000, 12, "percent")).toBe(120);
  });

  it("subtracts the resolved percentage from the grand total", () => {
    const batch = normalBatch([pricedLine({ id: "a", amount: 1000, weightKg: 10 })]);
    const asAmount = quotationTotals([batch], 0, 10, 0, "amount");
    const asPercent = quotationTotals([batch], 0, 10, 0, "percent");
    expect(asAmount.discountValue).toBe(10);
    expect(asAmount.grandTotal).toBe(990);
    expect(asPercent.discountValue).toBe(100);
    expect(asPercent.grandTotal).toBe(900);
  });

  it("reports the resolved discount so the UI never recomputes it separately", () => {
    const batch = normalBatch([pricedLine({ id: "a", amount: 250, weightKg: 5 })]);
    expect(quotationTotals([batch], 0, 20, 0, "percent").discountValue).toBe(50);
  });
});

describe("quotation roll-up, doc §6 end-to-end", () => {
  // Built in the live app: a NORMAL N-1596 line at Given 5.00 with MD Computation, qty 10;
  // a LACING group of LC-001 (100 KGS, 250.00) and LC-006 (50.00); and an empty ASSEMBLED group.
  // Observed: TOTAL WEIGHT 5,050.00 KGS, GRAND TOTAL $25,916.25.
  // (The doc's run also carried a NOTE group, which contributed nothing to either figure. NOTE
  // groups no longer exist, so the expected totals are unchanged.)
  const priced = recomputeSpecLine(
    { ...pricedLine(), pricing: { ...emptyPricing(5), appliedRuleIds: ["r_md"] } },
    PRICING_RULES,
    LOOKUP_TABLES
  );

  const batches: QuotationBatch[] = [
    normalBatch([priced]),
    {
      id: "b2",
      type: "lacing",
      lacing: [
        { id: "l1", code: "LC-001", description: "Lacing Twine Nylon Tarred", kind: "twine", kgs: 100, rate: 2.5, amount: 250 },
        { id: "l2", code: "LC-006", description: "Lacing Charge", kind: "charge", kgs: 0, rate: 50, amount: 50 },
      ],
    },
    { id: "b3", type: "assembled", title: "COMPLETE SOCCER GOAL NET ASSEMBLY", items: [] },
  ];

  it("matches the observed grand total and total weight", () => {
    const t = quotationTotals(batches);
    expect(t.totalWeightKg).toBeCloseTo(5050, 2);
    expect(t.grandTotal).toBeCloseTo(25916.25, 2);
  });

  it("applies freight, discount and tax to the grand total but not the items total", () => {
    const t = quotationTotals(batches, 500, 200, 75);
    expect(t.itemsTotal).toBeCloseTo(25916.25, 2);
    expect(t.grandTotal).toBeCloseTo(26291.25, 2);
  });

  it("agrees with the same roll-up taken over the flattened line list", () => {
    const tree = quotationTotals(batches, 100, 50, 25);
    const flat = totalsFromItems(
      [
        { id: "1", itemCode: "N-1596", description: "", specification: "", qtyPcs: 10, unit: "PCS", unitPrice: priced.unitPrice, weightKg: 4950, totalPrice: priced.amount },
        { id: "2", itemCode: "LC-001", description: "", specification: "", qtyPcs: 100, unit: "KG", unitPrice: 2.5, weightKg: 100, totalPrice: 250 },
        { id: "3", itemCode: "LC-006", description: "", specification: "", qtyPcs: 1, unit: "KG", unitPrice: 50, weightKg: 0, totalPrice: 50 },
      ],
      100,
      50,
      25
    );
    expect(flat.grandTotal).toBeCloseTo(tree.grandTotal, 6);
    expect(flat.totalWeightKg).toBeCloseTo(tree.totalWeightKg, 6);
  });
});
