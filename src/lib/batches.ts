// Batch tree factories and flattening.
//
// The quotation is authored as a tree (FORTUNE_NET_TWINE_System_Simulation.md §3.2):
//
//   batch (ASSEMBLED | NORMAL | LACING)
//     └─ item        — a composed specification string from the Item Selection modal
//          └─ spec   — an N-code from the specification master; THIS is the priced row
//
// Everything downstream of the quotation screen — sales orders, commercial invoices, reports, the
// PI document — reads a flat QuotationLineItem[]. Rather than teach all of them about batches, the
// tree is flattened on save. `batches` is what you edit; `items` is what everyone else reads.

import type {
  BatchItem,
  BatchType,
  LacingLine,
  LinePricing,
  QuotationBatch,
  QuotationLineItem,
  SpecLine,
} from "./types";
import type { LacingCatalogRow, SpecMasterRow } from "./specMaster";
import { specRowLabel } from "./specMaster";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

/** A pricing snapshot at defaults: no rules applied, no labor, wastage or sewing twine. */
export function emptyPricing(givenPriceKg = 0): LinePricing {
  return {
    givenPriceKg,
    appliedRuleIds: [],
    laborHours: 0,
    laborRate: 0,
    wastageKg: 0,
    twineKg: 0,
    twineRate: 0,
    chain: [],
    newPriceKg: givenPriceKg,
    pricePerPiece: 0,
    laborCost: 0,
    wastageCost: 0,
    twineCost: 0,
  };
}

/**
 * True when nothing has been changed from the defaults — drives whether a spec row shows the
 * "Add Pricing" button or the applied-rules read-out.
 */
export function isPricingUntouched(p: LinePricing): boolean {
  return (
    p.appliedRuleIds.length === 0 &&
    p.laborHours === 0 &&
    p.laborRate === 0 &&
    p.wastageKg === 0 &&
    p.twineKg === 0 &&
    p.twineRate === 0
  );
}

export function newSpecLine(row: SpecMasterRow): SpecLine {
  return {
    id: nextId("s"),
    specCode: row.code,
    description: specRowLabel(row),
    meshDepth: row.meshDepth,
    length: row.length,
    weightPerPc: row.weightPerPc,
    givenPriceKg: 0,
    qtyPcs: 1,
    pricing: emptyPricing(0),
    // U/P is 0 only because Given Price starts at 0 — not because pricing hasn't been opened.
    unitPrice: 0,
    amount: 0,
    weightKg: row.weightPerPc,
  };
}

export function newBatchItem(args: {
  specification: string;
  material: string;
  netType: string;
  weightUom: string;
  qtyUom: string;
}): BatchItem {
  return { id: nextId("i"), specs: [], ...args };
}

export function newLacingLine(row: LacingCatalogRow): LacingLine {
  return {
    id: nextId("l"),
    code: row.code,
    description: row.description,
    kind: row.kind,
    kgs: 0,
    rate: row.defaultRate,
    amount: 0,
  };
}

export function newBatch(type: BatchType): QuotationBatch {
  const base = { id: nextId("b"), type };
  if (type === "lacing") return { ...base, lacing: [] };
  if (type === "assembled") return { ...base, title: "", items: [] };
  return { ...base, items: [] };
}

export const BATCH_LABEL: Record<BatchType, string> = {
  assembled: "ASSEMBLED",
  normal: "NORMAL",
  lacing: "LACING",
};

/** Recomputes a lacing line's amount. Twine bills KGS x rate; a charge is the flat rate itself. */
export function lacingAmount(line: Pick<LacingLine, "kind" | "kgs" | "rate">): number {
  return line.kind === "twine" ? line.kgs * line.rate : line.rate;
}

/** Lacing twine adds to Total Weight; a flat lacing charge does not (doc §3.2). */
export function lacingWeight(line: Pick<LacingLine, "kind" | "kgs">): number {
  return line.kind === "twine" ? line.kgs : 0;
}

/**
 * Flattens the authored tree into the line list every downstream consumer already understands.
 * Batch and item order is preserved.
 */
export function flattenBatches(batches: QuotationBatch[]): QuotationLineItem[] {
  const out: QuotationLineItem[] = [];

  for (const batch of batches) {
    if (batch.type === "lacing") {
      for (const line of batch.lacing ?? []) {
        out.push({
          id: line.id,
          batchId: batch.id,
          itemCode: line.code,
          description: line.description,
          specification: "LACING",
          qtyPcs: line.kind === "twine" ? line.kgs : 1,
          unit: "KG",
          unitPrice: line.rate,
          weightKg: lacingWeight(line),
          totalPrice: lacingAmount(line),
        });
      }
      continue;
    }

    for (const item of batch.items ?? []) {
      for (const spec of item.specs) {
        out.push({
          id: spec.id,
          batchId: batch.id,
          itemId: item.id,
          itemCode: spec.specCode,
          description: spec.description,
          specification: item.specification,
          qtyPcs: spec.qtyPcs,
          unit: item.qtyUom,
          unitPrice: spec.unitPrice,
          weightKg: spec.weightKg,
          totalPrice: spec.amount,
          pricing: spec.pricing,
        });
      }
    }
  }

  return out;
}
