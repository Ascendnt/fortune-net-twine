import { describe, it, expect } from "vitest";
import {
  linesForOrder,
  listOrders,
  migratePackingList,
  netWeightFor,
  nextPackingListId,
  perPieceWeightFor,
  piRefLine,
  reconcileOrder,
  scopeLabel,
  sectionTotals,
  verifyPacking,
  verifyPackingList,
} from "./packing";
import type { PackingList, PackingListOrderRef, QuotationLineItem } from "./types";

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

function list(
  lines: { salesOrderId?: string; itemId?: string; itemCode: string; qtyPcs: number; net?: number; gross?: number }[],
  over: Partial<PackingList> = {}
): PackingList {
  return {
    id: "PL-2026-0001",
    orders: [{ salesOrderId: "SO-1", piRef: "PI-1", scope: "full" }],
    customerId: "CUST-1",
    createdDate: "2026-08-01",
    packedBy: "Elena",
    sections: [
      {
        id: "S1",
        title: "Container 1",
        lines: lines.map((l, i) => ({
          id: `L${i}`,
          salesOrderId: l.salesOrderId ?? "SO-1",
          itemId: l.itemId,
          itemCode: l.itemCode,
          description: l.itemCode,
          qtyPcs: l.qtyPcs,
          netWeightKg: l.net ?? 0,
          grossWeightKg: l.gross ?? 0,
        })),
      },
    ],
    ...over,
  };
}

describe("listOrders", () => {
  it("reads the orders off a consolidated list", () => {
    const refs: PackingListOrderRef[] = [
      { salesOrderId: "SO-1", piRef: "PI-1", scope: "full" },
      { salesOrderId: "SO-2", piRef: "PI-2", scope: "partial", partialNo: 2 },
    ];
    expect(listOrders(list([], { orders: refs }))).toEqual(refs);
  });

  it("folds a list saved before consolidation into a single-order list", () => {
    const legacy = {
      id: "PL-2207",
      salesOrderId: "SO-2207",
      scope: "partial",
      customerId: "CUST-1",
      createdDate: "2026-08-01",
      packedBy: "Elena",
      sections: [],
    } as unknown as PackingList;
    expect(listOrders(legacy)).toEqual([{ salesOrderId: "SO-2207", piRef: "SO-2207", scope: "partial" }]);
  });
});

