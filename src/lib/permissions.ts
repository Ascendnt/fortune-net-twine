import type { Role } from "./types";

/**
 * Who may do what.
 *
 * A note on what this is and is not. This gives the system IDENTITY (which person is acting) and
 * AUTHORISATION (what that person is allowed to do). It does not give it AUTHENTICATION, because
 * there is no server to prove someone is who they claim to be, so signing in here is a choice of
 * identity, not a security boundary. Anyone who can open the app can pick any user.
 *
 * That is worth stating plainly rather than dressing up, because the distinction decides what this
 * is good for. It is enough to stop the wrong person approving something by accident, to record
 * who actually did what, and to keep the screens honest about who a job belongs to. It is not
 * enough to stop somebody determined. When a backend exists, authentication slots in front of this
 * and none of the rules below need to change.
 *
 * Everyone can SEE everything: no screen is hidden by role, which is what was asked for. What is
 * gated is the small number of actions where the wrong hand causes real damage.
 */

export type Permission =
  // Sales
  | "quotation.create"
  | "quotation.approve"
  | "order.advance"
  // Finance
  | "payment.create"
  | "payment.approve"
  /** Approving in place of the person a payment was routed to. Management only. */
  | "payment.override"
  | "payment.verify"
  // Operations
  | "packing.manage"
  | "inspection.record"
  | "shipment.manage"
  // System
  | "masterdata.manage"
  | "settings.manage"
  | "users.manage";

/**
 * The matrix.
 *
 * Read it as "what does this job need to get through the day", not "what should we withhold".
 * Admin holds everything because somebody has to be able to unstick the system. Management holds
 * everything except the operational data entry it has no business typing.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "quotation.create",
    "quotation.approve",
    "order.advance",
    "payment.create",
    "payment.approve",
    "payment.override",
    "payment.verify",
    "packing.manage",
    "inspection.record",
    "shipment.manage",
    "masterdata.manage",
    "settings.manage",
    "users.manage",
  ],
  management: [
    "quotation.create",
    "quotation.approve",
    "order.advance",
    "payment.create",
    "payment.approve",
    // The only role that may sign in another approver's place. Standing in for a colleague is a
    // question of authority, not of being available, so it does not spread with convenience.
    "payment.override",
    "payment.verify",
    "masterdata.manage",
    "settings.manage",
    "users.manage",
  ],
  finance: ["payment.create", "payment.approve", "payment.verify", "order.advance"],
  sales_manager: ["quotation.create", "quotation.approve", "payment.create", "order.advance", "masterdata.manage"],
  sales_rep: ["quotation.create", "payment.create"],
  logistics: ["packing.manage", "shipment.manage", "order.advance"],
  factory_technical: ["packing.manage", "inspection.record", "masterdata.manage"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Every permission a role holds, for the roles screen. */
export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Roles that may sign a payment off. Used to populate the "route approval to" list. */
export function approverRoles(): Role[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => can(r, "payment.approve"));
}

/** Plain-language labels, so the roles screen does not show raw permission keys. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "quotation.create": "Draft and edit quotations",
  "quotation.approve": "Approve quotations",
  "order.advance": "Move a sales order to its next stage",
  "payment.create": "Raise a payment line",
  "payment.approve": "Approve a payment",
  "payment.override": "Approve in place of the named approver",
  "payment.verify": "Verify money received",
  "packing.manage": "Create and close packing lists",
  "inspection.record": "Record inspection results and weights",
  "shipment.manage": "Book and depart shipments",
  "masterdata.manage": "Edit specifications and lacing master data",
  "settings.manage": "Change pricing rules and system settings",
  "users.manage": "Add and edit users",
};
