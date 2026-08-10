import { describe, it, expect } from "vitest";
import { migratePackingList, reconcilePacking, sectionTotals, verifyPacking } from "./packing";
import type { PackingList, QuotationLineItem } from "./types";

function orderItem(over: Partial<QuotationLineItem> = {}): QuotationLineItem {
  return {
    id: "LI-1",
    itemCode: "N-1596",
    description: "Nylon braided net",
    specification: "NYLON BRAIDED",
    qtyPcs: 10,
    unit: "PCS",
    weightKg: 100,
    unitPrice: 50,
    totalPrice: 500,
    ...over,
  } as QuotationLineItem;
}

function list(lines: { itemId?: string; itemCode: string; qtyPcs: number; net?: number; gross?: number }[]): PackingList {
  return {
    id: "PL-1",
    salesOrderId: "SO-1",
    customerId: "CUST-1",
    createdDate: "2026-08-01",
    packedBy: "Elena",
    scope: "full",
    sections: [
      {
        id: "S1",
        title: "Container 1",
        lines: lines.map((l, i) => ({
          id: `L${i}`,
          itemId: l.itemId,
          itemCode: l.itemCode,
          description: l.itemCode,
          qtyPcs: l.qtyPcs,
          netWeightKg: l.net ?? 0,
          grossWeightKg: l.gross ?? 0,
        })),
      },
    ],
  };
}

describe("reconcilePacking", () => {
  it("calls a matching quantity complete", () => {
    const rows = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 10 }])]);
    expect(rows[0].status).toBe("complete");
    expect(rows[0].variance).toBe(0);
  });

  it("reports a shortfall with the variance", () => {
    const rows = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }])]);
    expect(rows[0].status).toBe("short");
    expect(rows[0].variance).toBe(-6);
  });

  it("reports an overship", () => {
    const rows = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 12 }])]);
    expect(rows[0].status).toBe("over");
    expect(rows[0].variance).toBe(2);
  });

  it("marks an untouched line as not packed rather than short", () => {
    const rows = reconcilePacking([orderItem()], []);
    expect(rows[0].status).toBe("not_packed");
    expect(rows[0].packedQty).toBe(0);
  });

  it("counts cumulatively across every list on the order", () => {
    // Three partials that together fill the order. Judging one list alone would call each a short.
    const rows = reconcilePacking(
      [orderItem()],
      [
        list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }]),
        list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }]),
        list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }]),
      ]
    );
    expect(rows[0].packedQty).toBe(10);
    expect(rows[0].status).toBe("complete");
  });

  it("falls back to matching on item code when a row was typed in by hand", () => {
    const rows = reconcilePacking([orderItem()], [list([{ itemCode: "N-1596", qtyPcs: 10 }])]);
    expect(rows[0].status).toBe("complete");
  });

  it("surfaces goods packed that are not on the order at all", () => {
    const rows = reconcilePacking([orderItem()], [list([{ itemCode: "WRONG-1", qtyPcs: 5 }])]);
    const extra = rows.find((r) => r.itemCode === "WRONG-1");
    expect(extra).toBeDefined();
    expect(extra!.orderedQty).toBe(0);
    expect(extra!.status).toBe("over");
  });

  it("separates what is on the current list from what other lists contributed", () => {
    const first = list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }]);
    const second = { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }]), id: "PL-2" };
    const rows = reconcilePacking([orderItem()], [first, second], "PL-2");
    expect(rows[0].packedQty).toBe(7);
    expect(rows[0].packedHere).toBe(3);
  });

  it("leaves packedHere unknown when no current list is given, rather than claiming it is zero", () => {
    // Zero would read as "none of this is on the open list", which is a claim the caller never
    // made. Unknown is the honest answer, and it makes verifyPacking fail safe.
    const rows = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }])]);
    expect(rows[0].packedHere).toBeUndefined();
  });

  it("adds up net and gross across matching rows", () => {
    const rows = reconcilePacking(
      [orderItem()],
      [
        list([
          { itemId: "LI-1", itemCode: "N-1596", qtyPcs: 5, net: 50, gross: 54 },
          { itemId: "LI-1", itemCode: "N-1596", qtyPcs: 5, net: 49, gross: 53 },
        ]),
      ]
    );
    expect(rows[0].netWeightKg).toBe(99);
    expect(rows[0].grossWeightKg).toBe(107);
  });
});

