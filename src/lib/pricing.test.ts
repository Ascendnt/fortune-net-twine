import { describe, expect, it } from "vitest";
import { computeLinePricing, formatRuleRate } from "./pricing";
import { LOOKUP_TABLES } from "./mockData";
import type { LookupTable, PricingRule } from "./types";

// Every vector below comes from FORTUNE_NET_TWINE_System_Simulation.md, which derived the formulas
// empirically against the live app. The rules and tables here are synthetic and mirror the doc's
// figures exactly, so what's under test is the *engine*, not whatever the seed data happens to hold
// this week. One separate test at the bottom pins the shipped seed.

const RULES: PricingRule[] = [
  { id: "comm3", code: "COMMISSION", label: "Commission 3%", operation: "add", basis: "percent_of_result", rate: 3, sequence: 1, enabled: true },
  { id: "comm5", code: "COMMISSION", label: "Commission 5%", operation: "add", basis: "percent_of_result", rate: 5, sequence: 2, enabled: true },
  { id: "pct5", code: "PERCENTAGE", label: "Markup 5%", operation: "add", basis: "percent_of_base", rate: 5, sequence: 3, enabled: true },
  { id: "amt", code: "AMOUNT", label: "Amount 0.10", operation: "add", basis: "flat_amount", rate: 0.1, sequence: 4, enabled: true },
  { id: "sub5", code: "PERCENTAGE", label: "Less 5%", operation: "subtract", basis: "percent_of_base", rate: 5, sequence: 5, enabled: true },
  { id: "md", code: "MD_COMPUTATION", label: "Mesh Depth", operation: "add", basis: "lookup_table", rate: 0, lookupTableId: "t_md", sequence: 6, enabled: true },
  { id: "dw", code: "DW_COMPUTATION", label: "Depth-Way", operation: "add", basis: "lookup_table", rate: 0, lookupTableId: "t_dw", sequence: 7, enabled: true },
  { id: "ins", code: "INSURANCE", label: "Insurance", operation: "add", basis: "lookup_table", rate: 0, lookupTableId: "t_ins", sequence: 8, enabled: true },
];

const TABLES: LookupTable[] = [
  { id: "t_md", name: "MD", valueKind: "amount", rows: [{ key: "122", value: 0.175 }] },
  { id: "t_dw", name: "DW", valueKind: "amount", rows: [{ key: "50", value: 0.5 }] },
  { id: "t_ins", name: "INS", valueKind: "percent", rows: [{ key: "net", value: 0.66 }] },
];

const KEYS: Record<string, string> = { t_md: "122", t_dw: "50", t_ins: "net" };

/** Doc's fixed sample: base Given Price 5.0000, spec N-1596, Weight/PC 495.00. */
function price(appliedRuleIds: string[], overrides: Partial<Parameters<typeof computeLinePricing>[0]> = {}) {
  return computeLinePricing(
    {
      givenPriceKg: 5,
      weightPerPc: 495,
      qtyPcs: 1,
      appliedRuleIds,
      laborHours: 0,
      laborRate: 0,
      wastageKg: 0,
      twineKg: 0,
      twineRate: 0,
      lookupKeyForRule: (rule) => KEYS[rule.lookupTableId ?? ""] ?? "default",
      ...overrides,
    },
    RULES,
    TABLES
  );
}

describe("pricing chain, doc §5.2 unit vectors (base 5.0000)", () => {
  it("ADD COMMISSION 3% grosses up margin-inclusive", () => {
    expect(price(["comm3"]).newPriceKg).toBeCloseTo(5.1546, 4);
  });

  it("ADD COMMISSION compounds on the running total, not the base", () => {
    // 5 -> 5.1546 -> 5.4259. A base-relative second step would give 5.2632.
    expect(price(["comm3", "comm5"]).newPriceKg).toBeCloseTo(5.4259, 4);
  });

  it("ADD PERCENTAGE 5% is a simple markup", () => {
    expect(price(["pct5"]).newPriceKg).toBeCloseTo(5.25, 4);
  });

  it("ADD AMOUNT adds a flat value", () => {
    expect(price(["amt"]).newPriceKg).toBeCloseTo(5.1, 4);
  });

  it("SUBTRACT PERCENTAGE 5% removes embedded margin by division", () => {
    // 5 / 1.05 = 4.7619, not 5 x 0.95 = 4.75.
    expect(price(["sub5"]).newPriceKg).toBeCloseTo(4.7619, 4);
  });

  it("ADD MD COMPUTATION adds the mesh-depth amount", () => {
    expect(price(["md"]).newPriceKg).toBeCloseTo(5.175, 4);
  });

  it("ADD DW COMPUTATION adds the depth-way amount", () => {
    expect(price(["dw"]).newPriceKg).toBeCloseTo(5.5, 4);
  });

  it("ADD INSURANCE applies 0.66 as a PERCENT, not a flat amount", () => {
    // Regression guard for the original defect: treating the 0.66 lookup value as currency gave
    // 5.66 here, roughly 8.6x the intended step once scaled to a real 11.60 base price.
    expect(price(["ins"]).newPriceKg).toBeCloseTo(5.033, 4);
  });
});

