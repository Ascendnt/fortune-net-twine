// Flexible pricing rule engine — Part A/C of the quotation-to-invoice discovery doc.
//
// The original build hardcoded eight adjustment types (COMMISSION, PERCENTAGE add/subtract,
// AMOUNT add/subtract, MD/DW/INSURANCE computation) directly into the pricing screen, with the
// of-base-vs-of-result distinction implied by the label rather than stated anywhere. Here every
// rule is a plain data record (see PricingRule in lib/types.ts) with an explicit `basis`, so new
// adjustment types — or a correction to an existing one — are a data change, not a code change.
//
// Formulas below are verified against the discovery doc's worked example (P0 = 100):
//   COMMISSION      add, percent_of_result, 3%   -> 100 / 0.97      = 103.0928
//   PERCENTAGE add  add, percent_of_base,   5%   -> 100 x 1.05      = 105.0000
//   PERCENTAGE sub  subtract, percent_of_base, 5%-> 100 / 1.05      =  95.2381
//   AMOUNT add      add, flat_amount, 0.10       -> 100 + 0.10      = 100.1000
//   AMOUNT sub      subtract, flat_amount, 0.20  -> 100 - 0.20      =  99.8000
//   MD/DW/INSURANCE add, lookup_table            -> 100 + lookup(key)

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

export function getLookupValue(lookupTables: LookupTable[], lookupTableId: string | undefined, key: string): number {
  const table = lookupTables.find((t) => t.id === lookupTableId);
  if (!table) return 0;
  const row = table.rows.find((r) => r.key === key) ?? table.rows[0];
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
    const rateVal =
      rule.basis === "lookup_table" ? getLookupValue(lookupTables, rule.lookupTableId, inputs.lookupKeyForRule(rule)) : rule.rate;

    if (rule.basis === "percent_of_result" && rule.operation === "add") p = p / (1 - rateVal / 100);
    else if (rule.basis === "percent_of_result" && rule.operation === "subtract") p = p * (1 - rateVal / 100);
    else if (rule.basis === "percent_of_base" && rule.operation === "add") p = p * (1 + rateVal / 100);
    else if (rule.basis === "percent_of_base" && rule.operation === "subtract") p = p / (1 + rateVal / 100);
    else if (rule.basis === "flat_amount" && rule.operation === "add") p = p + rateVal;
    else if (rule.basis === "flat_amount" && rule.operation === "subtract") p = p - rateVal;
    else if (rule.basis === "lookup_table") p = rule.operation === "subtract" ? p - rateVal : p + rateVal;

    chain.push({ ruleId: rule.id, code: rule.code, label: rule.label, before, after: p });
  }

  const newPriceKg = p;
  const pricePerPiece = newPriceKg * inputs.weightPerPc;
  const laborCost = inputs.laborHours * inputs.laborRate;
  const wastageCost = inputs.wastageKg * newPriceKg;
  const twineCost = inputs.twineKg * inputs.twineRate;
  const unitPrice = pricePerPiece + laborCost + wastageCost + twineCost;
  const totalPrice = unitPrice * inputs.qtyPcs;
  const weightKg = inputs.weightPerPc * inputs.qtyPcs;

  return { chain, newPriceKg, pricePerPiece, laborCost, wastageCost, twineCost, unitPrice, totalPrice, weightKg };
}

// ---------------------------------------------------------------------------------------------
// Lookup-key derivation for MD / DW / Insurance rules. These read the item's own catalog fields
// rather than a manual entry — Part A's doc noted these were "internal rate tables, not
// user-entered" — but the tables themselves are fully editable data (see mockData.ts).
// ---------------------------------------------------------------------------------------------

/** Pulls the leading "NNNmd" figure out of a meshDepth string like '122md x 50fl (1180ml)'. */
export function deriveMdKey(item: ItemMaster): string {
  const m = item.meshDepth.match(/(\d+)\s*md/i);
  return m ? m[1] : "default";
}

/** Pulls the "NNNfl" (float length / depth-way) figure out of the same meshDepth string. */
export function deriveDwKey(item: ItemMaster): string {
  const m = item.meshDepth.match(/(\d+)\s*fl/i);
  return m ? m[1] : "default";
}

/** Nets and twine carry different insurance rates in the lookup table. */
export function deriveInsuranceKey(item: ItemMaster): string {
  return item.code.startsWith("TWINE") ? "twine" : "net";
}

export function lookupKeyForRule(item: ItemMaster) {
  return (rule: PricingRule): string => {
    if (rule.lookupTableId === "lt_md") return deriveMdKey(item);
    if (rule.lookupTableId === "lt_dw") return deriveDwKey(item);
    if (rule.lookupTableId === "lt_ins") return deriveInsuranceKey(item);
    return "default";
  };
}
