import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { formatMoney, formatDateTime, piRef } from "@/lib/format";
import { ORDER_STAGES } from "@/lib/types";
import { dashboardScope } from "@/lib/dashboardScope";
import {
  activeCustomers,
  availablePeriods,
  convertedOrders,
  conversionByCustomer,
  headlineMetrics,
  issuedQuotations,
  makePeriod,
  monthOnMonth,
  monthlyOrderValue,
  periodOf,
  shipmentCycleDays,
  type Granularity,
} from "@/lib/analytics";
import {
  TrendingUp,
  ShieldAlert,
  Ship,
  Landmark,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  BarChart3,
} from "lucide-react";
import clsx from "clsx";

/**
 * The dashboard.
 *
 * Two ideas hold it together. The first is that the widgets across the top are about NOW: orders
 * open, PIs waiting on an answer, containers due. They are not touched by the period filter,
 * because an order stuck since May does not stop being stuck when you look at July. The second is
 * that everything below the filter is about a PERIOD, and answers "how did that month go".
 *
 * What each person sees is decided by `dashboardScope`, not by seniority. A packer gets the same
 * screen with the money taken out and volume put in its place. See the note in that module for
 * why the dashboard breaks the everyone-sees-everything rule the rest of the app follows.
 */

const stageColors: Record<string, string> = {
  quotation: "#9ba39a",
  customer_confirmation: "#2c72c2",
  internal_verification: "#5b6bb5",
  deposit: "#d38f1a",
  production: "#226b44",
  packing: "#3e8e7e",
  inspection: "#1a5636",
  shipment: "#1e5fa8",
  final_payment: "#d38f1a",
  documents: "#8c4a9e",
  completed: "#9ba39a",
};

