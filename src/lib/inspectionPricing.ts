import { linesForOrder, listOrders } from "./packing";
import type { InspectionLine, PackingList, QuotationLineItem } from "./types";

/**
 * The arithmetic behind the inspection report.
 *
 * The report is not a quality check. It is the listing of what is about to be shipped, every bale
 * with its number and its net and gross weight, sent to the customer so they can counter-check it
 * and agree the load can go. What makes it worth sending is the weights: nets are quoted from a
 * standard weight per piece, but a panel off the machine is never exactly the standard, and the
 * customer is billed for the kilos actually shipped.
 *
 * So the same sheet does two jobs. For the customer it is a manifest to tick off. For Finance it is
 * where the order value stops being an estimate, because the rule is that the PRICE PER KILO is
 * what was agreed and does not move; the weight is what moves. Recomputing at the agreed rate is
 * the honest reading of a quotation whose unit price was itself derived from a price per kilo, and
 * it is what stops a heavier net silently being given away or a lighter one silently overcharged.
 */

/**
 * The agreed price per kilo implied by a quotation line.
 *
 * Derived rather than stored, because the quotation's own U/P was built from it. A line with no
 * weight cannot be priced by weight, so it returns 0 and the caller falls back to the quoted
 * amount. A lacing or twine row sold by the piece must not be repriced into nothing.
 */
export function pricePerKg(line: { totalPrice: number; weightKg: number }): number {
  if (!line.weightKg || !Number.isFinite(line.weightKg) || line.weightKg <= 0) return 0;
  return line.totalPrice / line.weightKg;
}

/**
 * The amount for one measured bale, at the rate the quotation implies.
 *
 * Scaled from the quoted amount rather than multiplied by the stored rate. The two are the same
 * arithmetic, but scaling is exact when the goods weigh what they were quoted to, and multiplying
 * is not: `pricePerKg` is carried at the precision the printed rate column shows, so a load where
 * nothing moved would otherwise report a few cents of settlement out of pure rounding, and a
 * settlement of a few cents is the sort of thing somebody has to go and explain.
 */
export function actualAmountFor(line: InspectionLine): number {
  if (line.computedWeightKg > 0) return line.quotedAmount * (line.netWeightKg / line.computedWeightKg);
  // Nothing to scale against. A stored rate still prices it; without one the line was not sold by
  // weight at all, being a lacing or twine row billed by the piece, and its quoted amount stands.
  if (!line.pricePerKg) return line.quotedAmount;
  return line.netWeightKg * line.pricePerKg;
}

export interface InspectionSettlement {
  quotedValue: number;
  actualValue: number;
  /** Actual less quoted. Positive means the customer owes more than the PI said. */
  difference: number;
  /** The difference as a percentage of the quoted value, for a sanity check on data entry. */
  differencePct: number;
  /** What the goods were quoted to weigh, which the report calls the "Computed Weight". */
  computedWeightKg: number;
  /** What they actually weigh. */
  netWeightKg: number;
  grossWeightKg: number;
  /** Net less computed. Negative is an underweight load, which is the usual direction. */
  weightDifferenceKg: number;
  /** That difference against the computed weight, as the report states it. */
  weightDifferencePct: number;
}

export function settleInspection(lines: InspectionLine[]): InspectionSettlement {
  const quotedValue = lines.reduce((s, l) => s + l.quotedAmount, 0);
  const actualValue = lines.reduce((s, l) => s + actualAmountFor(l), 0);
  const computedWeightKg = lines.reduce((s, l) => s + l.computedWeightKg, 0);
  const netWeightKg = lines.reduce((s, l) => s + l.netWeightKg, 0);
  const grossWeightKg = lines.reduce((s, l) => s + l.grossWeightKg, 0);
  const difference = actualValue - quotedValue;
  const weightDifferenceKg = netWeightKg - computedWeightKg;
  return {
    quotedValue,
    actualValue,
    difference,
    differencePct: quotedValue === 0 ? 0 : (difference / quotedValue) * 100,
    computedWeightKg,
    netWeightKg,
    grossWeightKg,
    weightDifferenceKg,
    weightDifferencePct: computedWeightKg === 0 ? 0 : (weightDifferenceKg / computedWeightKg) * 100,
  };
}

/**
 * "Underweight" / "Overweight" / "On weight": the one-word verdict at the foot of the report.
 *
 * A load is never exactly its computed weight, so a hair either way is not worth a word. The
 * tolerance is deliberately tight because the figure is quoted to two decimals: anything inside a
 * hundredth of a percent is rounding, not a finding.
 */
export function weightVerdict(settlement: InspectionSettlement): "Underweight" | "Overweight" | "On weight" {
  if (Math.abs(settlement.weightDifferencePct) < 0.01) return "On weight";
  return settlement.weightDifferenceKg < 0 ? "Underweight" : "Overweight";
}

/** The settlement for one order's rows, so a consolidated report can settle each order separately. */
export function settlementByOrder(lines: InspectionLine[]): Record<string, InspectionSettlement> {
  const byOrder: Record<string, InspectionLine[]> = {};
  for (const line of lines) (byOrder[line.salesOrderId] ??= []).push(line);
  return Object.fromEntries(Object.entries(byOrder).map(([id, ls]) => [id, settleInspection(ls)]));
}

/**
 * One specification's block on the report: its bales, and what they come to.
 *
 * The document is written per specification with the bales listed beneath it and a subtotal under
 * those, so grouping is a presentation concern and the stored rows stay flat at one row per bale,
 * which is also the shape the packing list records them in.
 */
