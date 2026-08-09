import { describe, it, expect } from "vitest";
import {
  applyApproval,
  applyDecline,
  approvalStateOf,
  approvalSummary,
  canApprovePayments,
  canVerifyPayment,
  isOverride,
  isPendingApproval,
  validateApproval,
} from "./paymentApproval";
import type { PaymentApproval, PaymentRecord } from "./types";

const TODAY = "2026-08-09";

function payment(approval?: PaymentApproval): PaymentRecord {
  return {
    id: "PAY-001",
    salesOrderId: "SO-0001",
    type: "deposit",
    expectedAmount: 10000,
    amountReceived: 0,
    status: "expected",
    approval,
  };
}

const pending: PaymentApproval = {
  state: "pending_approval",
  author: "Grace Tan",
  authoredDate: "2026-08-01",
  intendedApprover: "Marcus Reyes",
};

describe("canApprovePayments", () => {
  it("lets Management, Finance and Admin approve", () => {
    expect(canApprovePayments("management")).toBe(true);
    expect(canApprovePayments("finance")).toBe(true);
    expect(canApprovePayments("admin")).toBe(true);
  });

  it("does not let the roles that raise payments also approve them", () => {
    expect(canApprovePayments("sales_rep")).toBe(false);
    expect(canApprovePayments("sales_manager")).toBe(false);
    expect(canApprovePayments("logistics")).toBe(false);
    expect(canApprovePayments("factory_technical")).toBe(false);
  });
});

describe("approvalStateOf", () => {
  it("reads a record with no approval block as already approved", () => {
    // Every seeded and previously saved payment is in this shape. Treating them as pending would
    // freeze the whole order history the first time the app loads.
    expect(approvalStateOf(payment())).toBe("approved");
    expect(isPendingApproval(payment())).toBe(false);
  });

  it("reports the state when there is one", () => {
    expect(approvalStateOf(payment(pending))).toBe("pending_approval");
    expect(isPendingApproval(payment(pending))).toBe(true);
  });
});

describe("canVerifyPayment", () => {
  it("blocks verification until the line is approved", () => {
    expect(canVerifyPayment(payment(pending))).toBe(false);
  });

  it("blocks verification on a declined line", () => {
    expect(canVerifyPayment(payment({ ...pending, state: "declined" }))).toBe(false);
  });

  it("allows verification once approved", () => {
    expect(canVerifyPayment(payment({ ...pending, state: "approved" }))).toBe(true);
  });

  it("allows verification on legacy records", () => {
    expect(canVerifyPayment(payment())).toBe(true);
  });
});

describe("isOverride", () => {
  it("is an override when someone other than the named approver signs", () => {
    expect(isOverride(pending, "Elaine Sy")).toBe(true);
  });

  it("is not an override when the named approver signs", () => {
    expect(isOverride(pending, "Marcus Reyes")).toBe(false);
  });

  it("ignores case and surrounding spaces on the name", () => {
    expect(isOverride(pending, "  marcus reyes ")).toBe(false);
  });

  it("is not an override when nobody was named", () => {
    expect(isOverride({ ...pending, intendedApprover: undefined }, "Elaine Sy")).toBe(false);
    expect(isOverride(undefined, "Elaine Sy")).toBe(false);
  });
});

describe("validateApproval", () => {
  it("requires an approver name", () => {
    expect(validateApproval({ approval: pending, actualApprover: "  ", overrideReason: "" })).toMatch(
      /who is approving/i
    );
  });

  it("requires a reason when overriding the named approver", () => {
    const msg = validateApproval({ approval: pending, actualApprover: "Elaine Sy", overrideReason: "" });
    expect(msg).toContain("Marcus Reyes");
  });

  it("passes when the named approver signs without a reason", () => {
    expect(validateApproval({ approval: pending, actualApprover: "Marcus Reyes", overrideReason: "" })).toBeNull();
  });

  it("passes when an override carries a reason", () => {
    expect(
      validateApproval({ approval: pending, actualApprover: "Elaine Sy", overrideReason: "Marcus on leave" })
    ).toBeNull();
  });
});

describe("applyApproval", () => {
  it("keeps the original author and authored date rather than rewriting them", () => {
    const next = applyApproval(pending, { actualApprover: "Marcus Reyes", overrideReason: "", today: TODAY });
    expect(next.author).toBe("Grace Tan");
    expect(next.authoredDate).toBe("2026-08-01");
    expect(next.state).toBe("approved");
    expect(next.actualApprover).toBe("Marcus Reyes");
    expect(next.decidedDate).toBe(TODAY);
  });

  it("records the reason only when the approval really was an override", () => {
    const overridden = applyApproval(pending, {
      actualApprover: "Elaine Sy",
      overrideReason: "  Marcus on leave until the 14th  ",
      today: TODAY,
    });
    expect(overridden.overrideReason).toBe("Marcus on leave until the 14th");

    const normal = applyApproval(pending, {
      actualApprover: "Marcus Reyes",
      overrideReason: "typed by mistake",
      today: TODAY,
    });
    // A reason stored here would make the history read as though an override happened.
    expect(normal.overrideReason).toBeUndefined();
  });
});

describe("applyDecline", () => {
  it("always records a reason, even when none was typed", () => {
    const next = applyDecline(pending, { actualApprover: "Marcus Reyes", reason: "   ", today: TODAY });
    expect(next.state).toBe("declined");
    expect(next.declineReason).toBe("No reason given");
  });

  it("keeps the reason that was given", () => {
    const next = applyDecline(pending, {
      actualApprover: "Marcus Reyes",
      reason: "Amount does not match the PI",
      today: TODAY,
    });
    expect(next.declineReason).toBe("Amount does not match the PI");
  });
});

describe("approvalSummary", () => {
  it("names the author and who it is waiting on", () => {
    expect(approvalSummary(payment(pending))).toBe("Awaiting Marcus Reyes, raised by Grace Tan");
  });

  it("copes with a line raised without a named approver", () => {
    expect(approvalSummary(payment({ ...pending, intendedApprover: undefined }))).toBe(
      "Awaiting approval, raised by Grace Tan"
    );
  });

  it("spells out an override so the audit trail reads on one line", () => {
    const approved = applyApproval(pending, {
      actualApprover: "Elaine Sy",
      overrideReason: "Marcus on leave",
      today: TODAY,
    });
    expect(approvalSummary(payment(approved))).toBe(
      "Approved by Elaine Sy in place of Marcus Reyes: Marcus on leave"
    );
  });

  it("reports a decline with its reason", () => {
    const declined = applyDecline(pending, {
      actualApprover: "Marcus Reyes",
      reason: "Amount does not match the PI",
      today: TODAY,
    });
    expect(approvalSummary(payment(declined))).toBe(
      "Declined by Marcus Reyes: Amount does not match the PI"
    );
  });

  it("says approved for a legacy record with no approval block", () => {
    expect(approvalSummary(payment())).toBe("Approved");
  });
});
