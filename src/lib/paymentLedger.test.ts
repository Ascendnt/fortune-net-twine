import { describe, it, expect } from "vitest";
import {
  canPack,
  ledgerForLine,
  ledgerForOrder,
  lineStatusText,
  nextLineToSettle,
  requiresFullPayment,
  stageReleasedBy,
  validateReceipt,
} from "./paymentLedger";
import type { PaymentRecord, SalesOrder } from "./types";

const order = { id: "SO-1051", currency: "USD" } as SalesOrder;

function pay(over: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "PMT-1",
    salesOrderId: "SO-1051",
    type: "deposit",
    expectedAmount: 1276.78,
    amountReceived: 0,
    status: "expected",
    ...over,
  };
}

describe("ledgerForLine", () => {
  it("reports the full amount outstanding when nothing has arrived", () => {
    const l = ledgerForLine(pay());
    expect(l.outstanding).toBe(1276.78);
    expect(l.overpaid).toBe(0);
    expect(l.settled).toBe(false);
  });

  it("reports a part payment as the remainder", () => {
    expect(ledgerForLine(pay({ amountReceived: 1000 })).outstanding).toBe(276.78);
  });

  it("is not settled on money received but not yet verified", () => {
    // An unverified receipt is a claim, not a fact.
    const l = ledgerForLine(pay({ amountReceived: 1276.78, status: "submitted_for_verification" }));
    expect(l.outstanding).toBe(0);
    expect(l.settled).toBe(false);
  });

  it("is settled once received in full and verified", () => {
    const l = ledgerForLine(pay({ amountReceived: 1276.78, status: "verified" }));
    expect(l.settled).toBe(true);
    expect(l.outstanding).toBe(0);
  });

  it("reports an overpayment rather than swallowing it", () => {
    // Customers round up, or pay two invoices in one transfer. It has to be visible.
    const l = ledgerForLine(pay({ amountReceived: 1300, status: "verified" }));
    expect(l.overpaid).toBe(23.22);
    expect(l.outstanding).toBe(0);
    expect(l.settled).toBe(true);
  });

  it("does not report a phantom balance from floating point noise", () => {
    const l = ledgerForLine(pay({ expectedAmount: 0.1 + 0.2, amountReceived: 0.3, status: "verified" }));
    expect(l.outstanding).toBe(0);
    expect(l.overpaid).toBe(0);
  });
});

describe("ledgerForOrder", () => {
  const lines = [
    pay({ id: "d", type: "deposit", expectedAmount: 1276.78, amountReceived: 1276.78, status: "verified" }),
    pay({ id: "b", type: "balance", expectedAmount: 2979.16, amountReceived: 1000, status: "expected" }),
  ];

  it("totals expected, received and what is still owed", () => {
    const l = ledgerForOrder(order, lines);
    expect(l.expected).toBe(4255.94);
    expect(l.received).toBe(2276.78);
    expect(l.outstanding).toBe(1979.16);
  });

  it("never reports a negative outstanding", () => {
    const l = ledgerForOrder(order, [pay({ expectedAmount: 100, amountReceived: 150, status: "verified" })]);
    expect(l.outstanding).toBe(0);
    expect(l.overpaid).toBe(50);
  });

  it("ignores rejected lines entirely", () => {
    const l = ledgerForOrder(order, [...lines, pay({ id: "x", expectedAmount: 9999, status: "rejected" })]);
    expect(l.expected).toBe(4255.94);
  });

  it("knows the deposit is settled", () => {
    expect(ledgerForOrder(order, lines).depositSettled).toBe(true);
  });

  it("knows the deposit is not settled when it is only part paid", () => {
    const partial = [pay({ type: "deposit", amountReceived: 500, status: "verified" })];
    expect(ledgerForOrder(order, partial).depositSettled).toBe(false);
  });

  it("treats an order with no deposit line as having nothing to wait for", () => {
    // An order on cash terms must not be blocked by a deposit nobody asked for.
    const l = ledgerForOrder(order, [pay({ type: "balance", expectedAmount: 100 })]);
    expect(l.depositSettled).toBe(true);
  });

  it("is fully settled only when every line is", () => {
    expect(ledgerForOrder(order, lines).fullySettled).toBe(false);
    const done = lines.map((p) => ({ ...p, amountReceived: p.expectedAmount, status: "verified" as const }));
    expect(ledgerForOrder(order, done).fullySettled).toBe(true);
  });

  it("is not fully settled on an order with no payments at all", () => {
    expect(ledgerForOrder(order, []).fullySettled).toBe(false);
  });
});

