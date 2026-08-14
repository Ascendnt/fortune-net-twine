import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Presentation, FileText, Clock, Lock } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { exportCsv } from "@/lib/csv";
import { downloadWorkbook } from "@/lib/xlsx";
import { downloadDeck, SERIES_COLORS } from "@/lib/pptx";
import { formatMoney } from "@/lib/format";
import { canExportReports } from "@/lib/dashboardScope";
import {
  availablePeriods,
  collectionByMethod,
  conversionByCustomer,
  convertedOrders,
  customerByYear,
  issuedQuotations,
  makePeriod,
  materialBreakdown,
  monthOnMonth,
  monthlyOrderValue,
  periodOf,
  receivablesAging,
  shipmentCycleDays,
  type Granularity,
} from "@/lib/analytics";
import { buildReportPack, packFilename, REPORT_SECTIONS, type ReportSectionId } from "@/lib/reportPack";
import clsx from "clsx";

/**
 * Reports.
 *
 * This screen exists to replace a morning's work. The office assembles the same analysis every
 * month in Excel, covering quoted against won, month on month, year on year, per customer and by
 * material, then pastes it into a deck. Every one of those figures is already in this system, so
 * the screen shows them and the export button hands over the workbook and the deck rather than a
 * CSV somebody then has to rebuild.
 *
 * The period control at the top governs everything below it. Aging and collection are the
 * exception and say so: they are positions as at today, not a month's activity, and pretending
 * otherwise would let someone read June's receivables off a screen labelled June.
 */

