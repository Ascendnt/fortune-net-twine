import type {
  PackingLine,
  PackingList,
  PackingListOrderRef,
  PackingSection,
  QuotationLineItem,
  ShipmentScope,
} from "./types";

/**
 * Reconciling what was packed against what was ordered.
 *
 * The packing screen's job is not to design cartons. It is to answer one question before goods
 * leave the yard: does what we are shipping match what the customer bought? Everything here is a
 * pure function over the orders' lines and the packing lists raised against them, so the answer can
 * be tested rather than eyeballed.
 *
 * Two things make that harder than it sounds, and both come from how containers are actually
 * filled. A list covers SEVERAL orders, because customers consolidate their own orders to make up
 * a full container, so every count has to be attributed to the order it belongs to before it means
 * anything. And quantities are counted CUMULATIVELY across every list touching that order: an order
 * shipped in three partials is only complete when the three together add up, and checking one list
 * in isolation would call every partial a shortfall.
 */

export type PackedStatus = "complete" | "short" | "over" | "not_packed";

export interface PackedRow {
  itemId: string;
  itemCode: string;
  description: string;
  orderedQty: number;
  packedQty: number;
  /**
   * How much of `packedQty` sits on the list currently being worked on.
   *
   * This is what makes a problem actionable or not. An excess on the open list can be corrected by
   * editing it; an excess inherited from a list closed months ago cannot, and blocking on it would
   * leave the user with no way forward at all.
   *
   * `undefined` means the caller did not say which list is current, so there is no basis for
   * deciding. That case is treated as blocking rather than waved through: not knowing whether an
   * overship can be fixed is not a reason to let the goods go.
   */
  packedHere?: number;
  /** Packed less ordered. Negative is a shortfall, positive is an overship. */
  variance: number;
  status: PackedStatus;
  netWeightKg: number;
  grossWeightKg: number;
}

/**
 * The orders a list covers, whatever shape it was saved in.
 *
 * Lists written before consolidation carry a single `salesOrderId` and a list-level `scope`. Rather
 * than make every caller test for that, this is the one place that knows, and everything else reads
 * `orders`.
 */
export function listOrders(list: PackingList): PackingListOrderRef[] {
  if (list.orders?.length) return list.orders;
  if (!list.salesOrderId) return [];
  return [{ salesOrderId: list.salesOrderId, piRef: list.salesOrderId, scope: list.scope ?? "full" }];
}

/** Whether a list carries goods for a given order. */
export function coversOrder(list: PackingList, salesOrderId: string): boolean {
  return listOrders(list).some((o) => o.salesOrderId === salesOrderId);
}

/** How that order is going out on this list: in full, or as which partial. */
export function orderRef(list: PackingList, salesOrderId: string): PackingListOrderRef | undefined {
  return listOrders(list).find((o) => o.salesOrderId === salesOrderId);
}

/** Every packing line across a set of lists, flattened out of its sections. */
export function allLines(lists: PackingList[]): PackingLine[] {
  return lists.flatMap((l) => (l.sections ?? []).flatMap((s) => s.lines));
}

/**
 * Every line on these lists that belongs to one order.
 *
 * A row states its own order once lists can be consolidated. Where it does not, which happens on a
 * blank row typed in by hand or a list saved before consolidation, it belongs to the list's only
 * order, and to nothing at all if the list covers several. Guessing on a consolidated list would
 * credit one customer's order with another's goods, which is the one mistake this module exists to
 * catch.
 */
export function linesForOrder(lists: PackingList[], salesOrderId: string): PackingLine[] {
  return lists.flatMap((list) => {
    const orders = listOrders(list);
    const soleOrder = orders.length === 1 ? orders[0].salesOrderId : undefined;
    return (list.sections ?? [])
      .flatMap((s) => s.lines)
      .filter((l) => (l.salesOrderId ?? soleOrder) === salesOrderId);
  });
}

/**
 * Matches packed rows to ordered rows, for one order.
 *
 * Matched on `itemId` when the row was drawn from the order, and on item code otherwise, because a
 * row typed straight from the plant's paperwork has no link back to a quotation line.
 */
