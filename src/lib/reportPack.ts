import {
  activeCustomers,
  collectionByMethod,
  conversionByCustomer,
  convertedOrders,
  customerByYear,
  issuedQuotations,
  materialBreakdown,
  monthOnMonth,
  monthlyOrderValue,
  receivablesAging,
  shipmentCycleDays,
  type Period,
} from "./analytics";
import type { AnySheet, Sheet } from "./xlsx";
import type { SlideSpec } from "./pptx";
import { formatMoney } from "./format";
import type { Customer, PaymentRecord, Quotation, SalesOrder, Shipment } from "./types";

/**
 * The monthly report pack, assembled once and rendered twice.
 *
 * The office circulates the same analysis in two forms, a workbook people pivot and a deck people
 * present, and the fastest way to have those two disagree is to build them separately. So every
 * section is computed once here and then handed to the Excel writer and the PowerPoint writer,
 * which do nothing but lay it out. If a figure is wrong it is wrong in both, which is the property
 * worth having.
 *
 * Sections are opt-in rather than all-or-nothing: a sales meeting wants conversion and customers, a
 * finance review wants aging and collection, and nobody wants to delete eleven tabs afterwards.
 */

export type ReportSectionId =
  | "summary"
  | "conversion"
  | "trend"
  | "comparison"
  | "customers"
  | "material"
  | "aging"
  | "collection";

export interface ReportSection {
  id: ReportSectionId;
  label: string;
  description: string;
  /** Whether it reports money, and so whether it belongs in a pack for someone who cannot see it. */
  financial: boolean;
}

export const REPORT_SECTIONS: ReportSection[] = [
  { id: "summary", label: "Period summary", description: "Quotations, orders, conversion, weight and cycle time.", financial: true },
  { id: "conversion", label: "Quoted against won", description: "Per customer, with the conversion rate between them.", financial: true },
  { id: "trend", label: "Monthly trend", description: "Order value by month across the comparison years.", financial: true },
  { id: "comparison", label: "MoM & YoY comparison", description: "This period against last month and last year.", financial: true },
  { id: "customers", label: "Customer by year", description: "Historical value per customer against their own average.", financial: true },
  { id: "material", label: "Material breakdown", description: "Nylon, polyethylene and polyester split by value and weight.", financial: true },
  { id: "aging", label: "Aging of accounts", description: "Outstanding receivables bucketed by age.", financial: true },
  { id: "collection", label: "Collection report", description: "Verified remittances grouped by channel.", financial: true },
];

export interface PackInput {
  period: Period;
  /** Years the trend and the customer matrix span, oldest first. */
  years: string[];
  quotations: Quotation[];
  salesOrders: SalesOrder[];
  customers: Customer[];
  payments: PaymentRecord[];
  shipments: Shipment[];
}

export interface PackOptions {
  sections: ReportSectionId[];
  /** Charts cost nothing in the workbook; in the deck they are the point, so they can be dropped
   *  for a data-only handout. */
  includeCharts: boolean;
  preparedBy?: string;
}

/**
 * Keeps a sheet's row type inferred at the point it is written.
 *
 * Pushing the literal straight into an `AnySheet[]` would erase T before the column callbacks are
 * checked, and a typo in a field name would compile.
 */
function sheetOf<T>(s: Sheet<T>): AnySheet {
  return s as AnySheet;
}

const money = (n: number) => Math.round(n * 100) / 100;
/** Excel's percent format multiplies by 100, so a rate is stored as a fraction. */
const fraction = (pct: number) => Math.round(pct * 100) / 10000;