describe("verifyPacking", () => {
  const complete = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 10 }])]);
  const shortRows = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }])]);
  const overRows = reconcilePacking([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 12 }])]);

  it("passes a full shipment that reconciles", () => {
    expect(verifyPacking(complete, "full").ok).toBe(true);
  });

  it("blocks a full shipment that is short, and names the item", () => {
    const v = verifyPacking(shortRows, "full");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("N-1596");
    expect(v.message).toContain("4 of 10");
  });

  it("blocks a final shipment that is short", () => {
    expect(verifyPacking(shortRows, "final").ok).toBe(false);
  });

  it("allows a partial to be short, because that is what partial means", () => {
    const v = verifyPacking(shortRows, "partial");
    expect(v.ok).toBe(true);
    expect(v.message).toContain("outstanding");
  });

  it("nudges a partial that actually completed the order", () => {
    expect(verifyPacking(complete, "partial").message).toContain("final shipment");
  });

  it("blocks an overship under every scope, because it is the wrong goods either way", () => {
    expect(verifyPacking(overRows, "full").ok).toBe(false);
    expect(verifyPacking(overRows, "partial").ok).toBe(false);
    expect(verifyPacking(overRows, "final").ok).toBe(false);
  });

  it("blocks an overship when it cannot tell which list it came from", () => {
    // No current list was named, so there is no basis for calling it somebody else's problem.
    // Fail safe: not knowing whether it can be fixed is no reason to let the goods go.
    expect(overRows[0]?.packedHere ?? overRows.find((r) => r.status === "over")?.packedHere).toBeUndefined();
    expect(verifyPacking(overRows, "partial").ok).toBe(false);
  });

  it("does not block on an overship inherited from a list that is already closed", () => {
    // Nothing on the open list can be edited to fix it, so refusing to close strands the order
    // with no way forward at all.
    const closed = list([{ itemCode: "WRONG-1", qtyPcs: 8 }]);
    const open = { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 10 }]), id: "PL-2" };
    const rows = reconcilePacking([orderItem()], [closed, open], "PL-2");
    const v = verifyPacking(rows, "full");
    expect(v.ok).toBe(true);
    expect(v.message).toContain("earlier list");
    expect(v.message).toContain("WRONG-1");
  });

  it("still blocks when the overship is on the list being closed", () => {
    const closed = list([{ itemCode: "WRONG-1", qtyPcs: 8 }]);
    const open = { ...list([{ itemCode: "WRONG-1", qtyPcs: 2 }]), id: "PL-2" };
    const rows = reconcilePacking([orderItem()], [closed, open], "PL-2");
    expect(verifyPacking(rows, "partial").ok).toBe(false);
  });

  it("still blocks a full shipment that is short, even when an unrelated inherited overship excuses itself", () => {
    // An unfixable overship on WRONG-1 must not wave through a genuine shortfall on LI-1 — that
    // would close a "full" shipment that never actually reconciled.
    const closed = list([{ itemCode: "WRONG-1", qtyPcs: 8 }]);
    const open = { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }]), id: "PL-2" };
    const rows = reconcilePacking([orderItem()], [closed, open], "PL-2");
    const v = verifyPacking(rows, "full");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("short");
  });

  it("blocks closing a list with nothing packed", () => {
    const v = verifyPacking(reconcilePacking([orderItem()], []), "partial");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("Nothing has been packed");
  });
});

describe("sectionTotals", () => {
  it("adds pieces, net and gross across sections", () => {
    const l = list([
      { itemCode: "A", qtyPcs: 2, net: 10, gross: 11 },
      { itemCode: "B", qtyPcs: 3, net: 20, gross: 22 },
    ]);
    expect(sectionTotals(l.sections)).toEqual({ pieces: 5, netKg: 30, grossKg: 33 });
  });

  it("is zero for an empty list rather than throwing", () => {
    expect(sectionTotals([])).toEqual({ pieces: 0, netKg: 0, grossKg: 0 });
  });
});

describe("migratePackingList", () => {
  it("folds an old carton list into one section rather than discarding it", () => {
    const legacy = {
      id: "PL-9",
      salesOrderId: "SO-9",
      createdDate: "2026-01-01",
      packedBy: "Elena",
      cartons: [
        { id: "C1", markNo: "PTS/1", itemCode: "N-1596", qtyPcs: 3, netWeightKg: 30, grossWeightKg: 32, status: "packed" },
      ],
    } as unknown as import("./types").PackingList;
    const migrated = migratePackingList(legacy);
    expect(migrated.sections).toHaveLength(1);
    expect(migrated.sections[0].lines[0].qtyPcs).toBe(3);
    expect(migrated.sections[0].lines[0].description).toContain("PTS/1");
    expect(migrated.scope).toBe("full");
  });

  it("leaves a list that already has sections alone", () => {
    const l = list([{ itemCode: "A", qtyPcs: 1 }]);
    expect(migratePackingList(l)).toEqual(l);
  });
});