describe("price per piece, doc §4.2", () => {
  it("multiplies new price/kg by weight/pc", () => {
    expect(price(["md"]).unitPrice).toBeCloseTo(2561.625, 4);
  });

  it("adds labor, wastage and sewing twine", () => {
    // labor 2 x 3 = 6, wastage 1.5 x 5.175 = 7.7625, sewing 0.5 x 4 = 2
    const r = price(["md"], { laborHours: 2, laborRate: 3, wastageKg: 1.5, twineKg: 0.5, twineRate: 4 });
    expect(r.laborCost).toBeCloseTo(6, 4);
    expect(r.wastageCost).toBeCloseTo(7.7625, 4);
    expect(r.twineCost).toBeCloseTo(2, 4);
    expect(r.unitPrice).toBeCloseTo(2577.3875, 4);
  });
});

describe("line totals, doc §4.3 and §5.1", () => {
  it("computes AMOUNT from the unrounded unit price", () => {
    // 2561.625 x 10 = 25,616.25. Rounding U/P to 2dp first would give 25,616.30.
    const r = price(["md"], { qtyPcs: 10 });
    expect(r.totalPrice).toBeCloseTo(25616.25, 2);
    expect(r.weightKg).toBeCloseTo(4950, 2);
  });

  it("row 10: MD plus all extras at qty 10", () => {
    const r = price(["md"], { qtyPcs: 10, laborHours: 2, laborRate: 3, wastageKg: 1.5, twineKg: 0.5, twineRate: 4 });
    expect(r.totalPrice).toBeCloseTo(25773.875, 2);
  });
});

describe("rules default to off", () => {
  it("an empty applied set leaves the given price untouched", () => {
    expect(price([]).newPriceKg).toBe(5);
  });

  it("doc §5.1 row 1, the base case still produces a full U/P without any rule applied", () => {
    // Guards spec §6.2.1: U/P must never be gated on the pricing modal having been opened.
    const r = price([], { qtyPcs: 10 });
    expect(r.unitPrice).toBeCloseTo(2475, 2);
    expect(r.totalPrice).toBeCloseTo(24750, 2);
    expect(r.weightKg).toBeCloseTo(4950, 2);
    expect(r.chain).toHaveLength(0);
  });

  it("a disabled rule is ignored even when explicitly applied", () => {
    const disabled = RULES.map((r) => (r.id === "md" ? { ...r, enabled: false } : r));
    const result = computeLinePricing(
      {
        givenPriceKg: 5, weightPerPc: 495, qtyPcs: 1, appliedRuleIds: ["md"],
        laborHours: 0, laborRate: 0, wastageKg: 0, twineKg: 0, twineRate: 0,
        lookupKeyForRule: (rule) => KEYS[rule.lookupTableId ?? ""] ?? "default",
      },
      disabled,
      TABLES
    );
    expect(result.newPriceKg).toBe(5);
  });
});

