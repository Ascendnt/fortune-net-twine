import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { ORDER_STAGES } from "@/lib/types";
import {
  TrendingUp,
  ShieldAlert,
  Factory,
  Ship,
  Landmark,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";

const monthlyValue = [
  { month: "Feb", value: 168000 },
  { month: "Mar", value: 204500 },
  { month: "Apr", value: 178200 },
  { month: "May", value: 231900 },
  { month: "Jun", value: 259400 },
  { month: "Jul", value: 214600 },
];

const stageColors: Record<string, string> = {
  quotation: "#9ba39a",
  customer_confirmation: "#2c72c2",
  internal_verification: "#2c72c2",
  deposit: "#d38f1a",
  production: "#226b44",
  packing: "#226b44",
  inspection: "#226b44",
  shipment: "#1e5fa8",
  final_payment: "#d38f1a",
  documents: "#1e5fa8",
  completed: "#1a5636",
};

export function Dashboard() {
  const { salesOrders, quotations, payments, approvals, customers: CUSTOMERS } = useStore();

  const stats = useMemo(() => {
    const active = salesOrders.filter((o) => o.currentStage !== "completed");
    const awaitingApproval = quotations.filter((q) => q.status === "for_approval").length + approvals.filter((a) => a.status === "pending").length;
    const inProduction = salesOrders.filter((o) => o.productionStatus === "in_production" || o.productionStatus === "materials_pending").length;
    const readyForShipment = salesOrders.filter((o) => o.currentStage === "shipment" || o.currentStage === "packing").length;
    const blockedByPayment = salesOrders.filter((o) => o.stages.some((s) => s.status === "blocked" && s.blocker?.toLowerCase().includes("balance"))).length;
    const delayed = salesOrders.filter((o) => o.delayReason).length;
    const totalValue = salesOrders.reduce((s, o) => s + o.orderValue, 0);
    const expectedThisMonth = salesOrders.filter((o) => o.currentStage === "shipment").length;
    const totalExpected = payments.reduce((s, p) => s + p.expectedAmount, 0);
    const totalReceived = payments.reduce((s, p) => s + p.amountReceived, 0);
    return {
      active: active.length,
      awaitingApproval,
      inProduction,
      readyForShipment,
      blockedByPayment,
      delayed,
      totalValue,
      expectedThisMonth,
      collectionRate: totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0,
    };
  }, [salesOrders, quotations, approvals, payments]);

  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    salesOrders.forEach((o) => {
      counts[o.currentStage] = (counts[o.currentStage] ?? 0) + 1;
    });
    return ORDER_STAGES.filter((s) => counts[s.id]).map((s) => ({
      name: s.label,
      value: counts[s.id],
      key: s.id,
    }));
  }, [salesOrders]);

  const criticalAlerts = useMemo(() => {
    const alerts: { text: string; orderId: string; tone: "alert" | "amber" }[] = [];
    salesOrders.forEach((o) => {
      const blocked = o.stages.find((s) => s.status === "blocked");
      if (blocked) alerts.push({ text: `${o.id}: ${blocked.blocker}`, orderId: o.id, tone: "alert" });
    });
    payments.filter((p) => p.status === "overdue").forEach((p) => {
      alerts.push({ text: `${p.salesOrderId}: remaining balance overdue`, orderId: p.salesOrderId, tone: "alert" });
    });
    return alerts.slice(0, 5);
  }, [salesOrders, payments]);

  const recentActivity = useStore().activity.slice(0, 6);

  const upcomingShipments = salesOrders
    .filter((o) => o.currentStage === "shipment" || o.currentStage === "packing")
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        eyebrow="Export Sales · Overview"
        title="Executive Dashboard"
        description="Quotation-to-invoice pipeline across all active export orders."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Active orders" value={String(stats.active)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Awaiting approval" value={String(stats.awaitingApproval)} tone="amber" icon={<ShieldAlert className="h-4 w-4" />} />
        <StatCard label="In production" value={String(stats.inProduction)} tone="pine" icon={<Factory className="h-4 w-4" />} />
        <StatCard label="Ready / near shipment" value={String(stats.readyForShipment)} tone="manifest" icon={<Ship className="h-4 w-4" />} />
        <StatCard label="Blocked by payment" value={String(stats.blockedByPayment)} tone="alert" icon={<Landmark className="h-4 w-4" />} />
        <StatCard label="Delayed in production" value={String(stats.delayed)} tone="alert" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total active order value" value={formatMoney(stats.totalValue)} sublabel="Across all open sales orders" />
        <StatCard label="Expected shipments this cycle" value={String(stats.expectedThisMonth)} sublabel="Orders currently at Shipment stage" />
        <StatCard label="Payment collection rate" value={`${stats.collectionRate}%`} sublabel="Of total expected across active orders" tone={stats.collectionRate > 70 ? "pine" : "amber"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Monthly Order Value" subtitle="Confirmed sales orders by month, FOB Manila" eyebrow="Trend" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyValue} margin={{ left: -20, right: 10, top: 5 }}>
              <defs>
                <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e5fa8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#1e5fa8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0ec" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6e766c" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ba39a" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v / 1000}k`}
              />
              <Tooltip
                formatter={(v) => formatMoney(Number(v))}
                contentStyle={{ borderRadius: 10, border: "1px solid #dfe3dd", fontSize: 12, fontFamily: "IBM Plex Mono" }}
              />
              <Area type="monotone" dataKey="value" stroke="#1e5fa8" strokeWidth={2} fill="url(#valueFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader title="Orders by Current Stage" eyebrow="Pipeline" />
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={stageDistribution} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
                  {stageDistribution.map((d) => (
                    <Cell key={d.key} fill={stageColors[d.key] ?? "#9ba39a"} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {stageDistribution.map((d) => (
                <div key={d.key} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-paper-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: stageColors[d.key] }} />
                    {d.name}
                  </span>
                  <span className="font-mono font-semibold text-paper-800">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Critical Alerts" eyebrow="Needs attention" />
          {criticalAlerts.length === 0 ? (
            <p className="text-sm text-paper-400">No blocked orders right now.</p>
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
              const customer = CUSTOMERS.find((c) => c.id === o.customerId);
              return (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-paper-50"
                >
                  <div>
                    <p className="font-mono text-[12px] font-semibold text-paper-800">{o.id}</p>
                    <p className="text-xs text-paper-400">{customer?.name}</p>
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
            {recentActivity.map((a) => (
              <div key={a.id} className="flex gap-2.5 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pine-500" />
                <div>
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
    </div>
  );
}
