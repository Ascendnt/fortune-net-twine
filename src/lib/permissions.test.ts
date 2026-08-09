import { describe, it, expect } from "vitest";
import { PERMISSION_LABELS, approverRoles, can, permissionsFor } from "./permissions";
import type { Permission } from "./permissions";
import type { Role } from "./types";

const ALL_ROLES: Role[] = [
  "admin",
  "management",
  "finance",
  "sales_manager",
  "sales_rep",
  "logistics",
  "factory_technical",
];

describe("payment override", () => {
  it("is Management only", () => {
    // The rule Kenneth set: standing in for a named approver is a claim of authority, so it does
    // not spread to whoever happens to be at their desk.
    const allowed = ALL_ROLES.filter((r) => can(r, "payment.override"));
    expect(allowed.sort()).toEqual(["admin", "management"]);
  });

  it("is not held by Finance, who can still approve normally", () => {
    expect(can("finance", "payment.override")).toBe(false);
    expect(can("finance", "payment.approve")).toBe(true);
  });

  it("is not held by anyone in Sales or Operations", () => {
    for (const role of ["sales_rep", "sales_manager", "logistics", "factory_technical"] as Role[]) {
      expect(can(role, "payment.override")).toBe(false);
    }
  });
});

describe("payment approval", () => {
  it("is held by Management, Finance and Admin", () => {
    expect(approverRoles().sort()).toEqual(["admin", "finance", "management"]);
  });

  it("is not held by the roles that raise payments", () => {
    // Nobody raises a payment and signs it off alone.
    expect(can("sales_rep", "payment.create")).toBe(true);
    expect(can("sales_rep", "payment.approve")).toBe(false);
    expect(can("sales_manager", "payment.create")).toBe(true);
    expect(can("sales_manager", "payment.approve")).toBe(false);
  });
});

describe("role matrix", () => {
  it("gives Admin everything, so the system can always be unstuck", () => {
    const everyPermission = Object.keys(PERMISSION_LABELS) as Permission[];
    for (const p of everyPermission) {
      expect(can("admin", p)).toBe(true);
    }
  });

  it("keeps operational data entry out of Management's hands", () => {
    expect(can("management", "packing.manage")).toBe(false);
    expect(can("management", "inspection.record")).toBe(false);
  });

  it("lets the factory record inspections but not book shipments", () => {
    expect(can("factory_technical", "inspection.record")).toBe(true);
    expect(can("factory_technical", "shipment.manage")).toBe(false);
  });

  it("lets Logistics pack and ship but not touch money", () => {
    expect(can("logistics", "packing.manage")).toBe(true);
    expect(can("logistics", "shipment.manage")).toBe(true);
    expect(can("logistics", "payment.approve")).toBe(false);
    expect(can("logistics", "payment.create")).toBe(false);
  });

  it("only lets Sales Manager and above approve a quotation", () => {
    expect(can("sales_rep", "quotation.approve")).toBe(false);
    expect(can("sales_manager", "quotation.approve")).toBe(true);
  });

  it("gives every role at least something to do", () => {
    for (const role of ALL_ROLES) {
      expect(permissionsFor(role).length).toBeGreaterThan(0);
    }
  });

  it("has a plain-language label for every permission it grants", () => {
    // Otherwise the roles screen shows raw keys like "payment.override" to a non-technical user.
    for (const role of ALL_ROLES) {
      for (const p of permissionsFor(role)) {
        expect(PERMISSION_LABELS[p]).toBeTruthy();
      }
    }
  });
});