export function reconcileOrder(
  salesOrderId: string,
  orderItems: QuotationLineItem[],
  /** Every list that might touch this order, consolidated or not. */
  lists: PackingList[],
  /** The list being worked on, so its own contribution can be told apart from the rest. */
  currentListId?: string
): PackedRow[] {
  const packed = linesForOrder(lists, salesOrderId);
  const here = linesForOrder(
    lists.filter((l) => l.id === currentListId),
    salesOrderId
  );
  const matches = (p: { itemId?: string; itemCode: string }, li: QuotationLineItem) =>
    p.itemId ? p.itemId === li.id : p.itemCode === li.itemCode;

  const rows: PackedRow[] = orderItems.map((li) => {
    const mine = packed.filter((p) => matches(p, li));
    const packedQty = mine.reduce((s, p) => s + p.qtyPcs, 0);
    const variance = packedQty - li.qtyPcs;
    return {
      itemId: li.id,
      itemCode: li.itemCode,
      description: li.description,
      orderedQty: li.qtyPcs,
      packedQty,
      packedHere: currentListId ? here.filter((p) => matches(p, li)).reduce((s, p) => s + p.qtyPcs, 0) : undefined,
      variance,
      status: packedQty === 0 ? "not_packed" : variance === 0 ? "complete" : variance < 0 ? "short" : "over",
      netWeightKg: mine.reduce((s, p) => s + p.netWeightKg, 0),
      grossWeightKg: mine.reduce((s, p) => s + p.grossWeightKg, 0),
    };
  });

  // Rows packed that are not on the order at all. Silently dropping them would hide the case that
  // matters most: the wrong goods going into the container.
  const orderedCodes = new Set(orderItems.map((li) => li.itemCode));
  const extraCodes = [...new Set(packed.filter((p) => !orderedCodes.has(p.itemCode)).map((p) => p.itemCode))];
  for (const code of extraCodes) {
    const mine = packed.filter((p) => p.itemCode === code);
    const packedQty = mine.reduce((s, p) => s + p.qtyPcs, 0);
    rows.push({
      itemId: `unmatched-${code}`,
      itemCode: code,
      description: mine[0]?.description ?? "Not on this order",
      orderedQty: 0,
      packedQty,
      packedHere: currentListId
        ? here.filter((p) => p.itemCode === code).reduce((s, p) => s + p.qtyPcs, 0)
        : undefined,
      variance: packedQty,
      status: "over",
      netWeightKg: mine.reduce((s, p) => s + p.netWeightKg, 0),
      grossWeightKg: mine.reduce((s, p) => s + p.grossWeightKg, 0),
    });
  }

  return rows;
}

export interface PackingVerdict {
  ok: boolean;
  /** A sentence to put in front of the user, whether or not it is ok. */
  message: string;
}

/**
 * Whether a list may be closed, judged against its declared scope.
 *
 * The scope is what makes this meaningful. A partial is *supposed* to be short, so calling it a
 * problem trains people to click through warnings. A full or final list that does not reconcile is
 * a real problem and is blocked.
 */