describe("canPack", () => {
  it("blocks packing while the deposit is short, and says by how much", () => {
    const v = canPack(order, [pay({ amountReceived: 500, status: "verified" })]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("776.78");
  });

  it("blocks packing when the deposit is in but unverified", () => {
    const v = canPack(order, [pay({ amountReceived: 1276.78, status: "submitted_for_verification" })]);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("not verified");
  });

  it("allows packing once the deposit has cleared", () => {
    expect(canPack(order, [pay({ amountReceived: 1276.78, status: "verified" })]).ok).toBe(true);
  });

  it("allows packing on an order that never had a deposit", () => {
    expect(canPack(order, [pay({ type: "balance", expectedAmount: 100 })]).ok).toBe(true);
  });
});

describe("stageReleasedBy", () => {
  const at = (stage: string) => ({ ...order, currentStage: stage } as SalesOrder);

  it("opens packing when the deposit is verified and the order was waiting on it", () => {
    // Without this the order sat at Deposit with the money already in, and nobody in the factory
    // ever learned it was their turn.
    const deposit = pay({ type: "deposit", amountReceived: 1276.78, status: "verified" });
    expect(stageReleasedBy(at("deposit"), deposit, [deposit])).toBe("packing");
  });

  it("does not open packing on a part-paid deposit", () => {
    const deposit = pay({ type: "deposit", amountReceived: 500, status: "verified" });
    expect(stageReleasedBy(at("deposit"), deposit, [deposit])).toBeUndefined();
  });

  it("releases the container when the balance is verified", () => {
    const balance = pay({ id: "b", type: "balance", expectedAmount: 2000, amountReceived: 2000, status: "verified" });
    expect(stageReleasedBy(at("final_payment"), balance, [balance])).toBe("shipment");
  });

  it("does not release the container on a part-paid balance", () => {
    // Progress, not clearance.
    const balance = pay({ id: "b", type: "balance", expectedAmount: 2000, amountReceived: 900, status: "verified" });
    expect(stageReleasedBy(at("final_payment"), balance, [balance])).toBeUndefined();
  });

  it("does nothing when the order is not waiting on that payment", () => {
    // A balance paid early, while the goods are still being packed, must not skip the order ahead.
    const balance = pay({ id: "b", type: "balance", expectedAmount: 2000, amountReceived: 2000, status: "verified" });
    expect(stageReleasedBy(at("packing"), balance, [balance])).toBeUndefined();
  });

  it("does nothing for an adjustment", () => {
    const adj = pay({ id: "a", type: "adjustment", expectedAmount: 50, amountReceived: 50, status: "verified" });
    expect(stageReleasedBy(at("final_payment"), adj, [adj])).toBeUndefined();
  });

  it("opens packing on an overpaid deposit", () => {
    const deposit = pay({ type: "deposit", amountReceived: 1500, status: "verified" });
    expect(stageReleasedBy(at("deposit"), deposit, [deposit])).toBe("packing");
  });
});

describe("nextLineToSettle", () => {
  it("points at the deposit before the balance", () => {
    const lines = [pay({ id: "b", type: "balance" }), pay({ id: "d", type: "deposit" })];
    expect(nextLineToSettle(order, lines)?.payment.id).toBe("d");
  });

  it("moves to the balance once the deposit is settled", () => {
    const lines = [
      pay({ id: "d", type: "deposit", amountReceived: 1276.78, status: "verified" }),
      pay({ id: "b", type: "balance", expectedAmount: 2000 }),
    ];
    expect(nextLineToSettle(order, lines)?.payment.id).toBe("b");
  });

  it("returns nothing when there is nothing left to settle", () => {
    const lines = [pay({ amountReceived: 1276.78, status: "verified" })];
    expect(nextLineToSettle(order, lines)).toBeUndefined();
  });

  it("skips a line still pending approval, rather than handing back a line Record cannot touch", () => {
    // canRecordAgainst blocks this at the row level; the shortcut must agree with it, or "Record
    // payment" opens a receipt dialog on a line the row-level button would refuse.
    const lines = [
      pay({ id: "d", type: "deposit", approval: { state: "pending_approval", author: "x", authoredDate: "2026-01-01" } }),
      pay({ id: "b", type: "balance", expectedAmount: 2000 }),
    ];
    expect(nextLineToSettle(order, lines)?.payment.id).toBe("b");
  });

  it("returns nothing when the only owing line is pending approval", () => {
    const lines = [
      pay({ id: "d", type: "deposit", approval: { state: "pending_approval", author: "x", authoredDate: "2026-01-01" } }),
    ];
    expect(nextLineToSettle(order, lines)).toBeUndefined();
  });
});

describe("lineStatusText", () => {
  it("names the amount still expected before anything arrives", () => {
    expect(lineStatusText(ledgerForLine(pay()), "USD")).toBe("USD 1276.78 expected");
  });

  it("distinguishes a part payment from an untouched line", () => {
    expect(lineStatusText(ledgerForLine(pay({ amountReceived: 1000 })), "USD")).toBe("USD 276.78 still outstanding");
  });

  it("says money is in but not yet confirmed", () => {
    const l = ledgerForLine(pay({ amountReceived: 1276.78, status: "submitted_for_verification" }));
    expect(lineStatusText(l)).toBe("Received, awaiting verification");
  });

  it("calls a settled line completed", () => {
    expect(lineStatusText(ledgerForLine(pay({ amountReceived: 1276.78, status: "verified" })))).toBe("Completed");
  });

  it("treats an overpaid line as completed, with the surplus noted after", () => {
    // The customer paid everything owed and more. That is not an exception to be chased.
    expect(lineStatusText(ledgerForLine(pay({ amountReceived: 1300, status: "verified" })), "USD")).toBe(
      "Completed · USD 23.22 overpaid"
    );
  });
});

describe("requiresFullPayment", () => {
  it("is true for the deposit and false for everything else", () => {
    // A part-paid deposit does not release production, so it leaves the order looking
    // part-settled while being exactly as blocked as before.
    expect(requiresFullPayment("deposit")).toBe(true);
    expect(requiresFullPayment("balance")).toBe(false);
    expect(requiresFullPayment("adjustment")).toBe(false);
  });
});

describe("validateReceipt", () => {
  const deposit = ledgerForLine(pay({ type: "deposit", expectedAmount: 1276.78 }));
  const balance = ledgerForLine(pay({ type: "balance", expectedAmount: 9868.19 }));

  it("refuses an empty or negative amount", () => {
    expect(validateReceipt(balance, 0)).toContain("amount that arrived");
    expect(validateReceipt(balance, -5)).toContain("amount that arrived");
    expect(validateReceipt(balance, Number.NaN)).toContain("amount that arrived");
  });

  it("refuses a part payment against the deposit, and says why", () => {
    const msg = validateReceipt(deposit, 500);
    expect(msg).toContain("in full");
    expect(msg).toContain("release production");
  });

  it("accepts the deposit paid exactly", () => {
    expect(validateReceipt(deposit, 1276.78)).toBeNull();
  });

  it("accepts the deposit overpaid", () => {
    expect(validateReceipt(deposit, 1300)).toBeNull();
  });

  it("tolerates a rounding hair on the deposit rather than rejecting it", () => {
    expect(validateReceipt(deposit, 1276.7799)).toBeNull();
  });

  it("accepts a part payment against the balance, which is how balances are paid", () => {
    expect(validateReceipt(balance, 1000)).toBeNull();
  });

  it("accepts an overpayment against the balance", () => {
    expect(validateReceipt(balance, 10000)).toBeNull();
  });
});
