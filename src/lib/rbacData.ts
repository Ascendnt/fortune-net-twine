// Mirrors Modules/Tenancy/database/seeders/RolePermissionSeeder.php exactly —
// same permission codes, same starter roles and grants — so wiring this panel
// to the real API later is a data-source swap, not a redesign.

export interface PermissionInfo {
  code: string;
  label: string;
  module: string;
}

export interface RoleGrant {
  id: string;
  name: string;
  isSystemDefault: boolean;
  permissionCodes: string[];
  // Mirrors roles.can_override — a SEPARATE permission from any listed
  // above: holding this lets a user force a stuck approval request through
  // (see WorkflowEngine::override()), independent of whether they're a
  // normal approver on any workflow at all.
  canOverride: boolean;
}

export const PERMISSIONS: PermissionInfo[] = [
  { code: "inquiries.manage", label: "Manage customer inquiries", module: "Inquiries" },
  { code: "assessments.manage", label: "Manage technical assessments", module: "Assessment" },
  { code: "quotations.create", label: "Create quotations", module: "Quotation" },
  { code: "quotations.approve", label: "Approve quotations", module: "Quotation" },
  { code: "sales_orders.manage", label: "Manage sales orders", module: "SalesOrder" },
  { code: "payments.record", label: "Record payments", module: "Payment" },
  { code: "payments.verify", label: "Verify payments", module: "Payment" },
  { code: "packing.manage", label: "Manage packing lists", module: "Packing" },
  { code: "inspection.manage", label: "Manage inspections", module: "Inspection" },
  { code: "shipments.manage", label: "Manage shipments", module: "Shipment" },
  { code: "invoices.manage", label: "Manage commercial invoices", module: "Invoice" },
  { code: "approvals.review", label: "Review pending approvals", module: "Approval" },
  { code: "master_data.manage", label: "Manage catalog & pricing", module: "Catalog" },
  { code: "settings.manage", label: "Manage tenant settings", module: "Tenancy" },
  { code: "users.manage", label: "Manage users & roles", module: "Tenancy" },
];

export const PERMISSION_MODULES: string[] = Array.from(new Set(PERMISSIONS.map((p) => p.module)));

export const INITIAL_ROLE_GRANTS: RoleGrant[] = [
  {
    id: "sales-representative",
    name: "Sales Representative",
    isSystemDefault: true,
    permissionCodes: ["inquiries.manage", "assessments.manage", "quotations.create"],
    canOverride: false,
  },
  {
    id: "sales-manager",
    name: "Sales Manager",
    isSystemDefault: true,
    permissionCodes: [
      "inquiries.manage",
      "quotations.create",
      "quotations.approve",
      "sales_orders.manage",
    ],
    canOverride: false,
  },
  {
    id: "factory-technical-team",
    name: "Factory Technical Team",
    isSystemDefault: true,
    permissionCodes: ["assessments.manage"],
    canOverride: false,
  },
  {
    id: "finance-accounting",
    name: "Finance/Accounting",
    isSystemDefault: true,
    permissionCodes: ["payments.record", "payments.verify", "invoices.manage"],
    canOverride: false,
  },
  {
    id: "exportation-logistics",
    name: "Exportation/Logistics",
    isSystemDefault: true,
    permissionCodes: ["packing.manage", "inspection.manage", "shipments.manage"],
    canOverride: false,
  },
  {
    id: "management",
    name: "Management",
    isSystemDefault: true,
    permissionCodes: ["approvals.review", "sales_orders.manage", "payments.verify"],
    // Management can unstick/override requests — matches the CI4 reference's
    // "Head of Department" (can_override + is_admin) seed account.
    canOverride: true,
  },
  {
    id: "system-administrator",
    name: "System Administrator",
    isSystemDefault: true,
    permissionCodes: PERMISSIONS.map((p) => p.code),
    canOverride: true,
  },
];