export function verifyPacking(rows: PackedRow[], scope: ShipmentScope): PackingVerdict {
  const over = rows.filter((r) => r.status === "over");
  const short = rows.filter((r) => r.status === "short" || r.status === "not_packed");
  const packedAnything = rows.some((r) => r.packedQty > 0);

  if (!packedAnything) {
    return { ok: false, message: "Nothing has been packed against this order yet." };
  }

  /**
   * An overship blocks only when it can be fixed here.
   *
   * The excess is wrong under every scope, being either the wrong goods or too many of them, but
   * blocking is only fair when the user can act on it. Where the excess sits on a list that has
   * already been closed, there is nothing to correct on the open one, and refusing to close it
   * strands the order with no way forward. That is reported instead, and left with whoever can
   * reopen the earlier list.
   */
  const fixableOver = over.filter((r) => r.packedHere === undefined || r.packedHere > 0);
  if (fixableOver.length > 0) {
    const codes = fixableOver.map((r) => r.itemCode).join(", ");
    return {
      ok: false,
      message: `More packed than ordered on ${codes}. Correct the quantities on this list before closing.`,
    };
  }
  // Reported, not returned early: an unfixable overship excuses itself, not the rest of the order.
  // A full or final shipment that is also short somewhere else is still short, and has to block on
  // that regardless of what an earlier list did.
  const inheritedOver = over.filter((r) => r.packedHere === 0);
  const inheritedNote = inheritedOver.length
    ? `${inheritedOver.map((r) => r.itemCode).join(", ")} is over-packed on an earlier list for this order, not on this one. Reopen that list to correct it.`
    : "";

  if (scope === "partial") {
    const shortNote = short.length
      ? `Partial shipment. ${short.length} item${short.length === 1 ? "" : "s"} still outstanding on this order.`
      : "Everything on the order is packed. Consider marking this as the final shipment.";
    return { ok: true, message: [inheritedNote, shortNote].filter(Boolean).join(" ") };
  }
  if (short.length > 0) {
    const codes = short.map((r) => `${r.itemCode} (${r.packedQty} of ${r.orderedQty})`).join(", ");
    return {
      ok: false,
      message: `${scope === "final" ? "Final" : "Full"} shipment is short on ${codes}. Mark this as a partial shipment, or pack the balance.`,
    };
  }
  return {
    ok: true,
    message: inheritedNote ? `${inheritedNote} This list can still be closed.` : "Packed quantities match the order in full.",
  };
}

export interface OrderVerdict extends PackingVerdict, PackingListOrderRef {
  rows: PackedRow[];
}

export interface ListVerdict extends PackingVerdict {
  /** One verdict per order on the list, in the order they appear on it. */
  perOrder: OrderVerdict[];
}

/**
 * Whether a consolidated list may be closed, judged one order at a time.
 *
 * Each PI on the load is checked against its own scope, because they genuinely differ: the same
 * container routinely finishes one PI off in full while taking the second partial of another. The
 * list as a whole can only close when every order on it can, and the blocking message names the PI
 * so the packer knows which block of the sheet to go and fix.
 */
export function verifyPackingList(
  list: PackingList,
  /** The ordered lines for each covered order, keyed by sales order id. */
  itemsByOrder: Record<string, QuotationLineItem[]>,
  /** Every list that might touch those orders, so earlier partials are counted. */
  allPackingLists: PackingList[]
): ListVerdict {
  const perOrder: OrderVerdict[] = listOrders(list).map((ref) => {
    const rows = reconcileOrder(ref.salesOrderId, itemsByOrder[ref.salesOrderId] ?? [], allPackingLists, list.id);
    return { ...verifyPacking(rows, ref.scope), ...ref, rows };
  });

  if (perOrder.length === 0) {
    return { ok: false, message: "This list has no order against it.", perOrder };
  }
  const blocked = perOrder.filter((v) => !v.ok);
  if (blocked.length > 0) {
    return {
      ok: false,
      // One PI's problem at a time. Concatenating four blocking sentences produces a paragraph
      // nobody reads, and they have to be fixed one at a time anyway.
      message:
        blocked.length === 1
          ? `P.I. ${blocked[0].piRef}: ${blocked[0].message}`
          : `${blocked.length} of the ${perOrder.length} orders on this list do not reconcile. P.I. ${blocked[0].piRef}: ${blocked[0].message}`,
      perOrder,
    };
  }
  return {
    ok: true,
    message:
      perOrder.length === 1
        ? perOrder[0].message
        : `All ${perOrder.length} orders on this load reconcile. ${perOrder.map((v) => `P.I. ${v.piRef} ${scopeWord(v.scope, v.partialNo)}`).join(", ")}.`,
    perOrder,
  };
}

/** "in full", "2nd partial", "final": how a PI is described on the sheet. */
export function scopeWord(scope: ShipmentScope, partialNo?: number): string {
  if (scope === "full") return "in full";
  if (scope === "final") return "final";
  return `${ordinal(partialNo ?? 1)} partial`;
}

