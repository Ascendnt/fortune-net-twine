// Numeric input guards.
//
// Every numeric field in this app is a quantity, weight, rate, percentage or money amount, and
// none of them can meaningfully be negative. A negative discount silently inflates a grand total,
// a negative quantity produces a negative amount, and a negative weight corrupts the shipping
// total, so the value is clamped at the input rather than being validated later.

/** Parses an input value, clamping to zero. Blank, non numeric and negative all become 0. */
export function toNonNegative(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Same, but clamped to a ceiling as well. Used for percentage fields. */
export function toPercent(raw: string): number {
  return Math.min(100, toNonNegative(raw));
}

/** Props every numeric input in the app spreads, so none of them can go below zero. */
export const NON_NEGATIVE = { type: "number" as const, min: 0, step: "0.01" };

/** Whole units (quantities, weeks, days, pieces). */
export const NON_NEGATIVE_INT = { type: "number" as const, min: 0, step: "1" };
