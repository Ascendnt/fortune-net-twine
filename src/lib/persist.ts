// localStorage persistence for the prototype.
//
// This is a frontend-only demonstration: there's no backend to save to, but a stray refresh
// part-way through building a quotation shouldn't destroy several minutes of work in front of an
// audience. Each store slice is written under a versioned key; anything unreadable degrades back
// to seed data rather than throwing.
//
// Bump PREFIX when a slice's shape changes incompatibly — old values then simply miss and the
// seeds load, which is the desired behaviour for a prototype.

const PREFIX = "fnt.v2.";

export const PERSIST_KEYS = {
  quotations: "quotations",
  salesOrders: "salesOrders",
  payments: "payments",
  invoices: "invoices",
  approvals: "approvals",
  activity: "activity",
  pricingRules: "pricingRules",
  lookupTables: "lookupTables",
  specMaster: "specMaster",
  lacingCatalog: "lacingCatalog",
  customers: "customers",
  inquiries: "inquiries",
  assessments: "assessments",
  mail: "mail",
  production: "production",
  packing: "packing",
  inspections: "inspections",
  shipments: "shipments",
  /** How often each specification code has been picked, so the picker can lead with the usual ones. */
  specUsage: "specUsage",
  /** Files attached to sales orders. */
  orderDocuments: "orderDocuments",
  users: "users",
  /** The signed-in user's id. Identity only — there is no credential behind it. */
  session: "session",
} as const;

export type PersistKey = (typeof PERSIST_KEYS)[keyof typeof PERSIST_KEYS];

function available(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return false;
  }
}

export function loadPersisted<T>(key: PersistKey, fallback: T): T {
  if (!available()) return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T;
    // An empty array almost always means a bad write rather than a deliberate wipe, and showing an
    // empty app is worse than showing the seeds.
    if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(fallback) && fallback.length > 0) {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function persist<T>(key: PersistKey, value: T): void {
  if (!available()) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded, or storage disabled mid-session. The in-memory state is still correct, so
    // failing quietly is better than interrupting the demo.
  }
}

export function clearPersisted(): void {
  if (!available()) return;
  try {
    for (const key of Object.values(PERSIST_KEYS)) {
      window.localStorage.removeItem(PREFIX + key);
    }
  } catch {
    /* nothing useful to do */
  }
}
