import type { OrderStage, PaymentRecord, SalesOrder } from "./types";
import { canVerifyPayment } from "./paymentApproval";

/**
 * What is expected, what has arrived, and what is still owed on an order.
 *
 * The mistake this replaces was treating "add a payment" as typing a new line. The deposit and the
 * balance are not things anybody invents. They are raised from the quotation the moment the order
 * exists, and what actually happens afterwards is that money arrives *against* one of them. Asking
 * someone to retype an amount the system already knows is how you get a deposit of 1,276.87
 * recorded against an expectation of 1,276.78, and a nine-cent discrepancy nobody can explain.
 *
 * So: expectations are generated, receipts are recorded against them, and the difference between
 * the two is the outstanding balance. An amount received above what was expected is not an error to
 * be rejected, because customers do round up or pay two invoices in one transfer. It is an
 * overpayment, and it has to be visible rather than silently absorbed.
 */

export interface LineLedger {
  payment: PaymentRecord;
  /** Still owed on this line. Zero once settled. */
  outstanding: number;
  /** Received above what was expected. Zero in the ordinary case. */
  overpaid: number;
  settled: boolean;
}

export interface OrderLedger {
  lines: LineLedger[];
  expected: number;
  received: number;
  /** Total still owed across the order. Never negative, since an overpayment is reported separately. */
  outstanding: number;
  overpaid: number;
  depositExpected: number;
  depositReceived: number;
  /** True once the deposit has been received in full and verified. */
  depositSettled: boolean;
  fullySettled: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ledgerForLine(p: PaymentRecord): LineLedger {
  const diff = round2(p.amountReceived - p.expectedAmount);
  return {
    payment: p,
    outstanding: diff < 0 ? Math.abs(diff) : 0,
    overpaid: diff > 0 ? diff : 0,
    // Settled means the money is in AND Finance has confirmed it. An unverified receipt is a claim,
    // not a fact, and releasing production against a claim is how goods leave unpaid for.
    settled: diff >= 0 && p.status === "verified",
  };
}

export function ledgerForOrder(order: SalesOrder, payments: PaymentRecord[]): OrderLedger {
  const mine = payments.filter((p) => p.salesOrderId === order.id && p.status !== "rejected");
  const lines = mine.map(ledgerForLine);
  const deposits = lines.filter((l) => l.payment.type === "deposit");

  const expected = round2(lines.reduce((s, l) => s + l.payment.expectedAmount, 0));
  const received = round2(lines.reduce((s, l) => s + l.payment.amountReceived, 0));
  const depositExpected = round2(deposits.reduce((s, l) => s + l.payment.expectedAmount, 0));
  const depositReceived = round2(deposits.reduce((s, l) => s + l.payment.amountReceived, 0));

  return {
    lines,
    expected,
    received,
    outstanding: round2(Math.max(0, expected - received)),
    overpaid: round2(Math.max(0, received - expected)),
    depositExpected,
    depositReceived,
    // No deposit lines at all means nothing is being waited on, so the gate is open rather than
    // permanently shut. An order on cash terms should not be blocked by a deposit nobody asked for.
    depositSettled: deposits.length === 0 || deposits.every((l) => l.settled),
    fullySettled: lines.length > 0 && lines.every((l) => l.settled),
  };
}

/**
 * Whether goods may be packed yet.
 *
 * The factory works to the deposit. Packing before it has cleared means committing material and
 * machine time against a customer who has not yet put money down, which is precisely the risk the
 * deposit exists to cover.
 */
export function canPack(order: SalesOrder, payments: PaymentRecord[]): { ok: boolean; reason?: string } {
  const ledger = ledgerForOrder(order, payments);
  if (ledger.depositSettled) return { ok: true };
  const short = round2(ledger.depositExpected - ledger.depositReceived);
  if (short > 0) {
    return {
      ok: false,
      reason: `Deposit is short by ${short.toFixed(2)} of ${ledger.depositExpected.toFixed(2)}. The terms are ${order.currency} ${ledger.depositExpected.toFixed(2)} down before production.`,
    };
  }
  return {
    ok: false,
    reason: "The deposit has been received but not verified by Finance yet.",
  };
}

/**
 * The line a receipt should be recorded against, and how much of it is outstanding.
 *
 * Deposit first, then balance, then anything else, which is the order money is normally asked for
 * in. This is what lets the dialog open with the right line and the right amount already filled in.
 *
 * Skips a line still pending approval. `canRecordAgainst` blocks it at the row level, and this is
 * the same shortcut a "Record payment" button reaches for, so it must not hand back a line the
 * dialog it opens is not allowed to touch.
 */
export function nextLineToSettle(order: SalesOrder, payments: PaymentRecord[]): LineLedger | undefined {
  const { lines } = ledgerForOrder(order, payments);
  const owing = lines.filter((l) => (l.outstanding > 0 || l.payment.status !== "verified") && canRecordAgainst(l.payment));
  const rank: Record<PaymentRecord["type"], number> = { deposit: 0, balance: 1, adjustment: 2 };
  return [...owing].sort((a, b) => rank[a.payment.type] - rank[b.payment.type])[0];
}

/** Whether a receipt can be recorded against this line at all. */
export function canRecordAgainst(p: PaymentRecord): boolean {
  // Approval gates the money, exactly as it gates verification.
  return canVerifyPayment(p);
}

/**
 * Whether a line has to be settled in one go.
 *
 * The deposit is a condition of starting work, not an instalment plan: a part-paid deposit does not
 * release production, so accepting one leaves the order looking part-settled while being exactly as
 * blocked as before. The balance is the opposite, because customers pay it down as funds allow, and
 * refusing a part payment would only mean it goes unrecorded.
 */
export function requiresFullPayment(type: PaymentRecord["type"]): boolean {
  return type === "deposit";
}

/**
 * Checks a receipt before it is written. Returns a message to show, or null to proceed.
 */
export function validateReceipt(line: LineLedger, amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter the amount that arrived.";
  }
  if (requiresFullPayment(line.payment.type) && amount + 0.005 < line.outstanding) {
    return `The deposit has to be settled in full. ${line.outstanding.toFixed(
      2
    )} is outstanding, and a part payment would not release production.`;
  }
  return null;
}

