import { describe, expect, it } from "vitest";
import {
  BATCH_LABEL,
  emptyPricing,
  flattenBatches,
  isPricingUntouched,
  lacingAmount,
  lacingWeight,
  newBatch,
  newLacingLine,
  newSpecLine,
} from "./batches";
import { LACING_CATALOG, SPEC_MASTER, specRowLabel } from "./specMaster";
import type { QuotationBatch, SpecLine } from "./types";

function specLine(over: Partial<SpecLine> = {}): SpecLine {
  return {
    id: "s1",
    specCode: "N-1596",
    description: 'NO.120(210/22x16) 3-1/2"STR 122MD x 50FL',
    meshDepth: "122MD",
    length: "50FL",
    weightPerPc: 495,
    givenPriceKg: 5,
    qtyPcs: 10,
    pricing: emptyPricing(5),
    unitPrice: 2475,
    amount: 24750,
    weightKg: 4950,
    ...over,
  };
}

describe("factories", () => {
  it("seeds each batch type with only its own payload", () => {
    expect(newBatch("assembled")).toMatchObject({ type: "assembled", title: "", items: [] });
    expect(newBatch("normal").items).toEqual([]);
    expect(newBatch("normal").title).toBeUndefined();
    expect(newBatch("lacing")).toMatchObject({ type: "lacing", lacing: [] });
    expect(newBatch("note")).toMatchObject({ type: "note", note: "" });
  });

  it("gives every batch a distinct id", () => {
    const ids = new Set([newBatch("normal").id, newBatch("normal").id, newBatch("note").id]);
    expect(ids.size).toBe(3);
  });

  it("labels batches for the UI banner", () => {
    expect(BATCH_LABEL.assembled).toBe("ASSEMBLED");
    expect(BATCH_LABEL.note).toBe("NOTE");
  });

  it("creates spec lines at documented defaults", () => {
    const row = SPEC_MASTER.find((r) => r.code === "N-1596")!;
    const line = newSpecLine(row);
    expect(line.givenPriceKg).toBe(0);
    expect(line.qtyPcs).toBe(1);
    expect(line.pricing.appliedRuleIds).toEqual([]);
    expect(line.weightPerPc).toBe(495);
    // Weight lands immediately from the master row — before any pricing is entered.
    expect(line.weightKg).toBe(495);
    expect(line.description).toBe(specRowLabel(row));
  });

  it("treats a default pricing snapshot as untouched", () => {
    expect(isPricingUntouched(emptyPricing(0))).toBe(true);
    expect(isPricingUntouched({ ...emptyPricing(0), appliedRuleIds: ["r_comm"] })).toBe(false);
    expect(isPricingUntouched({ ...emptyPricing(0), laborHours: 1 })).toBe(false);
  });
});

describe("lacing arithmetic — doc §5.3", () => {
  it("bills twine by the kilo", () => {
    expect(lacingAmount({ kind: "twine", kgs: 100, rate: 2.5 })).toBe(250);
    expect(lacingWeight({ kind: "twine", kgs: 100 })).toBe(100);
  });

  it("treats a charge as a flat amount carrying no weight", () => {
    expect(lacingAmount({ kind: "charge", kgs: 0, rate: 50 })).toBe(50);
    expect(lacingWeight({ kind: "charge", kgs: 0 })).toBe(0);
  });

  it("seeds a new lacing line from the catalog", () => {
    const line = newLacingLine(LACING_CATALOG[0]);
    expect(line).toMatchObject({ code: "LC-001", kind: "twine", rate: 2.5, kgs: 0 });
  });
});

describe("flattenBatches", () => {
  const batches: QuotationBatch[] = [
    {
      id: "b1",
      type: "normal",
      items: [
        {
          id: "i1",
          specification: "NYLON BRAIDED NET SK DSTB DWS",
          material: "Nylon",
          netType: "Braided Net",
          weightUom: "KGS",
          qtyUom: "PCS",
          specs: [specLine()],
        },
      ],
    },
    {
      id: "b2",
      type: "lacing",
      lacing: [
        { id: "l1", code: "LC-001", description: "Lacing Twine Nylon Tarred", kind: "twine", kgs: 100, rate: 2.5, amount: 250 },
        { id: "l2", code: "LC-006", description: "Lacing Charge", kind: "charge", kgs: 0, rate: 50, amount: 50 },
      ],
    },
    { id: "b3", type: "note", note: "Prices are FOB Manila and valid for 30 days." },
  ];

  it("emits one line per spec row and per lacing entry, and none for notes", () => {
    expect(flattenBatches(batches)).toHaveLength(3);
  });

  it("tags every line with its batch, and spec lines with their item", () => {
    const [spec, twine, charge] = flattenBatches(batches);
    expect(spec).toMatchObject({ batchId: "b1", itemId: "i1", itemCode: "N-1596" });
    expect(twine).toMatchObject({ batchId: "b2", itemCode: "LC-001" });
    expect(twine.itemId).toBeUndefined();
    expect(charge).toMatchObject({ batchId: "b2", itemCode: "LC-006" });
  });

  it("carries amount and weight through unchanged", () => {
    const [spec, twine, charge] = flattenBatches(batches);
    expect(spec).toMatchObject({ totalPrice: 24750, weightKg: 4950, unitPrice: 2475, unit: "PCS" });
    expect(twine).toMatchObject({ totalPrice: 250, weightKg: 100, qtyPcs: 100, unit: "KGS" });
    expect(charge).toMatchObject({ totalPrice: 50, weightKg: 0, qtyPcs: 1 });
  });

  it("puts the item's composed specification on each of its spec lines", () => {
    expect(flattenBatches(batches)[0].specification).toBe("NYLON BRAIDED NET SK DSTB DWS");
  });

  it("preserves batch and item order", () => {
    const reordered: QuotationBatch[] = [batches[2], batches[1], batches[0]];
    expect(flattenBatches(reordered).map((l) => l.itemCode)).toEqual(["LC-001", "LC-006", "N-1596"]);
  });

  it("returns nothing for an empty or note-only quotation", () => {
    expect(flattenBatches([])).toEqual([]);
    expect(flattenBatches([{ id: "b", type: "note", note: "hi" }])).toEqual([]);
    expect(flattenBatches([newBatch("assembled")])).toEqual([]);
  });
});

describe("spec master integrity", () => {
  it("has unique codes", () => {
    const codes = SPEC_MASTER.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("carries the transcribed reference rows verbatim", () => {
    const byCode = Object.fromEntries(SPEC_MASTER.map((r) => [r.code, r]));
    expect(byCode["N-1596"]).toMatchObject({ length: "50FL", weightPerPc: 495 });
    expect(byCode["N-1599"]).toMatchObject({ length: "70FL(1656ML)", weightPerPc: 673.6 });
    expect(byCode["N-1597"].weightPerPc).toBe(590);
    expect(byCode["N-1598"].weightPerPc).toBe(689);
  });

  it("composes the row label the way the reference app does", () => {
    const row = SPEC_MASTER.find((r) => r.code === "N-1599")!;
    expect(specRowLabel(row)).toBe('NO.120(210/22x16) 3-1/2"STR 122MD x 70FL(1656ML)');
  });

  it("gives every row a positive weight per piece", () => {
    expect(SPEC_MASTER.every((r) => r.weightPerPc > 0)).toBe(true);
  });

  it("has exactly one flat-charge lacing row", () => {
    expect(LACING_CATALOG.filter((r) => r.kind === "charge").map((r) => r.code)).toEqual(["LC-006"]);
  });
});