export function Dashboard() {
  const { salesOrders, quotations, payments, customers, shipments, activity, role } = useStore();
  const scope = dashboardScope(role);

  const [granularity, setGranularity] = useState<Granularity>("month");
  const periods = useMemo(
    () => availablePeriods(granularity, quotations, salesOrders),
    [granularity, quotations, salesOrders]
  );
  /**
   * Which period is open.
   *
   * Held as a key rather than an index so switching monthly/yearly keeps you in the same span
   * instead of jumping to whatever happens to sit at that position in the other list.
   */
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const period = useMemo(() => {
    const wanted = periodKey && periods.some((p) => p.key === periodKey) ? periodKey : periods[0]?.key;
    return makePeriod(wanted ?? periodOf(new Date().toISOString(), granularity));
  }, [periodKey, periods, granularity]);

  const headline = useMemo(
    () => headlineMetrics(salesOrders, quotations, payments),
    [salesOrders, quotations, payments]
  );

  const issued = useMemo(() => issuedQuotations(quotations, period), [quotations, period]);
  const converted = useMemo(
    () => convertedOrders(salesOrders, quotations, period),
    [salesOrders, quotations, period]
  );
  const cycle = useMemo(() => shipmentCycleDays(salesOrders, shipments, period), [salesOrders, shipments, period]);
  const customerCount = useMemo(() => activeCustomers(quotations, salesOrders, period), [quotations, salesOrders, period]);
  const conversionPct = issued.value > 0 ? (converted.value / issued.value) * 100 : 0;

  /** Two years side by side, which is how the monthly pack reads the trend. */
  const trendYears = useMemo(() => {
    const year = Number(period.key.slice(0, 4));
    return [String(year - 1), String(year)];
  }, [period]);
  const trend = useMemo(() => monthlyOrderValue(salesOrders, trendYears), [salesOrders, trendYears]);
  const comparisons = useMemo(() => monthOnMonth(salesOrders, period), [salesOrders, period]);

  const topCustomers = useMemo(
    () => conversionByCustomer(quotations, salesOrders, customers, period).filter((r) => r.orderValue > 0).slice(0, 6),
    [quotations, salesOrders, customers, period]
  );

  /**
   * Volume by month, in pieces and kilos.
   *
   * The operational tier's replacement for the value trend. It asks the same question, whether
   * this month is busier than the last, in the unit a plant actually plans in.
   */
  const volumeTrend = useMemo(() => {
    const year = period.key.slice(0, 4);
    return trend.map((point) => {
      const monthKey = `${year}-${String(point.monthNo).padStart(2, "0")}`;
      const mine = salesOrders.filter((o) => o.orderDate?.slice(0, 7) === monthKey);
      const weight = mine.reduce((s, o) => {
        const q = o.quotationId ? quotations.find((x) => x.id === o.quotationId) : undefined;
        return s + (q?.items.reduce((n, li) => n + li.weightKg, 0) ?? 0);
      }, 0);
      return { month: point.month, orders: mine.length, weightKg: Math.round(weight) };
    });
  }, [trend, salesOrders, quotations, period]);

  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    salesOrders.forEach((o) => {
      counts[o.currentStage] = (counts[o.currentStage] ?? 0) + 1;
    });
    return ORDER_STAGES.filter((s) => counts[s.id]).map((s) => ({ name: s.label, value: counts[s.id], key: s.id }));
  }, [salesOrders]);

  const criticalAlerts = useMemo(() => {
    const alerts: { text: string; orderId: string }[] = [];
    salesOrders.forEach((o) => {
      const blocked = o.stages.find((s) => s.status === "blocked");
      if (blocked) alerts.push({ text: `${o.id}: ${blocked.blocker}`, orderId: o.id });
    });
    // Overdue money is only an alert for people who can act on money. On the plant's screen it is
    // an item they can neither chase nor clear.
    if (scope.showAmounts) {
      payments
        .filter((p) => p.status === "overdue")
        .forEach((p) => alerts.push({ text: `${p.salesOrderId}: remaining balance overdue`, orderId: p.salesOrderId }));
    }
    return alerts.slice(0, 6);
  }, [salesOrders, payments, scope.showAmounts]);

  const upcomingShipments = salesOrders
    .filter((o) => o.currentStage === "packing" || o.currentStage === "inspection" || o.currentStage === "shipment")
    .slice(0, 6);

  const refFor = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const q = order?.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    return q ? piRef(q.id, q.revisionNo) : salesOrderId;
  };

  const title =
    scope.tier === "executive" ? "Executive Dashboard" : scope.tier === "commercial" ? "Sales Dashboard" : "Operations Dashboard";

  return (
    <div>
      <PageHeader
        eyebrow="Export Sales · Overview"
        title={title}
        description={scope.description}
        actions={
          scope.showAmounts ? (
            <Link to="/reports">
              <Button variant="secondary" size="sm" icon={<BarChart3 className="h-3.5 w-3.5" />}>
                Reports &amp; exports
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Live state, not period state. These four are the same whichever month is open, because a
          container that is late is late today. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Active sales orders"
          value={String(headline.activeSalesOrders)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="PI pending confirmation"
          value={String(headline.piPendingConfirmation)}
          tone="amber"
          icon={<ShieldAlert className="h-4 w-4" />}
          sublabel="Sent or under negotiation"
        />
        <StatCard
          label="Near / ready shipment"
          value={String(headline.nearOrReadyShipment)}
          tone="manifest"
          icon={<Ship className="h-4 w-4" />}
          sublabel="Packing, inspection or shipment"
        />
        <StatCard
          label="Past due shipment"
          value={String(headline.pastDueShipment)}
          tone={headline.pastDueShipment > 0 ? "alert" : "pine"}
          icon={<AlertTriangle className="h-4 w-4" />}
          sublabel="Past the requested date, not yet away"
        />
      </div>

      {scope.showCompanyTotals && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatCard
            label="Total active SO value"
            value={formatMoney(headline.totalActiveOrderValue)}
            sublabel="Across every order not yet completed"
          />
          <StatCard
            label="Payment collection rate"
            value={`${headline.collectionRatePct.toFixed(1)}%`}
            sublabel="Received against expected on live orders"
            tone={headline.collectionRatePct > 70 ? "pine" : "amber"}
          />
        </div>
      )}
      {!scope.showCompanyTotals && scope.showCollections && (
        <div className="mt-4">
          <StatCard
            label="Payment collection rate"
            value={`${headline.collectionRatePct.toFixed(1)}%`}
            sublabel="Received against expected on live orders"
            tone={headline.collectionRatePct > 70 ? "pine" : "amber"}
          />
        </div>
      )}

      {/* Everything below here answers "how did that period go", so the control that decides which
          period sits directly above it rather than in the page header. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-paper-200 bg-white px-3 py-2.5">
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
                "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
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
        <span className="ml-auto text-[11px] text-paper-400">
          Figures below cover {period.label}. The widgets above are live.
        </span>
      </div>

      {/* The funnel, in the shape the monthly pack states it: issued against converted, by value
          and by weight, with the rate between them. */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`PI issued · ${period.label}`}
          value={String(issued.count)}
          sublabel={
            scope.showAmounts
              ? `${formatMoney(issued.value)} · ${issued.weightKg.toFixed(0)} KG`
              : `${issued.weightKg.toFixed(0)} KG quoted`
          }
        />
        <StatCard
          label={`SO converted · ${period.label}`}
          value={String(converted.count)}
          tone="pine"
          sublabel={
            scope.showAmounts
              ? `${formatMoney(converted.value)} · ${converted.weightKg.toFixed(0)} KG`
              : `${converted.weightKg.toFixed(0)} KG confirmed`
          }
        />
        {scope.showConversion ? (
          <StatCard
            label="Conversion rate"
            value={`${conversionPct.toFixed(1)}%`}
            tone={conversionPct >= 50 ? "pine" : "amber"}
            sublabel="Order value against quoted value"
          />
        ) : (
          <StatCard label="Active customers" value={String(customerCount)} sublabel="Quoted or ordered this period" />
        )}
        <StatCard
          label="Shipment cycle"
          value={cycle.shipped ? `${cycle.averageDays} days` : "-"}
          sublabel={
            cycle.shipped
              ? `Order to departure, ${cycle.shipped} shipment${cycle.shipped === 1 ? "" : "s"}`
              : "No departures in this period"
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {scope.showValueTrend ? (
            <>
              <CardHeader
                title="Confirmed Sales Order Value"
                subtitle={`${trendYears[0]} against ${trendYears[1]}, by month`}
                eyebrow="Trend"
              />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend} margin={{ left: -12, right: 8, top: 8 }}>
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
                  <Bar dataKey={`values.${trendYears[0]}`} name={trendYears[0]} fill="#9ba39a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={`values.${trendYears[1]}`} name={trendYears[1]} fill="#1a5636" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 grid grid-cols-1 gap-1.5 border-t border-paper-100 pt-2 sm:grid-cols-3">
                {comparisons.map((c) => (
                  <div key={c.label} className="rounded-lg bg-paper-50 px-2.5 py-1.5">
                    <p className="text-[10.5px] leading-tight text-paper-500">{c.label}</p>
                    <p
                      className={clsx(
                        "font-mono text-[12.5px] font-bold",
                        c.percent === null || Math.abs(c.percent) < 0.05
                          ? "text-paper-600"
                          : c.percent > 0
                            ? "text-pine-700"
                            : "text-alert-600"
                      )}
                    >
                      {c.difference >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(c.difference))}{" "}
                      <span className="text-[11px] font-semibold">
                        {/* No base to change from is not a change of zero. Saying "(+0.0%)" beside
                            a gain of twenty thousand is the kind of figure that gets repeated. */}
                        {c.percent === null ? "(no prior period)" : `(${c.percent >= 0 ? "+" : ""}${c.percent.toFixed(1)}%)`}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <CardHeader
                title="Confirmed Order Volume"
                subtitle={`Orders and quoted weight by month, ${period.key.slice(0, 4)}`}
                eyebrow="Trend"
              />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={volumeTrend} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0ec" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6e766c" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ba39a" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}t`}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      name === "weightKg" ? `${Number(v).toLocaleString()} KG` : String(v),
                      name === "weightKg" ? "Weight" : "Orders",
                    ]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #dfe3dd", fontSize: 12 }}
                  />
                  <Bar dataKey="weightKg" name="weightKg" fill="#1a5636" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Orders by Current Stage" eyebrow="Pipeline" />
          <div className="flex items-center gap-3">
            <ResponsiveContainer width="45%" height={190}>
              <PieChart>
                <Pie data={stageDistribution} dataKey="value" nameKey="name" innerRadius={40} outerRadius={66} paddingAngle={2}>
                  {stageDistribution.map((d) => (
                    <Cell key={d.key} fill={stageColors[d.key] ?? "#9ba39a"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #dfe3dd", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1">
              {stageDistribution.map((d) => (
                <div key={d.key} className="flex items-center justify-between text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-paper-600">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stageColors[d.key] }} />
                    {d.name}
                  </span>
                  <span className="font-mono font-semibold text-paper-800">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {scope.showConversion && topCustomers.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Quoted against won"
            eyebrow={`Per customer · ${period.label}`}
            subtitle="Conversion over 100% means a PI issued in an earlier month landed in this one."
            action={
              <Link to="/reports" className="text-xs font-medium text-manifest-600 hover:underline">
                Full breakdown →
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-paper-100 text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                  <th className="px-2 py-1.5">Customer</th>
                  <th className="w-32 px-2 py-1.5 text-right">Quotations</th>
                  <th className="w-32 px-2 py-1.5 text-right">Sales orders</th>
                  <th className="w-24 px-2 py-1.5 text-right">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((r) => (
                  <tr key={r.customerId} className="border-b border-paper-100 last:border-0">
                    <td className="px-2 py-1.5 font-medium text-paper-800">{r.customer}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-paper-500">{formatMoney(r.quotationValue)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-pine-800">
                      {formatMoney(r.orderValue)}
                    </td>
                    <td
                      className={clsx(
                        "px-2 py-1.5 text-right font-mono font-semibold",
                        r.conversionPct >= 100 ? "text-pine-700" : r.conversionPct >= 40 ? "text-paper-700" : "text-amber-700"
                      )}
                    >
                      {r.quotationValue > 0 ? `${r.conversionPct.toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Critical Alerts" eyebrow="Needs attention" />
          {criticalAlerts.length === 0 ? (
            <p className="text-sm text-paper-400">Nothing blocked right now.</p>
          ) : (
            <div className="space-y-2">
              {criticalAlerts.map((a, i) => (
                <Link
                  key={i}
                  to={`/orders/${a.orderId}`}
                  className="flex items-start gap-2 rounded-lg border border-alert-100 bg-alert-50 px-3 py-2 text-xs text-alert-800 hover:border-alert-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{a.text}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming Shipments" eyebrow="Logistics" />
          <div className="space-y-2">
            {upcomingShipments.map((o) => {
              const customer = customers.find((c) => c.id === o.customerId);
              return (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-50"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-semibold text-paper-800">{refFor(o.id)}</p>
                    <p className="truncate text-xs text-paper-400">{customer?.name}</p>
                  </div>
                  <Badge status={o.currentStage} />
                </Link>
              );
            })}
            {upcomingShipments.length === 0 && <p className="text-sm text-paper-400">No shipments currently staged.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Activity" eyebrow="Live feed" />
          <div className="space-y-3">
            {activity.slice(0, 7).map((a) => (
              <div key={a.id} className="flex gap-2.5 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pine-500" />
                <div className="min-w-0">
                  <p className="text-paper-700">
                    <span className="font-semibold text-paper-900">{a.user}</span> {a.action.toLowerCase()}
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-paper-400">
                    {a.recordId} · {formatDateTime(a.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!scope.showAmounts && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 text-[11.5px] leading-snug text-paper-500">
          <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Order values and collection figures are on the management view of this dashboard. Everything you need to
            move a container is here: weights, counts, dates and whatever is blocking one.
          </span>
        </p>
      )}
    </div>
  );
}
