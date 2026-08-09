import type { PaymentApproval, PaymentRecord, Role } from "./types";

/**
 * The rules governing who may sign off a payment, and when.
 *
 * These live here rather than inside the Payments screen for two reasons. The obvious one is that
 * they can be tested without rendering anything. The less obvious one is that money rules get read
 * by people who are not developers, and a short file with the reasoning written next to each rule
 * is something a finance lead can be walked through.
 */

/**
 * Roles that may approve a payment.
 *
 * Management and Finance both qualify, deliberately: routing every line through one named manager
 * is what produces the situation where a container sits at the port because one person is on a
 * plane. Admin is included because the system administrator has to be able to unstick anything.
 */
const APPROVER_ROLES: Role[] = ["management", "finance", "admin"];

export function canApprovePayments(role: Role): boolean {
  return APPROVER_ROLES.includes(role);
}

/**
 * The approval state of a record, defaulting to approved.
 *
 * Payments seeded or saved before the approval chain existed carry no `approval` block. Treating
 * those as pending would freeze every historical order in the system on first load, so they are
 * read as already approved: at the time they were raised, raising them was the whole process.
 */
export function approvalStateOf(p: PaymentRecord): PaymentApproval["state"] {
  return p.approval?.state ?? "approved";
}

export function isPendingApproval(p: PaymentRecord): boolean {
  return approvalStateOf(p) === "pending_approval";
}

/**
 * Whether a bank advice may be verified against this line.
 *
 * A payment that has not been approved cannot be verified, because verification is what releases
 * the next stage of the order. Approving after the fact would mean the approval never actually
 * gated anything.
 */
export function canVerifyPayment(p: PaymentRecord): boolean {
  return approvalStateOf(p) === "approved";
}

/** True when the person signing is not the one the line was routed to. */
export function isOverride(approval: PaymentApproval | undefined, actualApprover: string): boolean {
  const intended = approval?.intendedApprover?.trim();
  if (!intended) return false;
  return intended.toLowerCase() !== actualApprover.trim().toLowerCase();
}

/**
 * Checks an approval before it is written. Returns a message to show the user, or null to proceed.
 *
 * The one hard requirement is the override reason. An override is the case an auditor will ask
 * about, and "the named approver was away" has to be on the record at the moment it happens —
 * nobody reconstructs it accurately six months later.
 */
export function validateApproval(args: {
  approval: PaymentApproval | undefined;
  actualApprover: string;
  overrideReason: string;
}): string | null {
  if (!args.actualApprover.trim()) {
    return "Enter who is approving this payment.";
  }
  if (isOverride(args.approval, args.actualApprover) && !args.overrideReason.trim()) {
    return `This payment was routed to ${args.approval?.intendedApprover}. Give a reason for approving it in their place.`;
  }
  return null;
}

/** Builds the approval block to save when a payment is signed off. */
export function applyApproval(
  approval: PaymentApproval | undefined,
  args: { actualApprover: string; overrideReason: string; today: string }
): PaymentApproval {
  const override = isOverride(approval, args.actualApprover);
  return {
    state: "approved",
    author: approval?.author ?? args.actualApprover,
    authoredDate: approval?.authoredDate ?? args.today,
    intendedApprover: approval?.intendedApprover,
    actualApprover: args.actualApprover,
    decidedDate: args.today,
    // Only carried when it means something. Storing a reason on a non-override would make the
    // history read as though an override happened.
    overrideReason: override ? args.overrideReason.trim() : undefined,
  };
}

/** Builds the approval block to save when a payment is declined. */
export function applyDecline(
  approval: PaymentApproval | undefined,
  args: { actualApprover: string; reason: string; today: string }
): PaymentApproval {
  return {
    state: "declined",
    author: approval?.author ?? args.actualApprover,
    authoredDate: approval?.authoredDate ?? args.today,
    intendedApprover: approval?.intendedApprover,
    actualApprover: args.actualApprover,
    decidedDate: args.today,
    declineReason: args.reason.trim() || "No reason given",
  };
}

/** A one-line description of where a payment stands, for the list and the detail panel. */
export function approvalSummary(p: PaymentRecord): string {
  const a = p.approval;
  if (!a) return "Approved";
  if (a.state === "pending_approval") {
    return a.intendedApprover
      ? `Awaiting ${a.intendedApprover}, raised by ${a.author}`
      : `Awaiting approval, raised by ${a.author}`;
  }
  if (a.state === "declined") {
    return `Declined by ${a.actualApprover ?? "—"}: ${a.declineReason ?? "no reason given"}`;
  }
  if (a.overrideReason) {
    return `Approved by ${a.actualApprover} in place of ${a.intendedApprover}: ${a.overrideReason}`;
  }
  return `Approved by ${a.actualApprover ?? a.author}`;
}