/** A short "+12.3%" / "−4.0%" for the deck, where a signed figure reads faster than a raw one. */
function signedPct(pct: number | null): string {
  if (pct === null) return "n/a";
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`;
}

export interface ReportPack {
  title: string;
  subtitle: string;
  sheets: AnySheet[];
  slides: SlideSpec[];
}

export function buildReportPack(input: PackInput, options: PackOptions): ReportPack {
  const { period, years, quotations, salesOrders, customers, payments, shipments } = input;
  const wanted = new Set(options.sections);
  const sheets: AnySheet[] = [];
  const slides: SlideSpec[] = [];
  const stamp = `${period.label} · generated ${new Date().toISOString().slice(0, 10)}`;
  const title = "Export Sales Summary and Performance";

  slides.push({
    kind: "title",
    title: title.toUpperCase(),
    subtitle: period.label,
    date: options.preparedBy ? `Prepared by ${options.preparedBy} · ${new Date().toDateString()}` : new Date().toDateString(),
  });

  // ---- Period summary -----------------------------------------------------
  if (wanted.has("summary")) {
    const issued = issuedQuotations(quotations, period);
    const converted = convertedOrders(salesOrders, quotations, period);
    const cycle = shipmentCycleDays(salesOrders, shipments, period);
    const conversionPct = issued.value > 0 ? (converted.value / issued.value) * 100 : 0;

    const rows = [
      { metric: "Sales quotations issued", count: issued.count, value: money(issued.value), weight: money(issued.weightKg) },
      { metric: "Sales orders confirmed", count: converted.count, value: money(converted.value), weight: money(converted.weightKg) },
    ];
    sheets.push(sheetOf({
      name: "Summary",
      notes: [`${title}. ${stamp}`],
      columns: [
        { header: "Metric", value: (r) => r.metric, width: 34 },
        { header: "Count", value: (r) => r.count, format: "integer" },
        { header: "Total value", value: (r) => r.value, format: "money" },
        { header: "Total weight (KG)", value: (r) => r.weight, format: "weight" },
      ],
      rows,
      totals: [
        "Conversion rate",
        null,
        money(conversionPct / 100),
        `${cycle.averageDays} days avg. cycle`,
      ],
    }));

    slides.push({
      kind: "section",
      title: `${period.label} Sales Performance`,
      subtitle: "Quotations issued, orders confirmed, and the conversion between them",
    });
    slides.push({
      kind: "kpi",
      title: `${period.label} Sales Performance`,
      subtitle: "Confirmed against quoted, with volume and cycle time",
      tiles: [
        { label: "Total sales quotations", value: formatMoney(issued.value), note: `${issued.count} PI · ${issued.weightKg.toFixed(0)} KG` },
        { label: "Total sales orders", value: formatMoney(converted.value), note: `${converted.count} SO · ${converted.weightKg.toFixed(0)} KG` },
        { label: "Conversion rate", value: `${conversionPct.toFixed(2)}%`, note: "Order value against quoted value" },
        {
          label: "Shipment cycle",
          value: cycle.shipped ? `${cycle.averageDays} days` : "-",
          note: cycle.shipped ? `${cycle.shipped} departure${cycle.shipped === 1 ? "" : "s"}` : "No departures this period",
        },
        {
          label: "Active customers",
          value: String(activeCustomers(quotations, salesOrders, period)),
          note: "Quoted or ordered in the period",
        },
      ],
    });
  }

  // ---- Quoted against won -------------------------------------------------
  if (wanted.has("conversion")) {
    const rows = conversionByCustomer(quotations, salesOrders, customers, period);
    const totalQuoted = rows.reduce((s, r) => s + r.quotationValue, 0);
    const totalOrders = rows.reduce((s, r) => s + r.orderValue, 0);

    sheets.push(sheetOf({
      name: "Quoted vs Won",
      notes: [`Per customer. ${stamp}`],
      columns: [
        { header: "Customer", value: (r) => r.customer, width: 34 },
        { header: "Sales quotation", value: (r) => money(r.quotationValue), format: "money" },
        { header: "Sales order", value: (r) => money(r.orderValue), format: "money" },
        { header: "Conversion rate", value: (r) => fraction(r.conversionPct), format: "percent" },
      ],
      rows,
      totals: [
        "GRAND TOTAL",
        money(totalQuoted),
        money(totalOrders),
        totalQuoted > 0 ? fraction((totalOrders / totalQuoted) * 100) : 0,
      ],
    }));

    slides.push({
      kind: "table",
      title: "Quoted against won",
      subtitle: `Per customer · ${period.label}`,
      columns: ["Customer", "Sales quotation", "Sales order", "Conversion"],
      rows: rows.map((r) => [
        r.customer,
        formatMoney(r.quotationValue),
        formatMoney(r.orderValue),
        r.quotationValue > 0 ? `${r.conversionPct.toFixed(2)}%` : "-",
      ]),
      totals: [
        "GRAND TOTAL",
        formatMoney(totalQuoted),
        formatMoney(totalOrders),
        totalQuoted > 0 ? `${((totalOrders / totalQuoted) * 100).toFixed(2)}%` : "-",
      ],
    });

    const won = rows.filter((r) => r.orderValue > 0);
    if (options.includeCharts && won.length > 0) {
      slides.push({
        kind: "chart",
        chart: "pie",
        title: "Order value by customer",
        subtitle: `Share of confirmed sales orders · ${period.label}`,
        categories: won.map((r) => r.customer),
        series: [{ name: "Sales orders", values: won.map((r) => money(r.orderValue)) }],
        numberFormat: '"$"#,##0.00',
      });
    }
  }

  // ---- Monthly trend ------------------------------------------------------
  if (wanted.has("trend")) {
    const points = monthlyOrderValue(salesOrders, years);
    const totals = years.map((y) => points.reduce((s, p) => s + (p.values[y] ?? 0), 0));

    sheets.push(sheetOf({
      name: "Monthly Trend",
      notes: [`Confirmed sales order value by month: ${years.join(", ")}`],
      columns: [
        { header: "Month", value: (p) => p.month, width: 14 },
        ...years.map((y) => ({
          header: y,
          value: (p: (typeof points)[number]) => (p.values[y] === null ? null : money(p.values[y] ?? 0)),
          format: "money" as const,
        })),
        {
          header: "Monthly average",
          value: (p: (typeof points)[number]) => {
            const seen = years.map((y) => p.values[y]).filter((v): v is number => v !== null && v !== undefined);
            return seen.length ? money(seen.reduce((s, v) => s + v, 0) / seen.length) : null;
          },
          format: "money" as const,
        },
      ],
      rows: points,
      totals: ["GRAND TOTAL", ...totals.map(money), money(totals.reduce((s, v) => s + v, 0) / Math.max(1, years.length))],
    }));

    if (options.includeCharts) {
      slides.push({
        kind: "chart",
        chart: "bar",
        title: "Monthly Confirmed Sales Order Performance",
        subtitle: `${years.join(" against ")}, by month`,
        categories: points.map((p) => p.month),
        series: years.map((y) => ({ name: y, values: points.map((p) => p.values[y]) })),
        numberFormat: '"$"#,##0',
      });
    }
    slides.push({
      kind: "table",
      title: "Monthly Confirmed Sales Order Performance",
      subtitle: years.join(" · "),
      columns: ["Month", ...years],
      rows: points.map((p) => [p.month, ...years.map((y) => (p.values[y] === null ? "-" : formatMoney(p.values[y] ?? 0)))]),
      totals: ["GRAND TOTAL", ...totals.map((t) => formatMoney(t))],
    });
  }

  // ---- MoM & YoY ----------------------------------------------------------
  if (wanted.has("comparison")) {
    const rows = monthOnMonth(salesOrders, period);
    sheets.push(sheetOf({
      name: "MoM and YoY",
      notes: [`Movement against the comparable period. ${stamp}`],
      columns: [
        { header: "Comparison", value: (r) => r.label, width: 42 },
        { header: "From", value: (r) => money(r.from), format: "money" },
        { header: "To", value: (r) => money(r.to), format: "money" },
        { header: "Difference", value: (r) => money(r.difference), format: "money" },
        // Left empty rather than zeroed where there is no base: an empty cell is read as "not
        // applicable", a 0.00% is read as "no change".
        { header: "Change", value: (r) => (r.percent === null ? null : fraction(r.percent)), format: "percent" },
      ],
      rows,
    }));

    slides.push({
      kind: "kpi",
      title: "MoM & YoY Comparison",
      subtitle: period.label,
      tiles: rows.map((r) => ({
        label: r.label,
        value: signedPct(r.percent),
        note: `${formatMoney(r.from)} → ${formatMoney(r.to)}`,
      })),
    });
  }

  // ---- Customer by year ---------------------------------------------------
  if (wanted.has("customers")) {
    const rows = customerByYear(salesOrders, customers, years);
    const latest = years[years.length - 1];
    sheets.push(sheetOf({
      name: "Customer by Year",
      notes: [`Confirmed sales order value per customer: ${years.join(", ")}`],
      columns: [
        { header: "Customer", value: (r) => r.customer, width: 34 },
        ...years.map((y) => ({
          header: y,
          value: (r: (typeof rows)[number]) => money(r.byYear[y]),
          format: "money" as const,
        })),
        { header: "Grand total", value: (r) => money(r.total), format: "money" },
        { header: `Average ${years[0]}–${years[years.length - 2] ?? years[0]}`, value: (r) => money(r.averagePrior), format: "money" },
        { header: "% diff vs average", value: (r) => fraction(r.diffVsAveragePct), format: "percent" },
      ],
      rows,
      totals: [
        "GRAND TOTAL",
        ...years.map((y) => money(rows.reduce((s, r) => s + r.byYear[y], 0))),
        money(rows.reduce((s, r) => s + r.total, 0)),
      ],
    }));

    slides.push({
      kind: "table",
      title: "Customer sales by year",
      subtitle: `${years.join(" – ")} · latest year against each customer's own prior average`,
      columns: ["Customer", ...years, "vs average"],
      rows: rows
        .slice(0, 12)
        .map((r) => [r.customer, ...years.map((y) => formatMoney(r.byYear[y])), r.averagePrior > 0 ? signedPct(r.diffVsAveragePct) : "-"]),
      totals: [
        "GRAND TOTAL",
        ...years.map((y) => formatMoney(rows.reduce((s, r) => s + r.byYear[y], 0))),
        "",
      ],
    });

    if (options.includeCharts && rows.length > 0) {
      const top = rows.slice(0, 8);
      slides.push({
        kind: "chart",
        chart: "bar",
        title: `Customer sales by year`,
        subtitle: `Top ${top.length} customers, ${years.join(" – ")}`,
        categories: top.map((r) => r.customer),
        series: years.map((y) => ({ name: y, values: top.map((r) => money(r.byYear[y])) })),
        numberFormat: '"$"#,##0',
      });
    }
    void latest;
  }

  // ---- Material breakdown -------------------------------------------------
  if (wanted.has("material")) {
    const rows = materialBreakdown(salesOrders, quotations, period);
    sheets.push(sheetOf({
      name: "Material Breakdown",
      notes: [`Confirmed order value by material family. ${stamp}`],
      columns: [
        { header: "Material", value: (r) => r.material, width: 22 },
        { header: "Value", value: (r) => money(r.value), format: "money" },
        { header: "Weight (KG)", value: (r) => money(r.weightKg), format: "weight" },
        { header: "Share", value: (r) => fraction(r.sharePct), format: "percent" },
      ],
      rows,
      totals: [
        "TOTAL",
        money(rows.reduce((s, r) => s + r.value, 0)),
        money(rows.reduce((s, r) => s + r.weightKg, 0)),
        rows.length ? 1 : 0,
      ],
    }));

    if (options.includeCharts && rows.length > 0) {
      slides.push({
        kind: "chart",
        chart: "pie",
        title: "Sales breakdown by material type",
        subtitle: period.label,
        categories: rows.map((r) => r.material),
        series: [{ name: "Value", values: rows.map((r) => money(r.value)) }],
        numberFormat: '"$"#,##0.00',
      });
    }
    slides.push({
      kind: "table",
      title: "Sales breakdown by material type",
      subtitle: period.label,
      columns: ["Material", "Value", "Weight (KG)", "Share"],
      rows: rows.map((r) => [r.material, formatMoney(r.value), r.weightKg.toFixed(2), `${r.sharePct.toFixed(1)}%`]),
    });
  }

  // ---- Aging --------------------------------------------------------------
  if (wanted.has("aging")) {
    const rows = receivablesAging(customers, salesOrders, payments);
    sheets.push(sheetOf({
      name: "Aging of Accounts",
      notes: [`Outstanding receivables as at ${new Date().toISOString().slice(0, 10)}`],
      columns: [
        { header: "Customer", value: (r) => r.customer, width: 34 },
        { header: "Country", value: (r) => r.country, width: 18 },
        { header: "0-30 days", value: (r) => money(r.d0_30), format: "money" },
        { header: "31-60 days", value: (r) => money(r.d31_60), format: "money" },
        { header: "61-90 days", value: (r) => money(r.d61_90), format: "money" },
        { header: "90+ days", value: (r) => money(r.d90_plus), format: "money" },
        { header: "Total outstanding", value: (r) => money(r.total), format: "money" },
      ],
      rows,
      totals: [
        "TOTAL",
        null,
        money(rows.reduce((s, r) => s + r.d0_30, 0)),
        money(rows.reduce((s, r) => s + r.d31_60, 0)),
        money(rows.reduce((s, r) => s + r.d61_90, 0)),
        money(rows.reduce((s, r) => s + r.d90_plus, 0)),
        money(rows.reduce((s, r) => s + r.total, 0)),
      ],
    }));

    slides.push({
      kind: "table",
      title: "Aging of accounts",
      subtitle: `Outstanding receivables as at ${new Date().toISOString().slice(0, 10)}`,
      columns: ["Customer", "0–30", "31–60", "61–90", "90+", "Total"],
      rows: rows.map((r) => [
        r.customer,
        formatMoney(r.d0_30),
        formatMoney(r.d31_60),
        formatMoney(r.d61_90),
        formatMoney(r.d90_plus),
        formatMoney(r.total),
      ]),
      totals: ["TOTAL", "", "", "", "", formatMoney(rows.reduce((s, r) => s + r.total, 0))],
    });
  }

  // ---- Collection ---------------------------------------------------------
  if (wanted.has("collection")) {
    const rows = collectionByMethod(payments);
    sheets.push(sheetOf({
      name: "Collection",
      notes: ["Verified remittances grouped by channel"],
      columns: [
        { header: "Channel", value: (r) => r.method, width: 30 },
        { header: "Transactions", value: (r) => r.count, format: "integer" },
        { header: "Amount received", value: (r) => money(r.amount), format: "money" },
      ],
      rows,
      totals: ["TOTAL", rows.reduce((s, r) => s + r.count, 0), money(rows.reduce((s, r) => s + r.amount, 0))],
    }));

    if (options.includeCharts && rows.length > 0) {
      slides.push({
        kind: "chart",
        chart: "pie",
        title: "Collection by channel",
        subtitle: "Verified remittances",
        categories: rows.map((r) => r.method),
        series: [{ name: "Received", values: rows.map((r) => money(r.amount)) }],
        numberFormat: '"$"#,##0.00',
      });
    }
  }

  return { title, subtitle: period.label, sheets, slides };
}

/** A filename stem both exports agree on, so the pair sorts together in a downloads folder. */
export function packFilename(period: Period): string {
  return `fnt-sales-performance-${period.key}`;
}