export interface InspectionGroup {
  key: string;
  salesOrderId: string;
  itemCode: string;
  description: string;
  bales: InspectionLine[];
  qtyPcs: number;
  computedWeightKg: number;
  netWeightKg: number;
  grossWeightKg: number;
  pricePerKg: number;
  quotedAmount: number;
  actualAmount: number;
}

export function groupInspectionLines(lines: InspectionLine[]): InspectionGroup[] {
  const groups: InspectionGroup[] = [];
  const index = new Map<string, InspectionGroup>();
  for (const line of lines) {
    // Grouped by order as well as item: the same specification bought twice by the same customer is
    // two orders, priced and settled separately, and merging them would hide that.
    const key = `${line.salesOrderId}::${line.itemId ?? line.itemCode}`;
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        salesOrderId: line.salesOrderId,
        itemCode: line.itemCode,
        description: line.description,
        bales: [],
        qtyPcs: 0,
        computedWeightKg: 0,
        netWeightKg: 0,
        grossWeightKg: 0,
        pricePerKg: line.pricePerKg,
        quotedAmount: 0,
        actualAmount: 0,
      };
      index.set(key, group);
      groups.push(group);
    }
    group.bales.push(line);
    group.qtyPcs += line.qtyPcs;
    group.computedWeightKg += line.computedWeightKg;
    group.netWeightKg += line.netWeightKg;
    group.grossWeightKg += line.grossWeightKg;
    group.quotedAmount += line.quotedAmount;
    group.actualAmount += actualAmountFor(line);
  }
  return groups;
}

/**
 * Builds the report from a finalised packing list.
 *
 * The rows come from what was actually packed, not from what was ordered, because the report's job
 * is to tell the customer what is in the container. A partial load that listed the whole order
 * would be asking them to confirm goods that are not going. One row per bale, carrying the weights
 * the packer already recorded, so inspection corrects figures rather than re-entering them.
 *
 * The computed weight beside each is the quotation's own weight for those pieces, pro-rated where a
 * line was split across bales. That is what makes the weight difference at the foot of the report
 * mean something.
 */
export function buildInspectionLines(
  list: PackingList,
  /** The ordered lines for each covered order, keyed by sales order id. */
  itemsByOrder: Record<string, QuotationLineItem[]>
): InspectionLine[] {
  const orders = listOrders(list);
  const soleOrder = orders.length === 1 ? orders[0].salesOrderId : undefined;
  const lines: InspectionLine[] = [];

  for (const ref of orders) {
    const items = itemsByOrder[ref.salesOrderId] ?? [];
    const packed = linesForOrder([list], ref.salesOrderId);
    for (const line of packed) {
      const source = line.itemId
        ? items.find((li) => li.id === line.itemId)
        : items.find((li) => li.itemCode === line.itemCode);
      // Weight and price per piece, so a bale holding two of a five-piece line carries two-fifths
      // of the quoted weight and two-fifths of the money rather than all of it.
      const perPiece = source && source.qtyPcs > 0 ? source.weightKg / source.qtyPcs : 0;
      const amountPerPiece = source && source.qtyPcs > 0 ? source.totalPrice / source.qtyPcs : 0;
      lines.push({
        id: `INSL-${line.id}`,
        salesOrderId: ref.salesOrderId,
        itemId: line.itemId,
        itemCode: line.itemCode,
        description: source?.description ?? line.description,
        baleNo: line.baleNo ?? line.description,
        qtyPcs: line.qtyPcs,
        computedWeightKg: round2(perPiece * line.qtyPcs),
        // Seeded from the packing list, which is where the goods were weighed. Falling back to the
        // computed figure keeps a bale nobody weighed from wiping the value of the line: a zero
        // here would reprice it to nothing.
        netWeightKg: line.netWeightKg > 0 ? line.netWeightKg : round2(perPiece * line.qtyPcs),
        grossWeightKg: line.grossWeightKg > 0 ? line.grossWeightKg : line.netWeightKg,
        pricePerKg: source ? pricePerKg(source) : 0,
        quotedAmount: round2(amountPerPiece * line.qtyPcs),
      });
    }
  }

  // Rows typed in by hand on a consolidated list state no order, so they are not picked up above.
  // They are still going in the container and still have to appear on what the customer confirms.
  const attributed = new Set(lines.map((l) => l.id));
  for (const section of list.sections ?? []) {
    for (const line of section.lines) {
      if (attributed.has(`INSL-${line.id}`)) continue;
      lines.push({
        id: `INSL-${line.id}`,
        salesOrderId: line.salesOrderId ?? soleOrder ?? "",
        itemId: line.itemId,
        itemCode: line.itemCode,
        description: line.description,
        baleNo: line.baleNo ?? line.description,
        qtyPcs: line.qtyPcs,
        computedWeightKg: line.netWeightKg,
        netWeightKg: line.netWeightKg,
        grossWeightKg: line.grossWeightKg,
        pricePerKg: 0,
        quotedAmount: 0,
      });
    }
  }

  return lines;
}

/**
 * Whether a settlement looks like a typo rather than a real variance.
 *
 * Net weights drift by a few percent. A figure twenty percent out is far more often a decimal point
 * in the wrong place than a genuine result, and it is worth a second look before it goes to the
 * customer. It is warned about rather than blocked, because occasionally it is real.
 */
export const LARGE_VARIANCE_PCT = 20;

export function isSuspiciousVariance(settlement: InspectionSettlement): boolean {
  return Math.abs(settlement.weightDifferencePct) >= LARGE_VARIANCE_PCT;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