/**
 * A sentence describing where a line stands.
 *
 * An overpaid line is complete, not faulty. The customer has paid everything owed and then some;
 * treating that as an exception to be chased puts a red mark against an account that is ahead. The
 * surplus is stated after the fact, not instead of it.
 */
/**
 * The stage a just-verified payment releases, if any.
 *
 * Verifying money is not bookkeeping. It is the event the process is waiting on. The deposit is
 * what lets the factory commit material, and the balance is what lets the container be booked. If
 * verifying does not move the order, the order sits at a stage nobody is working on and the next
 * team never learns it is their turn; the only way forward is somebody noticing and pressing an
 * advance button by hand, which is exactly the kind of silent stall a workflow is meant to prevent.
 *
 * Returns undefined when the payment settles nothing the order is currently waiting on, such as a
 * mid-production adjustment or a balance paid early while the goods are still being packed.
 */
export function stageReleasedBy(
  order: SalesOrder,
  payment: PaymentRecord,
  allPayments: PaymentRecord[]
): OrderStage | undefined {
  const ledger = ledgerForOrder(order, allPayments);

  if (payment.type === "deposit" && order.currentStage === "deposit" && ledger.depositSettled) {
    return "packing";
  }
  if (payment.type === "balance" && order.currentStage === "final_payment") {
    const line = ledger.lines.find((l) => l.payment.id === payment.id);
    // Only a settled balance releases the container. A part payment is progress, not clearance.
    if (line?.settled) return "shipment";
  }
  return undefined;
}

export function lineStatusText(l: LineLedger, currency = "USD"): string {
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
  if (l.outstanding === 0) {
    if (l.payment.status !== "verified") return "Received, awaiting verification";
    return l.overpaid > 0 ? `Completed · ${fmt(l.overpaid)} overpaid` : "Completed";
  }
  if (l.payment.amountReceived > 0) return `${fmt(l.outstanding)} still outstanding`;
  return `${fmt(l.outstanding)} expected`;
}