export function ReportsPage() {
  const { payments, salesOrders, quotations, customers, shipments, pushToast, role, currentUser } = useStore();
  const mayExport = canExportReports(role);

  const [granularity, setGranularity] = useState<Granularity>("month");
  const periods = useMemo(
    () => availablePeriods(granularity, quotations, salesOrders),
    [granularity, quotations, salesOrders]
  );
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const period = useMemo(() => {
    const wanted = periodKey && periods.some((p) => p.key === periodKey) ? periodKey : periods[0]?.key;
    return makePeriod(wanted ?? periodOf(new Date().toISOString(), granularity));
  }, [periodKey, periods, granularity]);

  /** How many years back the trend and the customer matrix reach. The deck uses four. */
  const [yearSpan, setYearSpan] = useState(4);
  const years = useMemo(() => {
    const latest = Number(period.key.slice(0, 4));
    return Array.from({ length: yearSpan }, (_, i) => String(latest - (yearSpan - 1 - i)));
  }, [period, yearSpan]);

  const [exporting, setExporting] = useState(false);
  const [sections, setSections] = useState<ReportSectionId[]>(REPORT_SECTIONS.map((s) => s.id));
  const [includeCharts, setIncludeCharts] = useState(true);
  const [soaCustomer, setSoaCustomer] = useState<string | null>(null);

  const issued = useMemo(() => issuedQuotations(quotations, period), [quotations, period]);
  const converted = useMemo(() => convertedOrders(salesOrders, quotations, period), [salesOrders, quotations, period]);
  const conversionPct = issued.value > 0 ? (converted.value / issued.value) * 100 : 0;
  const cycle = useMemo(() => shipmentCycleDays(salesOrders, shipments, period), [salesOrders, shipments, period]);

  const conversionRows = useMemo(
    () => conversionByCustomer(quotations, salesOrders, customers, period),
    [quotations, salesOrders, customers, period]
  );
  const trend = useMemo(() => monthlyOrderValue(salesOrders, years), [salesOrders, years]);
  const comparisons = useMemo(() => monthOnMonth(salesOrders, period), [salesOrders, period]);
  const byCustomerYear = useMemo(() => customerByYear(salesOrders, customers, years), [salesOrders, customers, years]);
  const materials = useMemo(() => materialBreakdown(salesOrders, quotations, period), [salesOrders, quotations, period]);
  const aging = useMemo(() => receivablesAging(customers, salesOrders, payments), [customers, salesOrders, payments]);
  const collection = useMemo(() => collectionByMethod(payments), [payments]);

  const soaRow = aging.find((x) => x.customerId === soaCustomer);
  const totalOutstanding = aging.reduce((s, r) => s + r.total, 0);
  const totalCollected = collection.reduce((s, r) => s + r.amount, 0);

  const packInput = { period, years, quotations, salesOrders, customers, payments, shipments };

  function runExport(format: "xlsx" | "pptx" | "csv") {
    if (sections.length === 0) {
      pushToast({ tone: "warning", title: "Nothing selected", description: "Tick at least one section to export." });
      return;
    }
    const pack = buildReportPack(packInput, { sections, includeCharts, preparedBy: currentUser });
    const stem = packFilename(period);

    if (format === "xlsx") {
      downloadWorkbook(stem, pack.sheets, { title: `${pack.title}, ${pack.subtitle}`, creator: currentUser });
      pushToast({
        tone: "success",
        title: "Workbook downloaded",
        description: `${pack.sheets.length} sheet${pack.sheets.length === 1 ? "" : "s"} for ${period.label}.`,
      });
      return;
    }
    if (format === "pptx") {
      downloadDeck(stem, pack.slides, { title: `${pack.title}, ${pack.subtitle}`, creator: currentUser });
      pushToast({
        tone: "success",
        title: "Deck downloaded",
        description: `${pack.slides.length} slides for ${period.label}.`,
      });
      return;
    }
    // One CSV per section would be a folder of files; the sheets are flattened into one instead,
    // separated by their titles, which is what a CSV can honestly carry.
    const lines: string[][] = [];
    for (const sheet of pack.sheets) {
      lines.push([sheet.name.toUpperCase()]);
      lines.push(sheet.columns.map((c) => c.header));
      for (const row of sheet.rows) lines.push(sheet.columns.map((c) => String(c.value(row) ?? "")));
      if (sheet.totals) lines.push(sheet.totals.map((v) => String(v ?? "")));
      lines.push([]);
    }
    const width = Math.max(...lines.map((l) => l.length));
    exportCsv(
      stem,
      lines,
      Array.from({ length: width }, (_, i) => ({ header: i === 0 ? pack.title : "", value: (l: string[]) => l[i] ?? "" }))
    );
    pushToast({ tone: "success", title: "CSV downloaded", description: `${period.label} report pack.` });
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Reporting"]}
        eyebrow="Sales & Financial Reporting"
        title="Reports"
        description="The monthly performance pack, generated from live records and exportable as the workbook and deck that get circulated."
        actions={
          mayExport ? (
            <Button variant="primary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => setExporting(true)}>
              Export report pack
            </Button>
          ) : undefined
        }
      />

      {!mayExport && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 text-[11.5px] leading-snug text-paper-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The report pack is the company's commercial figures, so exporting it is limited to the roles that work with
          them. The operational lists on the packing, inspection and shipment screens export as normal.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-paper-200 bg-white px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-paper-500">
          <Clock className="h-3.5 w-3.5" />
          Period
        </span>
        <div className="flex gap-1.5">
          {(["month", "year"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                granularity === g
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              )}
            >
              {g === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <select
          value={period.key}
          onChange={(e) => setPeriodKey(e.target.value)}
          className="rounded-lg border border-paper-200 bg-white px-3 py-1.5 text-sm"
          aria-label="Period"
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-paper-500">
          Compare
          <select
            value={yearSpan}
            onChange={(e) => setYearSpan(Number(e.target.value))}
            className="rounded-lg border border-paper-200 bg-white px-2 py-1.5 text-xs"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} years
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Sales quotations"
          value={formatMoney(issued.value)}
          sublabel={`${issued.count} PI · ${issued.weightKg.toFixed(0)} KG · ${period.label}`}
        />
        <StatCard
          label="Sales orders"
          value={formatMoney(converted.value)}
          tone="pine"
          sublabel={`${converted.count} SO · ${converted.weightKg.toFixed(0)} KG · ${period.label}`}
        />
        <StatCard
          label="Conversion rate"
          value={`${conversionPct.toFixed(2)}%`}
          tone={conversionPct >= 50 ? "pine" : "amber"}
          sublabel="Order value against quoted value"
        />
        <StatCard
          label="Shipment cycle"
          value={cycle.shipped ? `${cycle.averageDays} days` : "-"}
          sublabel={cycle.shipped ? `${cycle.shipped} departure${cycle.shipped === 1 ? "" : "s"}` : "No departures this period"}
        />
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Quoted against won"
          eyebrow={`Per customer · ${period.label}`}
          subtitle="Conversion above 100% means a quotation issued in an earlier period landed in this one."
        />
        {conversionRows.length === 0 ? (
          <EmptyState title="Nothing quoted or ordered in this period" description="Pick another period above." />
        ) : (
          <Table>
            <THead>
              <TH>Customer</TH>
              <TH>Sales quotation</TH>
              <TH>Sales order</TH>
              <TH>Conversion rate</TH>
            </THead>
            <tbody>
              {conversionRows.map((r) => (
                <TR key={r.customerId}>
                  <TD className="font-medium">{r.customer}</TD>
                  <TD className="font-mono text-paper-500">{formatMoney(r.quotationValue)}</TD>
                  <TD className="font-mono font-semibold text-pine-800">{formatMoney(r.orderValue)}</TD>
                  <TD
                    className={clsx(
                      "font-mono font-semibold",
                      r.conversionPct >= 100 ? "text-pine-700" : r.conversionPct >= 40 ? "text-paper-700" : "text-amber-700"
                    )}
                  >
                    {r.quotationValue > 0 ? `${r.conversionPct.toFixed(2)}%` : "-"}
                  </TD>
                </TR>
              ))}
              <TR>
                <TD className="font-bold">GRAND TOTAL</TD>
                <TD className="font-mono font-bold">{formatMoney(conversionRows.reduce((s, r) => s + r.quotationValue, 0))}</TD>
                <TD className="font-mono font-bold text-pine-800">{formatMoney(conversionRows.reduce((s, r) => s + r.orderValue, 0))}</TD>
                <TD className="font-mono font-bold">{conversionPct.toFixed(2)}%</TD>
              </TR>
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Monthly Confirmed Sales Order Performance"
          eyebrow="Trend"
          subtitle={`${years.join(" · ")}, by month`}
        />
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trend} margin={{ left: -8, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0ec" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6e766c" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ba39a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
            />
            <Tooltip
              formatter={(v, name) => [formatMoney(Number(v)), String(name)]}
              contentStyle={{ borderRadius: 10, border: "1px solid #dfe3dd", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {years.map((y, i) => (
              <Bar key={y} dataKey={`values.${y}`} name={y} fill={`#${SERIES_COLORS[i % SERIES_COLORS.length]}`} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-paper-100 pt-3 sm:grid-cols-3">
          {comparisons.map((c) => (
            <div key={c.label} className="rounded-lg bg-paper-50 px-3 py-2">
              <p className="text-[11px] leading-tight text-paper-500">{c.label}</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-paper-800">
                {formatMoney(c.from)} → {formatMoney(c.to)}
              </p>
              <p
                className={clsx(
                  "font-mono text-xs font-semibold",
                  c.percent === null || Math.abs(c.percent) < 0.05
                    ? "text-paper-500"
                    : c.percent > 0
                      ? "text-pine-700"
                      : "text-alert-600"
                )}
              >
                {c.difference >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(c.difference))}{" "}
                {c.percent === null ? "(no prior period)" : `(${c.percent >= 0 ? "+" : ""}${c.percent.toFixed(2)}%)`}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales breakdown by material" eyebrow={period.label} subtitle="By confirmed order value" />
          {materials.length === 0 ? (
            <EmptyState title="No confirmed orders in this period" description="Nothing to break down yet." />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={materials} dataKey="value" nameKey="material" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {materials.map((m, i) => (
                      <Cell key={m.material} fill={`#${SERIES_COLORS[i % SERIES_COLORS.length]}`} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMoney(Number(v))}
                    contentStyle={{ borderRadius: 10, border: "1px solid #dfe3dd", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {materials.map((m, i) => (
                  <div key={m.material} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-paper-700">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: `#${SERIES_COLORS[i % SERIES_COLORS.length]}` }}
                        />
                        {m.material}
                      </span>
                      <span className="font-mono font-semibold text-paper-800">{m.sharePct.toFixed(0)}%</span>
                    </div>
                    <p className="ml-3.5 font-mono text-[11px] text-paper-500">
                      {formatMoney(m.value)} · {m.weightKg.toFixed(0)} KG
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Collection report"
            eyebrow="As at today"
            subtitle="Verified remittances grouped by channel. Not filtered by the period above."
          />
          <div className="mb-3 grid grid-cols-2 gap-3">
            <StatCard label="Total collected" value={formatMoney(totalCollected)} tone="pine" />
            <StatCard label="Total outstanding" value={formatMoney(totalOutstanding)} tone="alert" />
          </div>
          <div className="space-y-2">
            {collection.map((c) => (
              <div key={c.method} className="flex items-center justify-between rounded-lg bg-paper-50 px-3 py-2 text-sm">
                <span className="text-paper-600">
                  {c.method} <span className="text-[11px] text-paper-400">· {c.count}</span>
                </span>
                <span className="font-mono font-semibold text-paper-800">{formatMoney(c.amount)}</span>
              </div>
            ))}
            {collection.length === 0 && <p className="text-sm text-paper-400">No verified remittances yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader
          title="Customer sales by year"
          eyebrow="Historical"
          subtitle={`${years.join(" – ")}. The average excludes the year being judged, so a bad year does not lower its own benchmark.`}
        />
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TH>Customer</TH>
              {years.map((y) => (
                <TH key={y}>{y}</TH>
              ))}
              <TH>Grand total</TH>
              <TH>vs average</TH>
            </THead>
            <tbody>
              {byCustomerYear.map((r) => (
                <TR key={r.customer}>
                  <TD className="font-medium">{r.customer}</TD>
                  {years.map((y) => (
                    <TD key={y} className="font-mono text-paper-600">
                      {r.byYear[y] > 0 ? formatMoney(r.byYear[y]) : "-"}
                    </TD>
                  ))}
                  <TD className="font-mono font-semibold">{formatMoney(r.total)}</TD>
                  <TD
                    className={clsx(
                      "font-mono font-semibold",
                      r.averagePrior === 0 ? "text-paper-400" : r.diffVsAveragePct >= 0 ? "text-pine-700" : "text-alert-600"
                    )}
                  >
                    {r.averagePrior > 0 ? `${r.diffVsAveragePct >= 0 ? "+" : ""}${r.diffVsAveragePct.toFixed(1)}%` : "-"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Aging of accounts"
          eyebrow="Receivables · as at today"
          subtitle="Aged from the due date, not the invoice date. Not filtered by the period above."
        />
        {aging.length === 0 ? (
          <EmptyState title="Nothing outstanding" description="Every expected payment has been received and verified." />
        ) : (
          <Table>
            <THead>
              <TH>Customer</TH>
              <TH>0–30 days</TH>
              <TH>31–60 days</TH>
              <TH>61–90 days</TH>
              <TH>90+ days</TH>
              <TH>Total</TH>
              <TH>Statement</TH>
            </THead>
            <tbody>
              {aging.map((r) => (
                <TR key={r.customerId}>
                  <TD className="font-medium">{r.customer}</TD>
                  <TD className="font-mono">{formatMoney(r.d0_30)}</TD>
                  <TD className="font-mono">{formatMoney(r.d31_60)}</TD>
                  <TD className="font-mono text-amber-700">{formatMoney(r.d61_90)}</TD>
                  <TD className="font-mono text-alert-700">{formatMoney(r.d90_plus)}</TD>
                  <TD className="font-mono font-semibold">{formatMoney(r.total)}</TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => setSoaCustomer(r.customerId)}>
                      Generate SOA
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={exporting}
        onClose={() => setExporting(false)}
        title="Export report pack"
        subtitle={`${period.label} · ${years.join("–")} comparison`}
        width="max-w-2xl"
        footer={
          <>
            <span className="mr-auto text-xs text-paper-500">
              {sections.length} section{sections.length === 1 ? "" : "s"} selected
            </span>
            <Button variant="secondary" size="sm" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => runExport("csv")}>
              CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Presentation className="h-3.5 w-3.5" />}
              onClick={() => runExport("pptx")}
            >
              PowerPoint
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              onClick={() => runExport("xlsx")}
            >
              Excel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-paper-500">
            Both formats are built from the same figures, so the workbook and the deck cannot disagree. Excel gives a
            tab per section with the numbers as numbers; PowerPoint gives the slides with native, editable charts.
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">Sections</p>
              <div className="flex gap-2 text-[11px]">
                <button
                  onClick={() => setSections(REPORT_SECTIONS.map((s) => s.id))}
                  className="text-manifest-600 hover:underline"
                >
                  All
                </button>
                <button onClick={() => setSections([])} className="text-paper-400 hover:underline">
                  None
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {REPORT_SECTIONS.map((s) => {
                const on = sections.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={clsx(
                      "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors",
                      on ? "border-manifest-400 bg-manifest-50/50" : "border-paper-200 hover:border-paper-300"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setSections((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                      }
                      className="mt-0.5 h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium text-paper-800">{s.label}</span>
                      <span className="block text-[11px] leading-snug text-paper-500">{s.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-paper-200 p-2.5">
            <input
              type="checkbox"
              checked={includeCharts}
              onChange={(e) => setIncludeCharts(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
            />
            <span>
              <span className="block text-[12.5px] font-medium text-paper-800">Include charts in the deck</span>
              <span className="block text-[11px] leading-snug text-paper-500">
                Native PowerPoint charts, editable and restyleable. Turn off for a tables-only handout.
              </span>
            </span>
          </label>

          <p className="rounded-lg bg-paper-50 px-3 py-2 text-[11px] leading-snug text-paper-500">
            The deck's charts carry their own cached values, so they render and print normally. PowerPoint's "Edit
            Data" button will not open a spreadsheet behind them. The same figures are in the Excel export.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!soaCustomer}
        onClose={() => setSoaCustomer(null)}
        title="Statement of Account"
        subtitle={soaRow?.customer}
        footer={
          <Button
            variant="primary"
            size="sm"
            disabled={!soaRow}
            onClick={() => {
              if (!soaRow) return;
              downloadWorkbook(
                `statement-${soaRow.customer.replace(/\W+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}`,
                [
                  {
                    name: "Statement",
                    notes: [`Statement of account for ${soaRow.customer}, as at ${new Date().toISOString().slice(0, 10)}`],
                    columns: [
                      { header: "Bucket", value: (r: { bucket: string; amount: number }) => r.bucket, width: 24 },
                      { header: "Amount", value: (r: { bucket: string; amount: number }) => r.amount, format: "money" },
                    ],
                    rows: [
                      { bucket: "0–30 days", amount: soaRow.d0_30 },
                      { bucket: "31–60 days", amount: soaRow.d31_60 },
                      { bucket: "61–90 days", amount: soaRow.d61_90 },
                      { bucket: "90+ days", amount: soaRow.d90_plus },
                    ],
                    totals: ["TOTAL OUTSTANDING", soaRow.total],
                  },
                ],
                { title: `Statement of Account for ${soaRow.customer}`, creator: currentUser }
              );
              pushToast({ tone: "success", title: "Statement downloaded", description: soaRow.customer });
              setSoaCustomer(null);
            }}
          >
            Download statement
          </Button>
        }
      >
        {soaRow && (
          <div className="space-y-2 text-sm">
            <p className="text-xs text-paper-500">{soaRow.customer}</p>
            <div className="space-y-1">
              {[
                ["0–30 days", soaRow.d0_30],
                ["31–60 days", soaRow.d31_60],
                ["61–90 days", soaRow.d61_90],
                ["90+ days", soaRow.d90_plus],
              ].map(([label, amount]) => (
                <div key={String(label)} className="flex items-center justify-between rounded-lg bg-paper-50 px-3 py-1.5 text-xs">
                  <span className="text-paper-600">{label}</span>
                  <span className="font-mono font-semibold text-paper-800">{formatMoney(Number(amount))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-alert-200 bg-alert-50 px-3 py-1.5 text-xs">
                <span className="font-semibold text-alert-800">Total outstanding</span>
                <span className="font-mono font-bold text-alert-700">{formatMoney(soaRow.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