describe("linesForOrder", () => {
  it("only counts the rows booked against that order", () => {
    const consolidated = list(
      [
        { salesOrderId: "SO-1", itemCode: "N-1596", qtyPcs: 4 },
        { salesOrderId: "SO-2", itemCode: "N-2000", qtyPcs: 7 },
      ],
      {
        orders: [
          { salesOrderId: "SO-1", piRef: "PI-1", scope: "partial", partialNo: 1 },
          { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
        ],
      }
    );
    expect(linesForOrder([consolidated], "SO-1").map((l) => l.qtyPcs)).toEqual([4]);
    expect(linesForOrder([consolidated], "SO-2").map((l) => l.qtyPcs)).toEqual([7]);
  });

  it("gives an unattributed row to the only order on a single-order list", () => {
    const single = list([{ itemCode: "N-1596", qtyPcs: 3 }]);
    single.sections[0].lines[0].salesOrderId = undefined;
    expect(linesForOrder([single], "SO-1")).toHaveLength(1);
  });

  it("gives an unattributed row to nobody on a consolidated list", () => {
    // Guessing would credit one customer's order with another's goods, which is the one mistake
    // this module exists to catch.
    const consolidated = list([{ itemCode: "N-1596", qtyPcs: 3 }], {
      orders: [
        { salesOrderId: "SO-1", piRef: "PI-1", scope: "full" },
        { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
      ],
    });
    consolidated.sections[0].lines[0].salesOrderId = undefined;
    expect(linesForOrder([consolidated], "SO-1")).toHaveLength(0);
    expect(linesForOrder([consolidated], "SO-2")).toHaveLength(0);
  });
});

describe("reconcileOrder", () => {
  const reconcile = (items: QuotationLineItem[], lists: PackingList[], currentListId?: string) =>
    reconcileOrder("SO-1", items, lists, currentListId);

  it("calls a matching quantity complete", () => {
    const rows = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 10 }])]);
    expect(rows[0].status).toBe("complete");
    expect(rows[0].variance).toBe(0);
  });

  it("reports a shortfall with the variance", () => {
    const rows = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }])]);
    expect(rows[0].status).toBe("short");
    expect(rows[0].variance).toBe(-6);
  });

  it("reports an overship", () => {
    const rows = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 12 }])]);
    expect(rows[0].status).toBe("over");
    expect(rows[0].variance).toBe(2);
  });

  it("marks an untouched line as not packed rather than short", () => {
    const rows = reconcile([orderItem()], []);
    expect(rows[0].status).toBe("not_packed");
    expect(rows[0].packedQty).toBe(0);
  });

  it("counts cumulatively across every list on the order", () => {
    // Three partials that together fill the order. Judging one list alone would call each a short.
    const rows = reconcile(
      [orderItem()],
      [
        list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }]),
        { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }]), id: "PL-2026-0002" },
        { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }]), id: "PL-2026-0003" },
      ]
    );
    expect(rows[0].packedQty).toBe(10);
    expect(rows[0].status).toBe("complete");
  });

  it("ignores another order's rows in the same container", () => {
    // The whole point of consolidation: SO-2's ten pieces must not fill SO-1's order.
    const consolidated = list(
      [
        { salesOrderId: "SO-1", itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 },
        { salesOrderId: "SO-2", itemCode: "N-1596", qtyPcs: 10 },
      ],
      {
        orders: [
          { salesOrderId: "SO-1", piRef: "PI-1", scope: "partial", partialNo: 1 },
          { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
        ],
      }
    );
    const rows = reconcile([orderItem()], [consolidated]);
    expect(rows[0].packedQty).toBe(4);
    expect(rows[0].status).toBe("short");
  });

  it("falls back to matching on item code when a row was typed in by hand", () => {
    const rows = reconcile([orderItem()], [list([{ itemCode: "N-1596", qtyPcs: 10 }])]);
    expect(rows[0].status).toBe("complete");
  });

  it("surfaces goods packed that are not on the order at all", () => {
    const rows = reconcile([orderItem()], [list([{ itemCode: "WRONG-1", qtyPcs: 5 }])]);
    const extra = rows.find((r) => r.itemCode === "WRONG-1");
    expect(extra).toBeDefined();
    expect(extra!.orderedQty).toBe(0);
    expect(extra!.status).toBe("over");
  });

  it("separates what is on the current list from what other lists contributed", () => {
    const first = list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }]);
    const second = { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }]), id: "PL-2026-0002" };
    const rows = reconcile([orderItem()], [first, second], "PL-2026-0002");
    expect(rows[0].packedQty).toBe(7);
    expect(rows[0].packedHere).toBe(3);
  });

  it("leaves packedHere unknown when no current list is given, rather than claiming it is zero", () => {
    // Zero would read as "none of this is on the open list", which is a claim the caller never
    // made. Unknown is the honest answer, and it makes verifyPacking fail safe.
    const rows = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }])]);
    expect(rows[0].packedHere).toBeUndefined();
  });

  it("adds up net and gross across matching rows", () => {
    const rows = reconcile(
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
  const reconcile = (items: QuotationLineItem[], lists: PackingList[], currentListId?: string) =>
    reconcileOrder("SO-1", items, lists, currentListId);
  const complete = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 10 }])]);
  const shortRows = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }])]);
  const overRows = reconcile([orderItem()], [list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 12 }])]);

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
    const open = { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 10 }]), id: "PL-2026-0002" };
    const rows = reconcile([orderItem()], [closed, open], "PL-2026-0002");
    const v = verifyPacking(rows, "full");
    expect(v.ok).toBe(true);
    expect(v.message).toContain("earlier list");
    expect(v.message).toContain("WRONG-1");
  });

  it("still blocks when the overship is on the list being closed", () => {
    const closed = list([{ itemCode: "WRONG-1", qtyPcs: 8 }]);
    const open = { ...list([{ itemCode: "WRONG-1", qtyPcs: 2 }]), id: "PL-2026-0002" };
    const rows = reconcile([orderItem()], [closed, open], "PL-2026-0002");
    expect(verifyPacking(rows, "partial").ok).toBe(false);
  });

  it("still blocks a full shipment that is short, even when an unrelated inherited overship excuses itself", () => {
    // An unfixable overship on WRONG-1 must not wave through a genuine shortfall on LI-1. That
    // would close a "full" shipment that never actually reconciled.
    const closed = list([{ itemCode: "WRONG-1", qtyPcs: 8 }]);
    const open = { ...list([{ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 4 }]), id: "PL-2026-0002" };
    const rows = reconcile([orderItem()], [closed, open], "PL-2026-0002");
    const v = verifyPacking(rows, "full");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("short");
  });

  it("blocks closing a list with nothing packed", () => {
    const v = verifyPacking(reconcile([orderItem()], []), "partial");
    expect(v.ok).toBe(false);
    expect(v.message).toContain("Nothing has been packed");
  });
});

