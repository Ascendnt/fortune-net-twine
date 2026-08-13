import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/mockData";
import type { PricingRule, PricingRuleBasis } from "@/lib/types";
import { toNonNegative } from "@/lib/num";

const BASIS_LABEL: Record<PricingRuleBasis, string> = {
  percent_of_base: "% of base",
  percent_of_result: "% of running result",
  flat_amount: "Flat amount",
  lookup_table: "Lookup table",
};

const EMPTY_RULE: PricingRule = {
  id: "",
  code: "PERCENTAGE",
  label: "",
  operation: "add",
  basis: "percent_of_base",
  rate: 0,
  sequence: 1,
  enabled: true,
};

export function SettingsPage() {
  const {
    pricingRules,
    lookupTables,
    updatePricingRule,
    updateLookupRow,
    addPricingRule,
    removePricingRule,
    addLookupRowToTable,
    removeLookupRowFromTable,
    resetDemoData,
    pushToast,
  } = useStore();
  const sortedRules = [...pricingRules].sort((a, b) => a.sequence - b.sequence);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newRule, setNewRule] = useState<PricingRule | null>(null);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<PricingRule | null>(null);
  const [newRow, setNewRow] = useState<{ tableId: string; key: string; value: string } | null>(null);

  function saveNewRule() {
    if (!newRule) return;
    if (!newRule.label.trim()) {
      pushToast({ tone: "warning", title: "Give the rule a label" });
      return;
    }
    addPricingRule({
      ...newRule,
      id: `r_${newRule.label.trim().toLowerCase().replace(/\W+/g, "_")}_${Date.now().toString(36)}`,
      label: newRule.label.trim(),
    });
    pushToast({ tone: "success", title: "Pricing rule added", description: newRule.label.trim() });
    setNewRule(null);
  }

  function saveNewLookupRow() {
    if (!newRow) return;
    const value = Number(newRow.value);
    if (!newRow.key.trim() || !Number.isFinite(value)) {
      pushToast({ tone: "warning", title: "A key and a numeric value are required" });
      return;
    }
    addLookupRowToTable(newRow.tableId, newRow.key.trim(), value);
    setNewRow(null);
  }

  function handleReset() {
    resetDemoData();
    setConfirmReset(false);
    pushToast({ tone: "info", title: "Data reset", description: "Saved changes cleared and starting values restored." });
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "System"]}
        eyebrow="Configuration"
        title="Settings"
        description="Company profile, roles, and the pricing rules and rate tables behind quotations."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Company Profile"
            eyebrow="Static"
            subtitle="The export client master shows PIs/CIs actually issue under one of two entities, chosen per customer, not a single fixed name."
          />
          <KeyValue label="Issuing entity A" value="Fortune Net & Twine Manufacturing Corp." />
          <KeyValue label="Issuing entity B" value="Nettex Mfg. and Export Corp." />
          <KeyValue label="Plant" value="70 D. Bonifacio St., Bo. Canumay, Valenzuela" />
          <KeyValue label="Office" value="42 Sto. Domingo St., Quezon City" />
          <KeyValue label="Default Incoterm" value="FOB Manila" />
          <KeyValue label="Base currency" value="USD" />
        </Card>

        <Card>
          <CardHeader title="Roles" eyebrow="Access" />
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
            subtitle="Each rule declares its own basis (of-base vs. of-result) instead of leaving it implied by the label. Retune rates, add rules or retire them here without a code change."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setNewRule({ ...EMPTY_RULE, sequence: sortedRules.length + 1 })}
              >
                Add Rule
              </Button>
            }
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
              <TH> </TH>
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
                        {lookupTables.find((t) => t.id === r.lookupTableId)?.name ?? "-"}
                        <span className="ml-1 text-[10px] uppercase text-paper-400">
                          ({lookupTables.find((t) => t.id === r.lookupTableId)?.valueKind === "percent" ? "%" : "USD"})
                        </span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.rate}
                          onChange={(e) => updatePricingRule(r.id, { rate: toNonNegative(e.target.value) })}
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
                  <TD>
                    <button
                      onClick={() => setConfirmDeleteRule(r)}
                      className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                      aria-label={`Delete ${r.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-[11px] text-paper-400">
            Enabled means a rule is <em>available</em> to apply. Nothing is applied to a quotation line until it's ticked
            in the Specification Pricing modal.
          </p>
        </Card>
      </div>

      <Modal
        open={newRule !== null}
        onClose={() => setNewRule(null)}
        title="Add pricing rule"
        subtitle="Rules run in sequence order, each feeding the next."
        width="max-w-xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setNewRule(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveNewRule}>
              Add rule
            </Button>
          </>
        }
      >
        {newRule && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-paper-600">Label</label>
              <input
                value={newRule.label}
                onChange={(e) => setNewRule({ ...newRule, label: e.target.value })}
                placeholder="e.g. Agent commission"
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-paper-600">Code</label>
              <select
                value={newRule.code}
                onChange={(e) => setNewRule({ ...newRule, code: e.target.value })}
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
              >
                {["COMMISSION", "PERCENTAGE", "AMOUNT", "MD_COMPUTATION", "DW_COMPUTATION", "INSURANCE"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-paper-600">Operation</label>
              <select
                value={newRule.operation}
                onChange={(e) => setNewRule({ ...newRule, operation: e.target.value as PricingRule["operation"] })}
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
              >
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-paper-600">Basis</label>
              <select
                value={newRule.basis}
                onChange={(e) => setNewRule({ ...newRule, basis: e.target.value as PricingRuleBasis })}
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
              >
                <option value="percent_of_base">% of base, a simple markup of P × (1 + r)</option>
                <option value="percent_of_result">% of running result, margin-inclusive, P ÷ (1 − r)</option>
                <option value="flat_amount">Flat amount, P ± a</option>
                <option value="lookup_table">Lookup table, the value comes from a rate table</option>
              </select>
            </div>
            {newRule.basis === "lookup_table" ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-paper-600">Lookup table</label>
                <select
                  value={newRule.lookupTableId ?? lookupTables[0]?.id}
                  onChange={(e) => setNewRule({ ...newRule, lookupTableId: e.target.value })}
                  className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
                >
                  {lookupTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.valueKind === "percent" ? "%" : "USD"})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-paper-600">
                  Rate {newRule.basis === "flat_amount" ? "(USD)" : "(%)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newRule.rate}
                  onChange={(e) => setNewRule({ ...newRule, rate: Number(e.target.value) })}
                  className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-paper-600">Sequence</label>
              <input
                type="number"
                value={newRule.sequence}
                onChange={(e) => setNewRule({ ...newRule, sequence: Number(e.target.value) })}
                className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDeleteRule !== null}
        onClose={() => setConfirmDeleteRule(null)}
        title={`Delete "${confirmDeleteRule?.label}"?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteRule(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirmDeleteRule) {
                  removePricingRule(confirmDeleteRule.id);
                  pushToast({ tone: "info", title: "Pricing rule deleted", description: confirmDeleteRule.label });
                }
                setConfirmDeleteRule(null);
              }}
            >
              Delete rule
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Quotation lines that already applied this rule keep their saved price; the rule simply stops being offered.
          If you only want to retire it, untick <strong>Enabled</strong> instead.
        </p>
      </Modal>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {lookupTables.map((t) => (
          <Card key={t.id}>
            <CardHeader
              title={t.name}
              eyebrow="Lookup table"
              subtitle={
                t.valueKind === "percent"
                  ? "Values are percentages of the running price per kg, so 0.66 means 0.66%."
                  : "Values are currency amounts added to the running price per kg."
              }
            />
            <div className="space-y-1.5">
              {t.rows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg bg-paper-50 px-2.5 py-1.5">
                  <span className="font-mono text-xs text-paper-600">{row.key}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.001"
                      value={row.value}
                      onChange={(e) => updateLookupRow(t.id, row.key, Number(e.target.value))}
                      className="w-20 rounded-md border border-paper-200 bg-white px-2 py-1 text-right text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                    />
                    <span className="w-7 text-[11px] text-paper-400">{t.valueKind === "percent" ? "%" : "USD"}</span>
                    <button
                      onClick={() => removeLookupRowFromTable(t.id, row.key)}
                      disabled={row.key === "default"}
                      title={row.key === "default" ? "The fallback row can't be removed" : `Remove ${row.key}`}
                      className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-paper-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {newRow?.tableId === t.id ? (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-manifest-200 bg-manifest-50/60 px-2 py-1.5">
                <input
                  value={newRow.key}
                  onChange={(e) => setNewRow({ ...newRow, key: e.target.value })}
                  placeholder="Key"
                  className="w-20 rounded-md border border-paper-200 bg-white px-2 py-1 text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.001"
                  value={newRow.value}
                  onChange={(e) => setNewRow({ ...newRow, value: e.target.value })}
                  placeholder="Value"
                  className="w-20 rounded-md border border-paper-200 bg-white px-2 py-1 text-right text-xs font-mono"
                />
                <Button variant="primary" size="sm" onClick={saveNewLookupRow}>
                  Add
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setNewRow(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setNewRow({ tableId: t.id, key: "", value: "" })}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-paper-300 py-1.5 text-[11px] font-medium text-paper-500 hover:border-manifest-400 hover:text-manifest-700"
              >
                <Plus className="h-3 w-3" /> Add row
              </button>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader
            title="Reset Data"
            eyebrow="Maintenance"
            subtitle="Restores quotations, pricing rules, rate tables, the specification master and the lacing catalog to their starting values."
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => setConfirmReset(true)}
              >
                Reset Data
              </Button>
            }
          />
          <p className="text-xs text-paper-500">
            Resetting discards changes made on this machine and restores the starting values.
          </p>
        </Card>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset data?"
        subtitle="Every quotation drafted on this machine will be discarded."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleReset}>
              Reset everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Quotations, pricing rule changes, lookup values, added specifications and customer contact edits will all
          return to their seeded state.
        </p>
      </Modal>

      <div className="mt-5">
        <ProcessDiscoveryNote
          items={[
            "Single sign-on and per-role permission enforcement are pending IT sign-off. The role switcher currently changes what is visible, not what is permitted.",
            "Pricing rules and lookup tables are fully editable here, including adding and retiring whole rules and lookup rows, pending the factory confirming which adjustment types are actually in play.",
            "MD and DW lookup values are interpolated from the two figures the simulation observed live (122MD -> 0.1750, 50FL -> 0.5000); the factory's real rate card should replace them.",
            "Deposit %, approval thresholds, and discount limits are still per-quotation fields; centralizing their defaults here is pending discovery.",
            "Customers now include the real export client master (~50 accounts) with a per-customer \"letterhead\" field driving which entity issues the PI/CI. This two-entity split needs confirming with the business rather than resting on the assumption baked in here.",
            "Shipment and Validity are still free-text/numeric fields; the client master's standard phrasing (SHIPMENT_TERM_OPTIONS / VALIDITY_TERM_OPTIONS in mockData.ts) isn't wired into the quotation form yet.",
          ]}
        />
      </div>
    </div>
  );
}
