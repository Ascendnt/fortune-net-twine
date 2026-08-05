// Flexible pricing rule engine — Part A/C of the quotation-to-invoice discovery doc.
//
// The original build hardcoded eight adjustment types (COMMISSION, PERCENTAGE add/subtract,
// AMOUNT add/subtract, MD/DW/INSURANCE computation) directly into the pricing screen, with the
// of-base-vs-of-result distinction implied by the label rather than stated anywhere. Here every
// rule is a plain data record (see PricingRule in lib/types.ts) with an explicit `basis`, so new
// adjustment types — or a correction to an existing one — are a data change, not a code change.
//
// Formulas are verified against FORTUNE_NET_TWINE_System_Simulation.md §5.2, which observed each
// operation live against a base Given Price of 5.0000:
//
//   ADD COMMISSION      3%     percent_of_result, add       -> 5 / (1 - 0.03)     = 5.1546
//   ADD COMMISSION      +5%    compounds on the running total -> 5.1546 / 0.95    = 5.4259
//   ADD PERCENTAGE      5%     percent_of_base,   add       -> 5 x 1.05           = 5.2500
//   ADD AMOUNT          0.10   flat_amount,       add       -> 5 + 0.10           = 5.1000
//   SUBTRACT PERCENTAGE 5%     percent_of_base,   subtract  -> 5 / 1.05           = 4.7619
//   ADD MD COMPUTATION         lookup_table (amount)        -> 5 + 0.1750         = 5.1750
//   ADD DW COMPUTATION         lookup_table (amount)        -> 5 + 0.5000         = 5.5000
//   ADD INSURANCE       0.66%  lookup_table (percent)       -> 5 x 1.0066         = 5.0330
//
// The key distinction the original build lost: COMMISSION and SUBTRACT-PERCENTAGE use
// division-based (margin-inclusive) math, whereas ADD-PERCENTAGE uses simple math. And INSURANCE
// is a *percentage* pulled from a lookup table, not a flat amount — see LookupTable.valueKind.

import type { ItemMaster, LookupTable, PricingChainStep, PricingRule } from "./types";

export interface PricingLineInputs {
  givenPriceKg: number;
  weightPerPc: number;
  qtyPcs: number;
  appliedRuleIds: string[];
  laborHours: number;
  laborRate: number;
  wastageKg: number;
  twineKg: number;
  twineRate: number;
  /** Resolves a rule's lookup key for this specific line (e.g. mesh-depth bucket, item category). */
  lookupKeyForRule: (rule: PricingRule) => string;
}

export interface PricingLineResult {
  chain: PricingChainStep[];
  newPriceKg: number;
  pricePerPiece: number;
  laborCost: number;
  wastageCost: number;
  twineCost: number;
  unitPrice: number; // U/P — price per piece, all-in
  totalPrice: number; // Amount — U/P x Qty
  weightKg: number; // weight subtotal — Weight/PC x Qty
}

export function getLookupTable(lookupTables: LookupTable[], lookupTableId: string | undefined): LookupTable | undefined {
  return lookupTables.find((t) => t.id === lookupTableId);
}

export function getLookupValue(lookupTables: LookupTable[], lookupTableId: string | undefined, key: string): number {
  const table = getLookupTable(lookupTables, lookupTableId);
  if (!table) return 0;
  // Unmatched keys fall through to the table's explicit "default" row rather than to whichever row
  // happens to sit first — an unlisted float length should contribute nothing, not silently borrow
  // the first bucket's rate.
  const row = table.rows.find((r) => r.key === key) ?? table.rows.find((r) => r.key === "default");
  return row ? row.value : 0;
}

