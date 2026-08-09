import type { InspectionLine, QuotationLineItem } from "./types";

/**
 * Settling the order value from the weights measured at inspection.
 *
 * Nets are quoted from a standard weight per piece, but a panel off the machine is never exactly
 * the standard. The customer is billed for the kilos actually shipped, so the quoted amount is an
 * estimate until somebody weighs the goods. Inspection is where that happens, and this module is
 * the arithmetic that turns those weights into the amount the balance is invoiced against.
 *
 * The rule is that the PRICE PER KILO is what was agreed and does not move; the weight is what
 * moves. Recomputing at the agreed rate is the honest reading of a quotation whose unit price was
 * itself derived from a price per kilo, and it is what stops a heavier net silently being given
 * away or a lighter one silently overcharged.
 */

/**
 * The agreed price per kilo implied by a quotation line.
 *
 * Derived rather than stored, because the quotation's own U/P was built from it. A line with no
 * weight cannot be priced by weight, so it returns 0 and the caller falls back to the quoted
 * amount — a lacing or twine row sold by the piece must not be repriced into nothing.
 */
export function pricePerKg(line: { totalPrice: number; weightKg: number }): number {
  if (!line.weightKg || !Number.isFinite(line.weightKg) || line.weightKg <= 0) return 0;
  return line.totalPrice / line.weightKg;
}

/** The amount for one measured line, at the rate the quotation implies. */
export function actualAmountFor(line: InspectionLine): number {
  const rate = pricePerKg({ totalPrice: line.quotedAmount, weightKg: line.quotedWeightKg });
  // No usable rate means the line was not sold by weight. Its quoted amount stands.
  if (rate === 0) return line.quotedAmount;
  return line.actualWeightKg * rate;
}

export interface InspectionSettlement {
  quotedValue: number;
  actualValue: number;
  /** Actual less quoted. Positive means the customer owes more than the PI said. */
  difference: number;
  /** The difference as a percentage of the quoted value, for a sanity check on data entry. */
  differencePct: number;
  quotedWeightKg: number;
  actualWeightKg: number;
}

export function settleInspection(lines: InspectionLine[]): InspectionSettlement {
  const quotedValue = lines.reduce((s, l) => s + l.quotedAmount, 0);
  const actualValue = lines.reduce((s, l) => s + actualAmountFor(l), 0);
  const quotedWeightKg = lines.reduce((s, l) => s + l.quotedWeightKg, 0);
  const actualWeightKg = lines.reduce((s, l) => s + l.actualWeightKg, 0);
  const difference = actualValue - quotedValue;
  return {
    quotedValue,
    actualValue,
    difference,
    differencePct: quotedValue === 0 ? 0 : (difference / quotedValue) * 100,
    quotedWeightKg,
    actualWeightKg,
  };
}

/**
 * Builds the measurement sheet for an order, seeded with the quoted figures.
 *
 * Actual weight starts at the quoted weight rather than at zero. An inspector who weighs six of
 * eight lines and saves would otherwise wipe the value of the two they had not reached yet, which
 * is a worse failure than the small risk of a quoted figure being accepted unchanged.
 */
export function buildInspectionLines(items: QuotationLineItem[]): InspectionLine[] {
  return items.map((li) => ({
    id: `INSL-${li.id}`,
    itemId: li.id,
    itemCode: li.itemCode,
    description: li.description,
    qtyPcs: li.qtyPcs,
    quotedWeightKg: li.weightKg,
    actualWeightKg: li.weightKg,
    quotedAmount: li.totalPrice,
  }));
}

/**
 * Whether a settlement looks like a typo rather than a real variance.
 *
 * Net weights drift by a few percent. A figure twenty percent out is far more often a decimal point
 * in the wrong place than a genuine result, and it is worth a second look before it is invoiced —
 * warned about, not blocked, because occasionally it is real.
 */
export const LARGE_VARIANCE_PCT = 20;

export function isSuspiciousVariance(settlement: InspectionSettlement): boolean {
  return Math.abs(settlement.differencePct) >= LARGE_VARIANCE_PCT;
}
