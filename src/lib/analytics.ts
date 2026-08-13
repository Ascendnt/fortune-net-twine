import { totalsForQuotation } from "./totals";
import type {
  Customer,
  PaymentRecord,
  Quotation,
  QuotationLineItem,
  SalesOrder,
  Shipment,
} from "./types";

/**
 * The arithmetic behind the dashboard and the monthly report pack.
 *
 * All of it is pure functions over the store's own records, for one reason: the office currently
 * rebuilds the same figures by hand in Excel every month before pasting them into a deck. Every
 * number here is one they already calculate: issued PI value against converted SO value, the
 * conversion rate between them, month-on-month and year-on-year movement, the split by customer and
 * by material. Putting them in code makes them testable, and makes the deck a render rather than a
 * morning's work.
 *
 * Two conventions worth stating once. Percentages are returned as PERCENTAGES (46.29) rather than
 * fractions, because the screens print them directly and the Excel export divides by a hundred
 * where the cell format needs one. And a period is always a half-open month or year matched on the
 * record's own date string, so nothing is double-counted at a boundary.
 */

export type Granularity = "month" | "year";

export interface Period {
  granularity: Granularity;
  /** "2026-07" for a month, "2026" for a year. */
  key: string;
  /** "July 2026" / "2026". */
  label: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function periodOf(iso: string, granularity: Granularity): string {
  return granularity === "year" ? iso.slice(0, 4) : iso.slice(0, 7);
}

export function periodLabel(key: string): string {
  if (key.length === 4) return key;
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

export function makePeriod(key: string): Period {
  return { granularity: key.length === 4 ? "year" : "month", key, label: periodLabel(key) };
}

/**
 * Every period the data actually covers, newest first.
 *
 * Built from the records rather than from a calendar, so the picker never offers a month with
 * nothing in it. The current month is always offered, because a month that has only just started
 * still needs to be openable to see that it is empty.
 */
export function availablePeriods(
  granularity: Granularity,
  quotations: Quotation[],
  orders: SalesOrder[],
  today: string = new Date().toISOString().slice(0, 10)
): Period[] {
  const keys = new Set<string>([periodOf(today, granularity)]);
  for (const q of quotations) if (q.issueDate) keys.add(periodOf(q.issueDate, granularity));
  for (const o of orders) if (o.orderDate) keys.add(periodOf(o.orderDate, granularity));
  return [...keys].sort().reverse().map(makePeriod);
}

/** Whether an ISO date falls inside the period. */
export function inPeriod(iso: string | undefined, period: Period): boolean {
  if (!iso) return false;
  return periodOf(iso, period.granularity) === period.key;
}

// ---------------------------------------------------------------------------
// Value and weight
// ---------------------------------------------------------------------------

export function lineWeight(items: QuotationLineItem[]): number {
  return items.reduce((s, li) => s + (li.weightKg || 0), 0);
}

/**
 * What a quotation is worth.
 *
 * Runs through the same totals engine the PI document and the builder use, so a figure quoted in a
 * report is the figure on the paper the customer holds. Recomputing it here with a simpler sum
 * would drop freight, discount and tax and quietly disagree with every other screen.
 */
export function quotationValue(q: Quotation): number {
  return totalsForQuotation(q).grandTotal;
}

export interface VolumeSummary {
  count: number;
  value: number;
  weightKg: number;
}

/** Proforma invoices issued in the period, which is the top of the funnel. */
export function issuedQuotations(quotations: Quotation[], period: Period): VolumeSummary {
  const mine = quotations.filter((q) => inPeriod(q.issueDate, period));
  return {
    count: mine.length,
    value: mine.reduce((s, q) => s + quotationValue(q), 0),
    weightKg: mine.reduce((s, q) => s + lineWeight(q.items), 0),
  };
}

/**
 * Sales orders confirmed in the period, which is the bottom of the funnel.
 *
 * Counted on the ORDER's date, not the quotation's. A PI issued in May and accepted in July is
 * July's win; attributing it to May would credit a month that closed nothing and make every
 * conversion rate a comparison of two different populations.
 */
export function convertedOrders(
  orders: SalesOrder[],
  quotations: Quotation[],
  period: Period
): VolumeSummary {
  const mine = orders.filter((o) => inPeriod(o.orderDate, period));
  return {
    count: mine.length,
    value: mine.reduce((s, o) => s + o.orderValue, 0),
    weightKg: mine.reduce((s, o) => {
      const q = o.quotationId ? quotations.find((x) => x.id === o.quotationId) : undefined;
      return s + (q ? lineWeight(q.items) : 0);
    }, 0),
  };
}

export interface ConversionRow {
  customerId: string;
  customer: string;
  quotationValue: number;
  orderValue: number;
  /** Order value as a percentage of quotation value. Over 100 when a customer converts more than
   *  they were quoted for in the period, which is normal when a PI from an earlier month lands here. */
  conversionPct: number;
}

/**
 * The conversion table the monthly deck leads with: quoted against won, customer by customer.
 *
 * A customer appears if they were quoted OR they ordered, not only if both. Dropping the ones who
 * were quoted and did not order would delete exactly the rows the meeting is about.
 */
export function conversionByCustomer(
  quotations: Quotation[],
  orders: SalesOrder[],
  customers: Customer[],
  period: Period
): ConversionRow[] {
  const rows = new Map<string, ConversionRow>();
  const row = (customerId: string) => {
    let r = rows.get(customerId);
    if (!r) {
      r = {
        customerId,
        customer: customers.find((c) => c.id === customerId)?.name ?? customerId,
        quotationValue: 0,
        orderValue: 0,
        conversionPct: 0,
      };
      rows.set(customerId, r);
    }
    return r;
  };

  for (const q of quotations) {
    if (inPeriod(q.issueDate, period)) row(q.customerId).quotationValue += quotationValue(q);
  }
  for (const o of orders) {
    if (inPeriod(o.orderDate, period)) row(o.customerId).orderValue += o.orderValue;
  }

  return [...rows.values()]
    .map((r) => ({ ...r, conversionPct: r.quotationValue > 0 ? (r.orderValue / r.quotationValue) * 100 : 0 }))
    .sort((a, b) => b.orderValue - a.orderValue || b.quotationValue - a.quotationValue);
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  month: string;
  monthNo: number;
  /** Confirmed order value for that month, per year. Missing years are absent, not zero. */
  values: Record<string, number | null>;
}

/**
 * Order value by month for a set of years. This is the deck's central table and its chart.
 *
 * A month with no orders in a year that has data is a real zero and is reported as one. A month in
 * a year that has not happened yet is `null`, so the chart breaks the line rather than dropping it
 * to the axis and inventing a collapse.
 */
export function monthlyOrderValue(orders: SalesOrder[], years: string[]): MonthlyPoint[] {
  const latest = orders.reduce((max, o) => (o.orderDate > max ? o.orderDate : max), "");
  return MONTHS.map((name, i) => {
    const monthNo = i + 1;
    const key = String(monthNo).padStart(2, "0");
    const values: Record<string, number | null> = {};
    for (const year of years) {
      const monthKey = `${year}-${key}`;
      const mine = orders.filter((o) => o.orderDate?.slice(0, 7) === monthKey);
      // Beyond the last month there is data for, report nothing rather than nothing-happened.
      values[year] = mine.length === 0 && monthKey > latest.slice(0, 7) ? null : mine.reduce((s, o) => s + o.orderValue, 0);
    }
    return { month: MONTH_SHORT[i], monthNo, values };
  });
}

export interface ComparisonRow {
  label: string;
  from: number;
  to: number;
  difference: number;
  /**
   * Change against `from`, or null when there is no base to change from.
   *
   * Null rather than zero, because zero is a claim. It says "this period matched the last one",
   * and a month following one with no orders at all did nothing of the sort. Reporting 0% beside a
   * difference of +$22,400 is the sort of figure somebody repeats in a meeting.
   */
  percent: number | null;
}

function compare(label: string, from: number, to: number): ComparisonRow {
  return { label, from, to, difference: to - from, percent: from === 0 ? null : ((to - from) / from) * 100 };
}

/**
 * The three comparisons the deck states in words: this month against the same month last year,
 * against last month, and year-to-date against the same span a year ago.
 */
export function monthOnMonth(orders: SalesOrder[], period: Period): ComparisonRow[] {
  if (period.granularity === "year") {
    const year = Number(period.key);
    const total = (y: number) => orders.filter((o) => o.orderDate?.startsWith(String(y))).reduce((s, o) => s + o.orderValue, 0);
    return [compare(`${year - 1} vs ${year}`, total(year - 1), total(year))];
  }

  const [yStr, mStr] = period.key.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const sum = (predicate: (iso: string) => boolean) =>
    orders.filter((o) => o.orderDate && predicate(o.orderDate)).reduce((s, o) => s + o.orderValue, 0);

  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const prevMonth = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);

  const ytd = (y: number) =>
    sum((iso) => iso.startsWith(`${y}-`) && Number(iso.slice(5, 7)) <= month);

  return [
    compare(
      `${MONTHS[month - 1]} ${year - 1} vs ${MONTHS[month - 1]} ${year}`,
      sum((iso) => iso.slice(0, 7) === monthKey(year - 1, month)),
      sum((iso) => iso.slice(0, 7) === period.key)
    ),
    compare(
      `${periodLabel(prevMonth)} vs ${period.label}`,
      sum((iso) => iso.slice(0, 7) === prevMonth),
      sum((iso) => iso.slice(0, 7) === period.key)
    ),
    compare(
      `Jan–${MONTH_SHORT[month - 1]} ${year - 1} vs Jan–${MONTH_SHORT[month - 1]} ${year}`,
      ytd(year - 1),
      ytd(year)
    ),
  ];
}

export interface CustomerYearRow {
  customer: string;
  /** Order value per year, keyed by year. */
  byYear: Record<string, number>;
  total: number;
  /** Mean of every year before the last one on the table. */
  averagePrior: number;
  /** The latest year against that mean. */
  diffVsAveragePct: number;
}

/**
 * Customer by year, with the historical average beside the current one.
 *
 * The average deliberately excludes the year being judged. Including it drags the benchmark toward
 * the figure under test, so a customer having a terrible year would lower the average they are
 * measured against and look less terrible than they are.
 */
export function customerByYear(orders: SalesOrder[], customers: Customer[], years: string[]): CustomerYearRow[] {
  const latest = years[years.length - 1];
  const prior = years.slice(0, -1);
  const ids = [...new Set(orders.map((o) => o.customerId))];

  return ids
    .map((id) => {
      const name = customers.find((c) => c.id === id)?.name ?? id;
      const byYear: Record<string, number> = {};
      for (const y of years) {
        byYear[y] = orders
          .filter((o) => o.customerId === id && o.orderDate?.startsWith(y))
          .reduce((s, o) => s + o.orderValue, 0);
      }
      const total = Object.values(byYear).reduce((s, v) => s + v, 0);
      const priorValues = prior.map((y) => byYear[y]).filter((v) => v > 0);
      const averagePrior = priorValues.length ? priorValues.reduce((s, v) => s + v, 0) / priorValues.length : 0;
      return {
        customer: name,
        byYear,
        total,
        averagePrior,
        diffVsAveragePct: averagePrior === 0 ? 0 : ((byYear[latest] - averagePrior) / averagePrior) * 100,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Material mix
// ---------------------------------------------------------------------------

export type MaterialGroup = "Nylon" | "Polyethylene" | "Polyester" | "Other";

/**
 * Which material family a line belongs to.
 *
 * Read off the line's own description, because that is where it is actually written. The item
 * code is a dimensional code and the specification master keys on a different code series, so
 * neither can be joined to reliably. The deck reports three families, and the plant's several
 * polyethylene grades (HDPE, HTPE, Hi-Ex, H-Ex) all roll into one of them.
 */
export function materialOf(line: { description?: string; specification?: string; itemCode?: string }): MaterialGroup {
  const text = `${line.description ?? ""} ${line.specification ?? ""} ${line.itemCode ?? ""}`.toLowerCase();
  if (/\bnylon\b|\bpa\b/.test(text)) return "Nylon";
  if (/polyester|\bpes\b/.test(text)) return "Polyester";
  if (/hi-?ex|h-?ex|hdpe|htpe|polyethylene|\bpe\b/.test(text)) return "Polyethylene";
  return "Other";
}

export interface MaterialRow {
  material: MaterialGroup;
  value: number;
  weightKg: number;
  sharePct: number;
}

/**
 * The month's sales split by material family.
 *
 * Valued on the order's own lines rather than on the order total. Freight and discount belong to
 * no material, so they are left out instead of being spread across them arbitrarily.
 */
export function materialBreakdown(
  orders: SalesOrder[],
  quotations: Quotation[],
  period: Period
): MaterialRow[] {
  const totals = new Map<MaterialGroup, { value: number; weightKg: number }>();
  for (const order of orders) {
    if (!inPeriod(order.orderDate, period)) continue;
    const q = order.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    for (const li of q?.items ?? []) {
      const key = materialOf(li);
      const at = totals.get(key) ?? { value: 0, weightKg: 0 };
      at.value += li.totalPrice;
      at.weightKg += li.weightKg;
      totals.set(key, at);
    }
  }
  const grand = [...totals.values()].reduce((s, v) => s + v.value, 0);
  return [...totals.entries()]
    .map(([material, v]) => ({ material, ...v, sharePct: grand > 0 ? (v.value / grand) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * How long an order took from confirmation to the container leaving.
 *
 * Measured to actual departure rather than to the booking. The booking is a plan, and the question
 * the number answers, which is how long a customer waits, is only settled when the ship moves. Orders still in the yard are excluded rather than counted as zero.
 */
export function shipmentCycleDays(
  orders: SalesOrder[],
  shipments: Shipment[],
  period: Period
): { averageDays: number; shipped: number } {
  const days: number[] = [];
  for (const shipment of shipments) {
    const departed = shipment.etd;
    if (!departed || !inPeriod(departed, period)) continue;
    const order = orders.find((o) => o.id === shipment.salesOrderId);
    if (!order?.orderDate) continue;
    const delta = (Date.parse(departed) - Date.parse(order.orderDate)) / 86_400_000;
    if (Number.isFinite(delta) && delta >= 0) days.push(delta);
  }
  return {
    averageDays: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : 0,
    shipped: days.length,
  };
}

/** Customers who quoted or ordered inside the period. */
export function activeCustomers(quotations: Quotation[], orders: SalesOrder[], period: Period): number {
  const ids = new Set<string>();
  for (const q of quotations) if (inPeriod(q.issueDate, period)) ids.add(q.customerId);
  for (const o of orders) if (inPeriod(o.orderDate, period)) ids.add(o.customerId);
  return ids.size;
}

/**
 * How much of what was asked for has actually arrived.
 *
 * Counted over live orders only. Completed orders are paid in full by definition, and leaving them
 * in drags the rate towards 100% until it stops moving when anything goes wrong, which is the one
 * thing the number is for.
 */
export function collectionRate(orders: SalesOrder[], payments: PaymentRecord[]): {
  expected: number;
  received: number;
  ratePct: number;
} {
  const live = new Set(orders.filter((o) => o.currentStage !== "completed").map((o) => o.id));
  const mine = payments.filter((p) => live.has(p.salesOrderId) && p.status !== "rejected");
  const expected = mine.reduce((s, p) => s + p.expectedAmount, 0);
  const received = mine.reduce((s, p) => s + p.amountReceived, 0);
  return { expected, received, ratePct: expected > 0 ? (received / expected) * 100 : 0 };
}

export interface HeadlineMetrics {
  activeSalesOrders: number;
  piPendingConfirmation: number;
  nearOrReadyShipment: number;
  pastDueShipment: number;
  totalActiveOrderValue: number;
  collectionRatePct: number;
}

/**
 * The always-on widgets, which are about the state of the business now rather than a period.
 *
 * Deliberately not period-filtered. "Active sales orders" means the ones open today; scoping it to
 * July would answer a question nobody is asking and hide an order that has been stuck since May,
 * which is precisely the one worth surfacing.
 */
export function headlineMetrics(
  orders: SalesOrder[],
  quotations: Quotation[],
  payments: PaymentRecord[],
  today: string = new Date().toISOString().slice(0, 10)
): HeadlineMetrics {
  const active = orders.filter((o) => o.currentStage !== "completed");
  return {
    activeSalesOrders: active.length,
    // Out with the customer and not yet answered: sent, or being negotiated.
    piPendingConfirmation: quotations.filter((q) => q.status === "sent" || q.status === "under_negotiation").length,
    nearOrReadyShipment: active.filter(
      (o) => o.currentStage === "packing" || o.currentStage === "inspection" || o.currentStage === "shipment"
    ).length,
    // Past its promised date and still not away. Anything already at documents or completed has
    // shipped, however late it was, and is somebody else's problem now.
    pastDueShipment: active.filter(
      (o) =>
        o.requestedDeliveryDate &&
        o.requestedDeliveryDate < today &&
        o.currentStage !== "documents" &&
        o.currentStage !== "completed"
    ).length,
    totalActiveOrderValue: active.reduce((s, o) => s + o.orderValue, 0),
    collectionRatePct: collectionRate(orders, payments).ratePct,
  };
}

/** Order counts by current stage, for the pipeline widget. */
export function pipelineByStage(orders: SalesOrder[]): { stage: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of orders) counts.set(o.currentStage, (counts.get(o.currentStage) ?? 0) + 1);
  return [...counts.entries()].map(([stage, count]) => ({ stage, count }));
}

// ---------------------------------------------------------------------------
// Receivables
// ---------------------------------------------------------------------------

export interface AgingRow {
  customerId: string;
  customer: string;
  country: string;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

/**
 * What is owed, by how long it has been owed.
 *
 * Aged from the DUE date, not the invoice date. A payment on 60-day terms is not thirty days late
 * on the thirtieth day. A line with no due date is treated as current rather than dropped, because
 * it is still money outstanding and burying it in no bucket is how it stops being chased.
 */
export function receivablesAging(
  customers: Customer[],
  orders: SalesOrder[],
  payments: PaymentRecord[],
  today: string = new Date().toISOString().slice(0, 10)
): AgingRow[] {
  const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
  return customers
    .map((c) => {
      const mine = new Set(orders.filter((o) => o.customerId === c.id).map((o) => o.id));
      const row: AgingRow = {
        customerId: c.id,
        customer: c.name,
        country: c.country,
        d0_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90_plus: 0,
        total: 0,
      };
      for (const p of payments) {
        if (!mine.has(p.salesOrderId) || p.status === "verified" || p.status === "rejected") continue;
        const amount = p.expectedAmount - p.amountReceived;
        if (amount <= 0) continue;
        const age = p.dueDate ? Math.max(0, daysBetween(p.dueDate, today)) : 0;
        if (age <= 30) row.d0_30 += amount;
        else if (age <= 60) row.d31_60 += amount;
        else if (age <= 90) row.d61_90 += amount;
        else row.d90_plus += amount;
        row.total += amount;
      }
      return row;
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Verified money in, grouped by how it arrived. */
export function collectionByMethod(payments: PaymentRecord[]): { method: string; amount: number; count: number }[] {
  const rows = new Map<string, { amount: number; count: number }>();
  for (const p of payments) {
    if (p.status !== "verified") continue;
    const key = p.method ?? "Unspecified";
    const at = rows.get(key) ?? { amount: 0, count: 0 };
    at.amount += p.amountReceived;
    at.count += 1;
    rows.set(key, at);
  }
  return [...rows.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount);
}