export function computeLinePricing(
  inputs: PricingLineInputs,
  rules: PricingRule[],
  lookupTables: LookupTable[]
): PricingLineResult {
  const applied = rules
    .filter((r) => r.enabled && inputs.appliedRuleIds.includes(r.id))
    .sort((a, b) => a.sequence - b.sequence);

  let p = inputs.givenPriceKg;
  const chain: PricingChainStep[] = [];

  for (const rule of applied) {
    const before = p;
    const isLookup = rule.basis === "lookup_table";
    const table = isLookup ? getLookupTable(lookupTables, rule.lookupTableId) : undefined;
    const rateVal = isLookup ? getLookupValue(lookupTables, rule.lookupTableId, inputs.lookupKeyForRule(rule)) : rule.rate;
    const lookupIsPercent = table?.valueKind === "percent";

    if (isLookup && lookupIsPercent) {
      // Insurance and any future percentage-valued table: a percent of the running total, applied
      // with the same simple/of-base math as ADD PERCENTAGE.
      p = rule.operation === "subtract" ? p / (1 + rateVal / 100) : p * (1 + rateVal / 100);
    } else if (isLookup) {
      p = rule.operation === "subtract" ? p - rateVal : p + rateVal;
    } else if (rule.basis === "percent_of_result" && rule.operation === "add") p = p / (1 - rateVal / 100);
    else if (rule.basis === "percent_of_result" && rule.operation === "subtract") p = p * (1 - rateVal / 100);
    else if (rule.basis === "percent_of_base" && rule.operation === "add") p = p * (1 + rateVal / 100);
    else if (rule.basis === "percent_of_base" && rule.operation === "subtract") p = p / (1 + rateVal / 100);
    else if (rule.basis === "flat_amount" && rule.operation === "add") p = p + rateVal;
    else if (rule.basis === "flat_amount" && rule.operation === "subtract") p = p - rateVal;

    chain.push({ ruleId: rule.id, code: rule.code, label: rule.label, before, after: p });
  }

  // U/P is always derived, never gated on the pricing modal having been opened. With no rules
  // applied the chain is a no-op and newPriceKg collapses to the Given Price — doc §5.1 row 1:
  // base 5.0000, no operation, Weight/PC 495 -> U/P 2,475.00.
  const newPriceKg = p;
  const pricePerPiece = newPriceKg * inputs.weightPerPc;
  const laborCost = inputs.laborHours * inputs.laborRate;
  const wastageCost = inputs.wastageKg * newPriceKg;
  const twineCost = inputs.twineKg * inputs.twineRate;
  const unitPrice = pricePerPiece + laborCost + wastageCost + twineCost;
  // Deliberately computed from the unrounded unit price. Doc §5.1 row 7 gives
  // 2561.625 x 10 = 25,616.25, not 2561.63 x 10 = 25,616.30.
  const totalPrice = unitPrice * inputs.qtyPcs;
  const weightKg = inputs.weightPerPc * inputs.qtyPcs;

  return { chain, newPriceKg, pricePerPiece, laborCost, wastageCost, twineCost, unitPrice, totalPrice, weightKg };
}

/**
 * Human-readable rate for a rule, resolved against the line it will be applied to. Lookup-backed
 * rules resolve their actual value (and unit) rather than showing a meaningless 0.
 */
export function formatRuleRate(rule: PricingRule, lookupTables: LookupTable[], lookupKey: string): string {
  const sign = rule.operation === "subtract" ? "−" : "+";
  if (rule.basis === "flat_amount") return `${sign}${rule.rate.toFixed(2)}`;
  if (rule.basis !== "lookup_table") return `${sign}${rule.rate}%`;
  const table = getLookupTable(lookupTables, rule.lookupTableId);
  const value = getLookupValue(lookupTables, rule.lookupTableId, lookupKey);
  return table?.valueKind === "percent" ? `${sign}${value}%` : `${sign}${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------------------------
// Lookup-key derivation for MD / DW / Insurance rules. These read the item's own catalog fields
// rather than a manual entry — Part A's doc noted these were "internal rate tables, not
// user-entered" — but the tables themselves are fully editable data (see mockData.ts).
// ---------------------------------------------------------------------------------------------

/** Pulls the leading "NNNmd" figure out of a meshDepth string like '122md x 50fl (1180ml)'. */
export function deriveMdKey(item: Pick<ItemMaster, "meshDepth">): string {
  const m = item.meshDepth.match(/(\d+)\s*md/i);
  return m ? m[1] : "default";
}

/** Pulls the "NNNfl" (float length / depth-way) figure out of the same meshDepth string. */
export function deriveDwKey(item: Pick<ItemMaster, "meshDepth">): string {
  const m = item.meshDepth.match(/(\d+)\s*fl/i);
  return m ? m[1] : "default";
}

/** Nets and twine carry different insurance rates in the lookup table. */
export function deriveInsuranceKey(item: Pick<ItemMaster, "code">): string {
  return item.code.startsWith("TWINE") ? "twine" : "net";
}

export function lookupKeyForRule(item: Pick<ItemMaster, "meshDepth" | "code">) {
  return (rule: PricingRule): string => {
    if (rule.lookupTableId === "lt_md") return deriveMdKey(item);
    if (rule.lookupTableId === "lt_dw") return deriveDwKey(item);
    if (rule.lookupTableId === "lt_ins") return deriveInsuranceKey(item);
    return "default";
  };
}

/**
 * Same resolution, but driven by a specification-master row. A spec row carries mesh depth and
 * length as separate fields ("122MD", "70FL(1656ML)") rather than the single combined string the
 * catalog uses, so the keys come straight off those fields.
 */
export function lookupKeyForSpecRow(row: { code: string; meshDepth: string; length: string }) {
  return (rule: PricingRule): string => {
    if (rule.lookupTableId === "lt_md") return row.meshDepth.match(/(\d+)/)?.[1] ?? "default";
    if (rule.lookupTableId === "lt_dw") return row.length.match(/(\d+)\s*fl/i)?.[1] ?? "default";
    if (rule.lookupTableId === "lt_ins") return row.code.startsWith("T") ? "twine" : "net";
    return "default";
  };
}
