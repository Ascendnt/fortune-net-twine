import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/mockData";
import type { PricingRuleBasis } from "@/lib/types";

const BASIS_LABEL: Record<PricingRuleBasis, string> = {
  percent_of_base: "% of base",
  percent_of_result: "% of running result",
  flat_amount: "Flat amount",
  lookup_table: "Lookup table",
};

export function SettingsPage() {
  const { pricingRules, lookupTables, updatePricingRule, updateLookupRow } = useStore();
  const sortedRules = [...pricingRules].sort((a, b) => a.sequence - b.sequence);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "System"]}
        eyebrow="Configuration"
        title="Settings"
        description="Prototype-level configuration only — full role permissions and business rules ship with Phase 1."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Company Profile" eyebrow="Static" />
          <KeyValue label="Legal name" value="Fortune Net & Twine Manufacturing Corp." />
          <KeyValue label="Plant" value="70 D. Bonifacio St., Bo. Canumay, Valenzuela" />
          <KeyValue label="Office" value="42 Sto. Domingo St., Quezon City" />
          <KeyValue label="Default Incoterm" value="FOB Manila" />
          <KeyValue label="Base currency" value="USD" />
        </Card>

        <Card>
          <CardHeader title="Roles in this Prototype" eyebrow="Demonstration only" />
          <div className="space-y-2">
            {ROLES.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg bg-paper-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-paper-800">{r.label}</p>
                  <p className="text-xs text-paper-400">{r.description}</p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] text-paper-400 border border-paper-200">
                  {r.department}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="Pricing Rules"
            eyebrow="Quotation → Invoice engine"
            subtitle="Each rule declares its own basis (of-base vs. of-result) instead of leaving it implied by the label — retune rates or retire a rule here without a code change."
          />
          <Table>
            <THead>
              <TH>Seq</TH>
              <TH>Code</TH>
              <TH>Label</TH>
              <TH>Operation</TH>
              <TH>Basis</TH>
              <TH>Rate / Reference</TH>
              <TH>Enabled</TH>
            </THead>
            <tbody>
              {sortedRules.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.sequence}</TD>
                  <TD className="font-mono text-xs">{r.code}</TD>
                  <TD className="text-xs font-medium">{r.label}</TD>
                  <TD className="text-xs capitalize">{r.operation}</TD>
                  <TD className="text-xs">{BASIS_LABEL[r.basis]}</TD>
                  <TD>
                    {r.basis === "lookup_table" ? (
                      <span className="text-xs text-paper-500">
                        {lookupTables.find((t) => t.id === r.lookupTableId)?.name ?? "—"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={r.rate}
                          onChange={(e) => updatePricingRule(r.id, { rate: Number(e.target.value) })}
                          className="w-20 rounded-md border border-paper-200 px-2 py-1 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                        />
                        <span className="text-[11px] text-paper-400">{r.basis === "flat_amount" ? "USD" : "%"}</span>
                      </div>
                    )}
                  </TD>
                  <TD>
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => updatePricingRule(r.id, { enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-paper-300 accent-pine-700"
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {lookupTables.map((t) => (
          <Card key={t.id}>
            <CardHeader title={t.name} eyebrow="Lookup table" />
            <div className="space-y-1.5">
              {t.rows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg bg-paper-50 px-2.5 py-1.5">
                  <span className="font-mono text-xs text-paper-600">{row.key}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={row.value}
                    onChange={(e) => updateLookupRow(t.id, row.key, Number(e.target.value))}
                    className="w-20 rounded-md border border-paper-200 bg-white px-2 py-1 text-right text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <ProcessDiscoveryNote
          items={[
            "Real authentication, SSO, and per-role permission enforcement are not part of this prototype — the role switcher only changes what's visible for demonstration.",
            "Pricing rules and lookup tables are now editable data (rate, enabled, lookup values) — adding or removing whole rule/lookup rows is the next increment once the factory confirms which adjustment types are actually in play.",
            "Deposit %, approval thresholds, and discount limits are still per-quotation fields; centralizing their defaults here is pending discovery.",
          ]}
        />
      </div>
    </div>
  );
}