describe("manual new price / kg", () => {
  it("uses the typed price instead of the one the rules produce", () => {
    const result = price(["comm3"], { manualNewPriceKg: 6 });
    expect(result.newPriceKg).toBe(6);
  });

  it("still calculates and reports what the rules would have given", () => {
    const calculated = price(["comm3"]).newPriceKg;
    const result = price(["comm3"], { manualNewPriceKg: 6 });
    // The gap between agreed and calculated is the whole point of keeping both.
    expect(result.calculatedNewPriceKg).toBeCloseTo(calculated, 10);
    expect(result.calculatedNewPriceKg).not.toBe(result.newPriceKg);
  });

  it("still records the chain so the workings survive on the line", () => {
    const result = price(["comm3", "ins"], { manualNewPriceKg: 6 });
    expect(result.chain).toHaveLength(2);
  });

  it("builds U/P and Amount from the typed price, not the calculated one", () => {
    const result = price([], { manualNewPriceKg: 6, weightPerPc: 10, qtyPcs: 3 });
    expect(result.pricePerPiece).toBe(60);
    expect(result.unitPrice).toBe(60);
    expect(result.totalPrice).toBe(180);
  });

  it("prices wastage off the typed figure too", () => {
    const result = price([], { manualNewPriceKg: 6, weightPerPc: 10, qtyPcs: 1, wastageKg: 2 });
    expect(result.wastageCost).toBe(12);
  });

  it("falls back to the calculation when the box is empty or nonsense", () => {
    const calculated = price(["comm3"]).newPriceKg;
    // A zero or negative typed price is a half-finished edit, not an instruction to price at nothing.
    expect(price(["comm3"], { manualNewPriceKg: undefined }).newPriceKg).toBeCloseTo(calculated, 10);
    expect(price(["comm3"], { manualNewPriceKg: 0 }).newPriceKg).toBeCloseTo(calculated, 10);
    expect(price(["comm3"], { manualNewPriceKg: -4 }).newPriceKg).toBeCloseTo(calculated, 10);
    expect(price(["comm3"], { manualNewPriceKg: Number.NaN }).newPriceKg).toBeCloseTo(calculated, 10);
  });

  it("works with no rules applied at all", () => {
    const result = price([], { manualNewPriceKg: 7.25 });
    expect(result.newPriceKg).toBe(7.25);
    expect(result.calculatedNewPriceKg).toBe(5);
  });
});

describe("chain ordering", () => {
  it("applies rules in sequence order regardless of the order they were ticked", () => {
    const ticked = price(["ins", "comm3"]).newPriceKg;
    const reverse = price(["comm3", "ins"]).newPriceKg;
    expect(ticked).toBeCloseTo(reverse, 10);
    // Commission (seq 1) then insurance (seq 8): 5 / 0.97 = 5.1546392, x 1.0066 = 5.1886598.
    // Rounded to 4dp that is 5.1887, and 5.1886 sits 0.00006 away, outside toBeCloseTo(_, 4)'s
    // 0.00005 tolerance.
    expect(ticked).toBeCloseTo(5.1887, 4);
  });

  it("records a before/after step for each applied rule", () => {
    const chain = price(["comm3", "md"]).chain;
    expect(chain.map((s) => s.code)).toEqual(["COMMISSION", "MD_COMPUTATION"]);
    expect(chain[0].before).toBe(5);
    expect(chain[1].before).toBeCloseTo(chain[0].after, 10);
  });
});

describe("formatRuleRate", () => {
  it("renders percentages, flat amounts and resolved lookups", () => {
    expect(formatRuleRate(RULES[0], TABLES, "122")).toBe("+3%");
    expect(formatRuleRate(RULES[3], TABLES, "122")).toBe("+0.10");
    expect(formatRuleRate(RULES[4], TABLES, "122")).toBe("−5%");
    // Depth-Way rather than Mesh Depth: 0.5 renders unambiguously at 2dp, whereas 0.175 sits just
    // below its decimal value as a double, so (0.175).toFixed(2) is platform-brittle.
    expect(formatRuleRate(RULES[6], TABLES, "50")).toBe("+0.50"); // lookup amount, 2dp
    expect(formatRuleRate(RULES[7], TABLES, "net")).toBe("+0.66%"); // lookup percent
  });
});

describe("shipped seed data", () => {
  it("marks the insurance table as a percentage and MD/DW as amounts", () => {
    const byId = Object.fromEntries(LOOKUP_TABLES.map((t) => [t.id, t]));
    expect(byId.lt_ins.valueKind).toBe("percent");
    expect(byId.lt_md.valueKind).toBe("amount");
    expect(byId.lt_dw.valueKind).toBe("amount");
  });
});
