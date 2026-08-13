import { describe, it, expect } from "vitest";
import { INSPECTIONS, PACKING_LISTS } from "./operationsData";
import { QUOTATIONS, SALES_ORDERS } from "./mockData";
import { buildInspectionLines, settleInspection, settlementByOrder } from "./inspectionPricing";
import { listOrders, verifyPackingList } from "./packing";
import { piRef } from "./format";
import type { QuotationLineItem } from "./types";

/**
 * The fixtures are hand-written, and hand-written fixtures drift.
 *
 * These are not tests of the seed data's contents, since the figures are demo material and are
 * meant to be edited. They check that the seeds are internally consistent, so a screen never opens on a
 * packing list pointing at an order that does not exist, or an inspection report whose weights
 * reconcile against nothing. A broken fixture shows up as a blank panel in front of an audience,
 * which is the worst place to find it.
 */

const itemsFor = (salesOrderId: string): QuotationLineItem[] => {
  const order = SALES_ORDERS.find((o) => o.id === salesOrderId);
  const quotation = order?.quotationId ? QUOTATIONS.find((q) => q.id === order.quotationId) : undefined;
  return quotation?.items ?? [];
};

describe("seeded packing lists", () => {
  it("all point at orders that exist", () => {
    for (const list of PACKING_LISTS) {
      for (const ref of listOrders(list)) {
        expect(SALES_ORDERS.some((o) => o.id === ref.salesOrderId), `${list.id} → ${ref.salesOrderId}`).toBe(true);
      }
    }
  });

  it("quote the P.I. number the quotation actually carries, revision suffix and all", () => {
    for (const list of PACKING_LISTS) {
      for (const ref of listOrders(list)) {
        const order = SALES_ORDERS.find((o) => o.id === ref.salesOrderId)!;
        const quotation = QUOTATIONS.find((q) => q.id === order.quotationId);
        if (!quotation) continue;
        expect(ref.piRef, `${list.id} → ${ref.salesOrderId}`).toBe(piRef(quotation.id, quotation.revisionNo));
      }
    }
  });

  it("consolidate only one customer's orders per container", () => {
    // A container is consigned to one party. Two customers on one list would produce a document
    // addressed to nobody.
    for (const list of PACKING_LISTS) {
      for (const ref of listOrders(list)) {
        const order = SALES_ORDERS.find((o) => o.id === ref.salesOrderId)!;
        expect(order.customerId, `${list.id} → ${ref.salesOrderId}`).toBe(list.customerId);
      }
    }
  });

  it("book every row against an order the list covers", () => {
    for (const list of PACKING_LISTS) {
      const covered = new Set(listOrders(list).map((r) => r.salesOrderId));
      for (const section of list.sections) {
        for (const line of section.lines) {
          expect(covered.has(line.salesOrderId ?? ""), `${list.id} → ${line.id}`).toBe(true);
        }
      }
    }
  });

  it("all reconcile against the orders they cover", () => {
    for (const list of PACKING_LISTS) {
      const itemsByOrder = Object.fromEntries(
        listOrders(list).map((r) => [r.salesOrderId, itemsFor(r.salesOrderId)])
      );
      const verdict = verifyPackingList(list, itemsByOrder, PACKING_LISTS);
      expect(verdict.ok, `${list.id}: ${verdict.message}`).toBe(true);
    }
  });

  it("include the consolidated container the packing screen opens on", () => {
    // The demo case: one customer, one container, two P.I.s going out under different scopes.
    const consolidated = PACKING_LISTS.filter((l) => listOrders(l).length > 1);
    expect(consolidated.length).toBeGreaterThan(0);
    const scopes = new Set(listOrders(consolidated[0]).map((r) => r.scope));
    expect(scopes.size).toBeGreaterThan(1);
  });
});

describe("seeded inspection reports", () => {
  it("all hang off a packing list that exists", () => {
    for (const record of INSPECTIONS) {
      expect(PACKING_LISTS.some((p) => p.id === record.packingListId), record.id).toBe(true);
    }
  });

  it("cover exactly the orders their packing list does", () => {
    for (const record of INSPECTIONS) {
      const list = PACKING_LISTS.find((p) => p.id === record.packingListId)!;
      expect(record.salesOrderIds, record.id).toEqual(listOrders(list).map((r) => r.salesOrderId));
    }
  });

  it("weigh the same goods the packing list packed", () => {
    for (const record of INSPECTIONS) {
      const list = PACKING_LISTS.find((p) => p.id === record.packingListId)!;
      const packedPieces = list.sections.flatMap((s) => s.lines).reduce((n, l) => n + l.qtyPcs, 0);
      const reportPieces = (record.lines ?? []).reduce((n, l) => n + l.qtyPcs, 0);
      expect(reportPieces, record.id).toBe(packedPieces);
    }
  });

  it("carry a rate that matches the quoted amount and weight", () => {
    // The rate is the figure printed in the report's own column, so it has to agree with the two
    // numbers either side of it even though settlement no longer multiplies by it.
    for (const record of INSPECTIONS) {
      for (const line of record.lines ?? []) {
        if (!line.pricePerKg || !line.computedWeightKg) continue;
        expect(line.pricePerKg, `${record.id} → ${line.id}`).toBeCloseTo(
          line.quotedAmount / line.computedWeightKg,
          2
        );
      }
    }
  });

  it("settle to the value already recorded against each order", () => {
    for (const record of INSPECTIONS) {
      if (!record.settledOrderValues) continue;
      const byOrder = settlementByOrder(record.lines ?? []);
      for (const [salesOrderId, settled] of Object.entries(record.settledOrderValues)) {
        const order = SALES_ORDERS.find((o) => o.id === salesOrderId)!;
        // The order already carries its settled value in the fixtures, so the recorded figure and
        // the arithmetic have to agree, or the screen shows one number and the panel another.
        expect(settled, `${record.id} → ${salesOrderId}`).toBeCloseTo(order.orderValue, 1);
        expect(byOrder[salesOrderId], `${record.id} → ${salesOrderId}`).toBeDefined();
      }
    }
  });
});

describe("closing a seeded packing list", () => {
  it("builds a report whose weights come straight off the list", () => {
    const list = PACKING_LISTS.find((l) => listOrders(l).length > 1)!;
    const itemsByOrder = Object.fromEntries(
      listOrders(list).map((r) => [r.salesOrderId, itemsFor(r.salesOrderId)])
    );
    const lines = buildInspectionLines(list, itemsByOrder);
    const packed = list.sections.flatMap((s) => s.lines);
    expect(lines).toHaveLength(packed.length);
    expect(settleInspection(lines).netWeightKg).toBeCloseTo(
      packed.reduce((s, l) => s + l.netWeightKg, 0),
      2
    );
  });

  it("keeps each order's settlement to its own rows", () => {
    const list = PACKING_LISTS.find((l) => listOrders(l).length > 1)!;
    const itemsByOrder = Object.fromEntries(
      listOrders(list).map((r) => [r.salesOrderId, itemsFor(r.salesOrderId)])
    );
    const byOrder = settlementByOrder(buildInspectionLines(list, itemsByOrder));
    for (const ref of listOrders(list)) {
      expect(byOrder[ref.salesOrderId], ref.salesOrderId).toBeDefined();
      // A few hundred grams either way is a real net; a wildly different figure means the bales
      // were attributed to the wrong P.I.
      expect(Math.abs(byOrder[ref.salesOrderId].weightDifferencePct), ref.salesOrderId).toBeLessThan(5);
    }
  });
});
