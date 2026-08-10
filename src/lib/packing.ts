import type { PackingList, PackingSection, QuotationLineItem, ShipmentScope } from "./types";

/**
 * Reconciling what was packed against what was ordered.
 *
 * The packing screen's job is not to design cartons. It is to answer one question before goods
 * leave the yard: does what we are shipping match what the customer bought? Everything here is a
 * pure function over the order's lines and the packing lists raised against it, so the answer can
 * be tested rather than eyeballed.
 *
 * Quantities are counted CUMULATIVELY across every list for the order. An order shipped in three
 * partials is only complete when the three together add up, and checking one list in isolation
 * would call every partial a shortfall.
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

/** Every packing line across a set of lists, flattened out of its sections. */
export function allLines(lists: PackingList[]) {
  return lists.flatMap((l) => (l.sections ?? []).flatMap((s) => s.lines));
}

/**
 * Matches packed rows to ordered rows.
 *
 * Matched on `itemId` when the row was drawn from the order, and on item code otherwise, because a
 * row typed straight from the plant's paperwork has no link back to a quotation line.
 */
export function reconcilePacking(
  orderItems: QuotationLineItem[],
  lists: PackingList[],
  /** The list being worked on, so its own contribution can be told apart from the rest. */
  currentListId?: string
): PackedRow[] {
  const packed = allLines(lists);
  const here = allLines(lists.filter((l) => l.id === currentListId));
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
   * The excess is wrong under every scope — it is either the wrong goods or too many of them — but
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

/** Net and gross totals for a set of sections. */
export function sectionTotals(sections: PackingSection[]): { netKg: number; grossKg: number; pieces: number } {
  const lines = sections.flatMap((s) => s.lines);
  return {
    netKg: lines.reduce((s, l) => s + l.netWeightKg, 0),
    grossKg: lines.reduce((s, l) => s + l.grossWeightKg, 0),
    pieces: lines.reduce((s, l) => s + l.qtyPcs, 0),
  };
}

/**
 * Folds a pre-sections packing list into the current shape.
 *
 * Lists saved by the carton-grid build carry `cartons` and no `sections`. Their contents are real
 * work and are moved into a single section rather than discarded.
 */
export function migratePackingList(list: PackingList): PackingList {
  if (list.sections?.length || !list.cartons?.length) {
    return { ...list, sections: list.sections ?? [], scope: list.scope ?? "full" };
  }
  return {
    ...list,
    scope: list.scope ?? "full",
    sections: [
      {
        id: `${list.id}-S1`,
        title: "Cartons",
        lines: list.cartons.map((c) => ({
          id: c.id,
          itemCode: c.itemCode,
          description: c.markNo ? `Mark ${c.markNo}` : c.itemCode,
          qtyPcs: c.qtyPcs,
          netWeightKg: c.netWeightKg,
          grossWeightKg: c.grossWeightKg,
        })),
      },
    ],
  };
}