/** The banner the factory's sheet prints above each PI's block. */
export function scopeLabel(scope: ShipmentScope, partialNo?: number): string {
  if (scope === "full") return "Full Shipment";
  if (scope === "final") return "Final Shipment";
  return `${ordinal(partialNo ?? 1)}-Partial Shipment`;
}

/** 1 → 1st, 2 → 2nd, and so on. The factory numbers its partials in words on the document. */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * The next number in the packing list's own series.
 *
 * The series deliberately does not follow the sales order's. A list can cover several orders, so
 * naming it after one of them says something untrue about the other two, and there is no sensible
 * answer to which one it should be named after. It runs on its own, scoped to the year so the
 * numbers stay short, and the PI numbers it covers are carried on the document instead. Those are
 * what the customer recognises, and they are reproduced exactly as the quotation writes them.
 */
export const PACKING_LIST_PREFIX = "PL";

export function nextPackingListId(existingIds: string[], today: string = new Date().toISOString()): string {
  const year = today.slice(0, 4);
  const pattern = new RegExp(`^${PACKING_LIST_PREFIX}-${year}-(\\d+)$`);
  const highest = existingIds.reduce((max, id) => {
    const hit = pattern.exec(id);
    return hit ? Math.max(max, Number(hit[1])) : max;
  }, 0);
  return `${PACKING_LIST_PREFIX}-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/** "P/I Nos. 32913, 32930 & 32972R1": how the sheet writes the PIs a list covers. */
export function piRefLine(orders: PackingListOrderRef[]): string {
  const refs = [...new Set(orders.map((o) => o.piRef))];
  if (refs.length === 0) return "-";
  if (refs.length === 1) return `P/I No. ${refs[0]}`;
  return `P/I Nos. ${refs.slice(0, -1).join(", ")} & ${refs[refs.length - 1]}`;
}

/** Net and gross totals for a set of sections. */
export function sectionTotals(sections: PackingSection[]): { netKg: number; grossKg: number; pieces: number } {
  const lines = sections.flatMap((s) => s.lines);
  return {
    netKg: lines.reduce((s, l) => s + l.netWeightKg, 0),
    grossKg: lines.reduce((s, l) => s + l.grossWeightKg, 0),
    pieces: lines.reduce((s, l) => s + l.qtyPcs, 0),
  };
}

/** The same totals for an arbitrary set of lines, such as one PI's block rather than a whole section. */
export function lineTotals(lines: PackingLine[]): { netKg: number; grossKg: number; pieces: number; bales: number } {
  return {
    netKg: lines.reduce((s, l) => s + l.netWeightKg, 0),
    grossKg: lines.reduce((s, l) => s + l.grossWeightKg, 0),
    pieces: lines.reduce((s, l) => s + l.qtyPcs, 0),
    bales: lines.length,
  };
}

/**
 * Folds a list saved by an earlier build into the current shape.
 *
 * Two migrations, both of which keep real work rather than discarding it. Lists from the
 * carton-grid build carry `cartons` and no `sections`, and their contents are moved into a single
 * section. Lists from before consolidation carry a single `salesOrderId` and a list-level `scope`,
 * which become a one-entry `orders` array. The PI reference is unknown at this point and is filled
 * in by the caller, which has the quotations to hand.
 */
export function migratePackingList(list: PackingList): PackingList {
  const orders = listOrders(list);
  const sections =
    list.sections?.length || !list.cartons?.length
      ? (list.sections ?? [])
      : [
          {
            id: `${list.id}-S1`,
            title: "Cartons",
            lines: list.cartons.map((c) => ({
              id: c.id,
              itemCode: c.itemCode,
              description: c.markNo ? `Mark ${c.markNo}` : c.itemCode,
              baleNo: c.markNo,
              qtyPcs: c.qtyPcs,
              netWeightKg: c.netWeightKg,
              grossWeightKg: c.grossWeightKg,
            })),
          },
        ];
  return { ...list, orders, sections };
}