describe("verifyPackingList", () => {
  const items = {
    "SO-1": [orderItem()],
    "SO-2": [orderItem({ id: "LI-9", itemCode: "N-2000", qtyPcs: 4 })],
  };
  const consolidated = (soOneQty: number, soTwoQty: number) =>
    list(
      [
        { salesOrderId: "SO-1", itemId: "LI-1", itemCode: "N-1596", qtyPcs: soOneQty },
        { salesOrderId: "SO-2", itemId: "LI-9", itemCode: "N-2000", qtyPcs: soTwoQty },
      ],
      {
        orders: [
          { salesOrderId: "SO-1", piRef: "PI-1", scope: "partial", partialNo: 1 },
          { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
        ],
      }
    );

  it("judges each P.I. against its own scope", () => {
    // The case the factory's own sheet shows: one PI going out in full in the same container that
    // takes another's first partial. Judging both by one scope would fail the partial.
    const v = verifyPackingList(consolidated(4, 4), items, [consolidated(4, 4)]);
    expect(v.ok).toBe(true);
    expect(v.perOrder).toHaveLength(2);
    expect(v.perOrder.find((o) => o.salesOrderId === "SO-1")!.ok).toBe(true);
  });

  it("blocks the whole load when one P.I. does not reconcile, and names it", () => {
    const l = consolidated(4, 2);
    const v = verifyPackingList(l, items, [l]);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("PI-2");
  });

  it("says how many orders are holding it up when more than one is", () => {
    const l = list([], {
      orders: [
        { salesOrderId: "SO-1", piRef: "PI-1", scope: "full" },
        { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
      ],
    });
    const v = verifyPackingList(l, items, [l]);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("2 of the 2 orders");
  });

  it("refuses a list with no order on it at all", () => {
    expect(verifyPackingList(list([], { orders: [] }), items, []).ok).toBe(false);
  });
});

describe("nextPackingListId", () => {
  it("starts the year's series at one", () => {
    expect(nextPackingListId([], "2026-08-13")).toBe("PL-2026-0001");
  });

  it("carries on from the highest number already issued", () => {
    expect(nextPackingListId(["PL-2026-0001", "PL-2026-0007", "PL-2026-0003"], "2026-08-13")).toBe("PL-2026-0008");
  });

  it("restarts in a new year", () => {
    expect(nextPackingListId(["PL-2026-0042"], "2027-01-04")).toBe("PL-2027-0001");
  });

  it("ignores ids from the old order-derived series", () => {
    // The point of the change: a list can cover several orders, so it cannot be named after one.
    // Lists still carrying an SO-derived id must not be read as part of this series.
    expect(nextPackingListId(["PL-2207", "PL-2208-2"], "2026-08-13")).toBe("PL-2026-0001");
  });
});

describe("piRefLine", () => {
  it("writes a single P.I. the way the sheet does", () => {
    expect(piRefLine([{ salesOrderId: "SO-1", piRef: "32913", scope: "full" }])).toBe("P/I No. 32913");
  });

  it("lists several with an ampersand before the last, as the factory writes them", () => {
    expect(
      piRefLine([
        { salesOrderId: "SO-1", piRef: "32913", scope: "full" },
        { salesOrderId: "SO-2", piRef: "32930", scope: "partial", partialNo: 2 },
        { salesOrderId: "SO-3", piRef: "32972R1", scope: "partial", partialNo: 5 },
      ])
    ).toBe("P/I Nos. 32913, 32930 & 32972R1");
  });

  it("does not repeat a P.I. that appears twice", () => {
    expect(
      piRefLine([
        { salesOrderId: "SO-1", piRef: "32913", scope: "full" },
        { salesOrderId: "SO-2", piRef: "32913", scope: "full" },
      ])
    ).toBe("P/I No. 32913");
  });
});

describe("scopeLabel", () => {
  it("numbers partials by ordinal, as the printed sheet does", () => {
    expect(scopeLabel("partial", 2)).toBe("2nd-Partial Shipment");
    expect(scopeLabel("partial", 5)).toBe("5th-Partial Shipment");
    expect(scopeLabel("partial", 11)).toBe("11th-Partial Shipment");
    expect(scopeLabel("full")).toBe("Full Shipment");
    expect(scopeLabel("final")).toBe("Final Shipment");
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

describe("perPieceWeightFor / netWeightFor", () => {
  // 10 pieces quoted at 100 kg between them, so one piece is 10 kg.
  const items = [orderItem()];

  it("divides the ordered line's weight back down to one piece", () => {
    expect(perPieceWeightFor({ itemId: "LI-1", itemCode: "N-1596" }, items)).toBe(10);
  });

  it("matches on item code when the row was typed in by hand", () => {
    expect(perPieceWeightFor({ itemId: undefined, itemCode: "N-1596" }, items)).toBe(10);
  });

  it("gives no answer for a row that matches nothing on the order", () => {
    expect(perPieceWeightFor({ itemId: undefined, itemCode: "NOT-ORDERED" }, items)).toBeUndefined();
  });

  it("gives no answer rather than dividing by a zero quantity", () => {
    expect(perPieceWeightFor({ itemId: "LI-1", itemCode: "N-1596" }, [orderItem({ qtyPcs: 0 })])).toBeUndefined();
  });

  it("multiplies back up by the pieces on the row", () => {
    expect(netWeightFor({ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 3 }, items)).toBe(30);
  });

  it("rounds to the two decimals weights are recorded in", () => {
    const odd = [orderItem({ qtyPcs: 3, weightKg: 100 })];
    expect(netWeightFor({ itemId: "LI-1", itemCode: "N-1596", qtyPcs: 1 }, odd)).toBe(33.33);
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
    } as unknown as PackingList;
    const migrated = migratePackingList(legacy);
    expect(migrated.sections).toHaveLength(1);
    expect(migrated.sections[0].lines[0].qtyPcs).toBe(3);
    expect(migrated.sections[0].lines[0].baleNo).toBe("PTS/1");
    expect(migrated.orders).toEqual([{ salesOrderId: "SO-9", piRef: "SO-9", scope: "full" }]);
  });

  it("moves a pre-consolidation list's single order onto the orders array", () => {
    const legacy = {
      id: "PL-2207",
      salesOrderId: "SO-2207",
      scope: "final",
      customerId: "CUST-1",
      createdDate: "2026-08-01",
      packedBy: "Elena",
      sections: [],
    } as unknown as PackingList;
    expect(migratePackingList(legacy).orders).toEqual([
      { salesOrderId: "SO-2207", piRef: "SO-2207", scope: "final" },
    ]);
  });

  it("leaves the orders and rows of a current-shape list alone", () => {
    const l = list([{ itemCode: "A", qtyPcs: 1 }]);
    const migrated = migratePackingList(l);
    expect(migrated.orders).toEqual(l.orders);
    expect(migrated.sections[0].lines).toEqual(l.sections[0].lines);
  });

  it("gives a section written before it carried a P.I. the one its rows agree on", () => {
    const l = list([{ itemCode: "A", qtyPcs: 1, salesOrderId: "SO-2" }], {
      orders: [
        { salesOrderId: "SO-1", piRef: "PI-1", scope: "full" },
        { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
      ],
    });
    expect(migratePackingList(l).sections[0].salesOrderId).toBe("SO-2");
  });

  it("leaves a genuinely mixed section unset rather than guessing which P.I. it is", () => {
    const l = list(
      [
        { itemCode: "A", qtyPcs: 1, salesOrderId: "SO-1" },
        { itemCode: "B", qtyPcs: 1, salesOrderId: "SO-2" },
      ],
      {
        orders: [
          { salesOrderId: "SO-1", piRef: "PI-1", scope: "full" },
          { salesOrderId: "SO-2", piRef: "PI-2", scope: "full" },
        ],
      }
    );
    expect(migratePackingList(l).sections[0].salesOrderId).toBeUndefined();
  });

  it("falls back to the load's only order for a section with no rows to go on", () => {
    const l = list([], { sections: [{ id: "S1", title: "Container 1", lines: [] }] });
    expect(migratePackingList(l).sections[0].salesOrderId).toBe("SO-1");
  });
});
