// Roll-up arithmetic for the quotation (FORTUNE_NET_TWINE_System_Simulation.md §4.3).
//
//   U/P (Unit Price)   = New Price/Piece
//   AMOUNT (line)      = U/P x QTY
//   WEIGHT (line)      = Weight/PC x QTY   (+ lacing twine KGS)
//   BATCH TOTAL        = sum of line AMOUNT in the group
//   GRAND TOTAL        = sum of all batch totals (NORMAL + ASSEMBLED + LACING)
//   TOTAL WEIGHT       = sum of all line weights + lacing twine KGS
//
// One implementation, used by NewQuotation, QuotationDetail and PIDocumentPreview alike. Before
// this existed each of the three carried its own reduce, and they had already drifted — the
// quotation builder's total silently ignored discount and tax.

import { lacingAmount, lacingWeight } from "./batches";
import { computeLinePricing, lookupKeyForSpecRow } from "./pricing";
import type {
  BatchItem,
  LookupTable,
  PricingRule,
  Quotation,
  QuotationBatch,
  QuotationLineItem,
  SpecLine,
} from "./types";

export type DiscountMode = "amount" | "percent";

export interface QuotationTotals {
  itemsTotal: number;
  totalWeightKg: number;
  /** The discount as money, after resolving a percentage against the items total. */
  discountValue: number;
  grandTotal: number;
}

/**
 * A discount is entered either as money or as a percentage of the items total. Records written
 * before the percentage option existed have no mode and are always amounts.
 */
export function resolveDiscount(itemsTotal: number, discount: number, mode?: DiscountMode): number {
  return mode === "percent" ? (itemsTotal * discount) / 100 : discount;
}

/**
 * Recomputes a specification line end to end: the rule chain, price per piece, the manufacturing
 * additions, then AMOUNT and WEIGHT. Called on every edit — Given Price, Qty, or anything the
 * pricing modal changed.
 */
export function recomputeSpecLine(line: SpecLine, rules: PricingRule[], lookupTables: LookupTable[]): SpecLine {
  const p = line.pricing;
  const result = computeLinePricing(
    {
      givenPriceKg: line.givenPriceKg,
      weightPerPc: line.weightPerPc,
      qtyPcs: line.qtyPcs,
      appliedRuleIds: p.appliedRuleIds,
      laborHours: p.laborHours,
      laborRate: p.laborRate,
      wastageKg: p.wastageKg,
      twineKg: p.twineKg,
      twineRate: p.twineRate,
      manualNewPriceKg: p.manualNewPriceKg,
      lookupKeyForRule: lookupKeyForSpecRow({
        code: line.specCode,
        meshDepth: line.meshDepth,
        length: line.length,
      }),
    },
    rules,
    lookupTables
  );

  // A hand-entered unit price wins. Pricing is manual: the engine is a helper, so once someone has
  // typed a U/P, editing quantity or any other field must not quietly overwrite their figure.
  const unitPrice = line.manualUnitPrice ? line.unitPrice : result.unitPrice;

  return {
    ...line,
    pricing: {
      ...p,
      givenPriceKg: line.givenPriceKg,
      chain: result.chain,
      newPriceKg: result.newPriceKg,
      pricePerPiece: result.pricePerPiece,
      laborCost: result.laborCost,
      wastageCost: result.wastageCost,
      twineCost: result.twineCost,
    },
    unitPrice,
    amount: unitPrice * line.qtyPcs,
    weightKg: result.weightKg,
  };
}

export function itemTotal(item: BatchItem): number {
  return item.specs.reduce((s, spec) => s + spec.amount, 0);
}

export function itemWeight(item: BatchItem): number {
  return item.specs.reduce((s, spec) => s + spec.weightKg, 0);
}

export function batchTotal(batch: QuotationBatch): number {
  if (batch.type === "lacing") return (batch.lacing ?? []).reduce((s, l) => s + lacingAmount(l), 0);
  return (batch.items ?? []).reduce((s, item) => s + itemTotal(item), 0);
}

export function batchWeight(batch: QuotationBatch): number {
  if (batch.type === "lacing") return (batch.lacing ?? []).reduce((s, l) => s + lacingWeight(l), 0);
  return (batch.items ?? []).reduce((s, item) => s + itemWeight(item), 0);
}

export function quotationTotals(
  batches: QuotationBatch[],
  freight = 0,
  discount = 0,
  tax = 0,
  discountMode?: DiscountMode
): QuotationTotals {
  const itemsTotal = batches.reduce((s, b) => s + batchTotal(b), 0);
  const totalWeightKg = batches.reduce((s, b) => s + batchWeight(b), 0);
  const discountValue = resolveDiscount(itemsTotal, discount, discountMode);
  return { itemsTotal, totalWeightKg, discountValue, grandTotal: itemsTotal + freight - discountValue + tax };
}

/** The same roll-up over an already-flattened line list, for quotations authored before batches. */
export function totalsFromItems(
  items: QuotationLineItem[],
  freight = 0,
  discount = 0,
  tax = 0,
  discountMode?: DiscountMode
): QuotationTotals {
  const itemsTotal = items.reduce((s, li) => s + li.totalPrice, 0);
  const totalWeightKg = items.reduce((s, li) => s + li.weightKg, 0);
  const discountValue = resolveDiscount(itemsTotal, discount, discountMode);
  return { itemsTotal, totalWeightKg, discountValue, grandTotal: itemsTotal + freight - discountValue + tax };
}

/** Prefers the authored tree when present, falls back to the flat projection otherwise. */
export function totalsForQuotation(q: Quotation): QuotationTotals {
  return q.batches?.length
    ? quotationTotals(q.batches, q.freight, q.discount, q.tax, q.discountMode)
    : totalsFromItems(q.items, q.freight, q.discount, q.tax, q.discountMode);
}
