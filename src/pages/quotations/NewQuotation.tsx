import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, ChevronLeft, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { SpecBuilderModal } from "@/components/domain/SpecBuilderModal";
import { useStore } from "@/lib/store";
import { ITEM_MASTER } from "@/lib/mockData";
import { formatMoney } from "@/lib/format";
import { computeLinePricing, lookupKeyForRule } from "@/lib/pricing";
import type { QuotationLineItem, Currency } from "@/lib/types";
import clsx from "clsx";

const CURRENCIES: Currency[] = ["USD", "KRW", "EUR"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-paper-600">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const miniInputClass =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

interface DraftLine {
  id: string;
  itemCode: string;
  qtyPcs: number;
  givenPriceKg: number;
  appliedRuleIds: string[];
  laborHours: number;
  laborRate: number;
  wastageKg: number;
  twineKg: number;
  twineRate: number;
  expanded: boolean;
  // Set when the line's specification was composed via the Build Specification flow (material,
  // net type, knots, selvages, stretching, reinforcement, others, color) instead of being taken
  // as-is from the catalog row's meshDepth/color — overrides the default spec text at save time.
  specificationOverride?: string;
}

function defaultsFor(itemCode: string, enabledRuleIds: string[]): Omit<DraftLine, "id" | "qtyPcs" | "expanded"> {
  const im = ITEM_MASTER.find((i) => i.code === itemCode) ?? ITEM_MASTER[0];
  return {
    itemCode: im.code,
    givenPriceKg: im.givenPriceKg,
    appliedRuleIds: enabledRuleIds,
    laborHours: im.defaultLaborHours,
    laborRate: im.defaultLaborRate,
    wastageKg: im.defaultWastageKg,
    twineKg: im.defaultTwineKg,
    twineRate: im.defaultTwineRate,
  };
}

export function NewQuotation() {
  const navigate = useNavigate();
  const { createQuotation, pushToast, currentUser, pricingRules, lookupTables, customers } = useStore();

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const customer = customers.find((c) => c.id === customerId);

  // Currency, payment terms, consignee, and Attn contact all pre-fill from the customer's master
  // data when a customer is picked (the "one-time setup" values) but stay fully editable per
  // quotation from here on — real accounts sometimes ship to a different consignee, quote in a
  // different currency, or negotiate terms that differ from what's on file.
  const [currency, setCurrency] = useState<Currency>(customer?.defaultCurrency ?? "USD");
  const [paymentTerms, setPaymentTerms] = useState(customer?.defaultPaymentTerms ?? "");
  const [consignee, setConsignee] = useState(customer?.consignee ?? "");
  const [attentionContact, setAttentionContact] = useState(customer?.contactPerson ?? "");
  const [depositPercent, setDepositPercent] = useState(30);
  const [leadTimeWeeks, setLeadTimeWeeks] = useState(6);
  const [validityDays, setValidityDays] = useState(7);
  const [freight, setFreight] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [specBuilderLineId, setSpecBuilderLineId] = useState<string | null>(null);

  const enabledRules = pricingRules.filter((r) => r.enabled).sort((a, b) => a.sequence - b.sequence);
  const contactOptions = customer?.contacts?.length
    ? customer.contacts
    : customer
      ? [{ id: "primary", name: customer.contactPerson, isPrimary: true }]
      : [];

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCurrency(c.defaultCurrency);
      setPaymentTerms(c.defaultPaymentTerms);
      setConsignee(c.consignee);
      setAttentionContact(c.contactPerson);
    }
  }

  function priceLine(line: DraftLine) {
    const item = ITEM_MASTER.find((i) => i.code === line.itemCode) ?? ITEM_MASTER[0];
    const result = computeLinePricing(
      {
        givenPriceKg: line.givenPriceKg,
        weightPerPc: item.unitWeightKg,
        qtyPcs: line.qtyPcs,
        appliedRuleIds: line.appliedRuleIds,
        laborHours: line.laborHours,
        laborRate: line.laborRate,
        wastageKg: line.wastageKg,
        twineKg: line.twineKg,
        twineRate: line.twineRate,
        lookupKeyForRule: lookupKeyForRule(item),
      },
      pricingRules,
      lookupTables
    );
    return { item, result };
  }

  function addItem() {
    const im = ITEM_MASTER[0];
    setLines((prev) => [
      ...prev,
      {
        id: `L${prev.length + 1}-${Date.now()}`,
        qtyPcs: 1,
        expanded: prev.length === 0,
        ...defaultsFor(im.code, enabledRules.map((r) => r.id)),
      },
    ]);
  }

  function patchLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function setItemCode(id: string, code: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...defaultsFor(code, l.appliedRuleIds) } : l))
    );
  }

  function toggleRule(id: string, ruleId: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const has = l.appliedRuleIds.includes(ruleId);
        return { ...l, appliedRuleIds: has ? l.appliedRuleIds.filter((x) => x !== ruleId) : [...l.appliedRuleIds, ruleId] };
      })
    );
  }

  function removeItem(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  const priced = lines.map((l) => ({ line: l, ...priceLine(l) }));
  const itemsTotal = priced.reduce((s, p) => s + p.result.totalPrice, 0);
  const total = itemsTotal + freight;

  function handleCreate() {
    if (!customer) {
      pushToast({ tone: "warning", title: "Select a customer" });
      return;
    }
    if (lines.length === 0) {
      pushToast({ tone: "warning", title: "Add at least one line item" });
      return;
    }
    const items: QuotationLineItem[] = priced.map(({ line, item, result }) => ({
      id: line.id,
      itemCode: item.code,
      description: item.description,
      specification: line.specificationOverride || `${item.meshDepth}, ${item.color}`,
      qtyPcs: line.qtyPcs,
      unit: item.uom,
      unitPrice: Math.round(result.unitPrice * 100) / 100,
      weightKg: Math.round(result.weightKg * 100) / 100,
      totalPrice: Math.round(result.totalPrice * 100) / 100,
      pricing: {
        givenPriceKg: line.givenPriceKg,
        appliedRuleIds: line.appliedRuleIds,
        laborHours: line.laborHours,
        laborRate: line.laborRate,
        wastageKg: line.wastageKg,
        twineKg: line.twineKg,
        twineRate: line.twineRate,
        chain: result.chain,
        newPriceKg: result.newPriceKg,
        pricePerPiece: result.pricePerPiece,
        laborCost: result.laborCost,
        wastageCost: result.wastageCost,
        twineCost: result.twineCost,
      },
    }));

    const id = createQuotation({
      customerId,
      consignee: consignee || customer.name,
      attentionContact,
      currency,
      validityDays,
      issueDate: new Date().toISOString().slice(0, 10),
      paymentTerms: paymentTerms || customer.defaultPaymentTerms,
      moq: "Subject to confirmation",
      leadTimeWeeks,
      estimatedShipmentDate: new Date(Date.now() + leadTimeWeeks * 7 * 86400000).toISOString().slice(0, 10),
      items,
      freight,
      discount: 0,
      tax: 0,
      depositPercent,
      assignedSalesperson: currentUser,
      remarks,
    });
    pushToast({ tone: "success", title: "Quotation drafted", description: `${id} saved as draft.` });
    navigate(`/quotations/${id}`);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Quotations", "New"]}
        eyebrow="Quotation Management"
        title="New Quotation"
        description="Draft a new Proforma Invoice. Fields marked as configurable are subject to process discovery."
        actions={
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => navigate("/quotations")}>
            Back
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Customer & Terms" eyebrow="Step 1" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Customer">
                  <SearchableSelect
                    value={customerId}
                    onChange={handleCustomerChange}
                    placeholder="Select a customer…"
                    options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: `— ${c.country}` }))}
                  />
                </Field>
              </div>
              <Field label="Consignee">
                <input value={consignee} onChange={(e) => setConsignee(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Attn (contact)">
                <select value={attentionContact} onChange={(e) => setAttentionContact(e.target.value)} className={inputClass}>
                  {contactOptions.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                      {c.title ? ` — ${c.title}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputClass}>
                  {CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment terms">
                <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Deposit required (%)">
                <input
                  type="number"
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Lead time (weeks)">
                <input
                  type="number"
                  value={leadTimeWeeks}
                  onChange={(e) => setLeadTimeWeeks(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Validity (days)">
                <input
                  type="number"
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Freight / additional charges (USD)">
                <input type="number" value={freight} onChange={(e) => setFreight(Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Line Items"
              eyebrow="Step 2 — Pricing Engine"
              subtitle="Given Price/kg runs through the enabled adjustment chain, then Labor + Wastage + Sewing Twine are added per piece."
              action={
                <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addItem}>
                  Add Item
                </Button>
              }
            />
            {lines.length === 0 ? (
              <p className="rounded-lg border border-dashed border-paper-300 py-8 text-center text-sm text-paper-400">
                No items yet — add a line item from the item master.
              </p>
            ) : (
              <div className="space-y-3">
                {priced.map(({ line, item, result }) => (
                  <div key={line.id} className="overflow-hidden rounded-lg border border-paper-200">
                    <div className="flex items-center justify-between gap-2 bg-paper-50/80 px-3 py-2">
                      <button
                        onClick={() => patchLine(line.id, { expanded: !line.expanded })}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        {line.expanded ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-paper-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-paper-400" />
                        )}
                        <span className="truncate font-mono text-xs font-semibold text-pine-800">{item.code}</span>
                        <span className="truncate text-xs text-paper-500">{item.description}</span>
                      </button>
                      <span className="shrink-0 font-mono text-xs font-semibold text-pine-800">
                        {formatMoney(result.totalPrice, currency)}
                      </span>
                      <button onClick={() => removeItem(line.id)} className="shrink-0 text-paper-400 hover:text-alert-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {line.expanded && (
                      <div className="space-y-3 border-t border-paper-100 p-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="sm:col-span-2">
                            <Field label="Specification">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={line.itemCode}
                                  onChange={(e) => setItemCode(line.id, e.target.value)}
                                  className="w-full rounded-md border border-paper-200 px-2 py-1.5 text-xs"
                                >
                                  {ITEM_MASTER.map((im) => (
                                    <option key={im.code} value={im.code}>
                                      {im.code}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  title="Build a custom specification"
                                  onClick={() => setSpecBuilderLineId(line.id)}
                                  className="flex shrink-0 items-center gap-1 rounded-md border border-paper-200 px-2 py-1.5 text-xs text-paper-500 hover:border-manifest-500 hover:text-manifest-700"
                                >
                                  <Wand2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </Field>
                            {line.specificationOverride ? (
                              <div className="mt-1.5 flex items-start justify-between gap-2 rounded-md bg-manifest-50 px-2 py-1.5">
                                <p className="text-[11px] leading-tight text-manifest-900">{line.specificationOverride}</p>
                                <button
                                  type="button"
                                  onClick={() => patchLine(line.id, { specificationOverride: undefined })}
                                  className="shrink-0 text-[10px] font-medium text-manifest-600 hover:text-manifest-900"
                                >
                                  Clear
                                </button>
                              </div>
                            ) : (
                              <p className="mt-1.5 text-[11px] text-paper-400">
                                Default: {item.meshDepth}, {item.color}
                              </p>
                            )}
                          </div>
                          <Field label="Qty (pcs)">
                            <input
                              type="number"
                              value={line.qtyPcs}
                              onChange={(e) => patchLine(line.id, { qtyPcs: Number(e.target.value) })}
                              className={miniInputClass}
                            />
                          </Field>
                          <Field label={`Given price / kg`}>
                            <input
                              type="number"
                              step="0.01"
                              value={line.givenPriceKg}
                              onChange={(e) => patchLine(line.id, { givenPriceKg: Number(e.target.value) })}
                              className={miniInputClass}
                            />
                          </Field>
                          <Field label="Weight/pc (kg)">
                            <div className="rounded-md border border-dashed border-paper-200 bg-paper-50 px-2 py-1.5 text-xs font-mono text-paper-500">
                              {item.unitWeightKg.toFixed(2)}
                            </div>
                          </Field>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-paper-600">
                            Applied pricing rules (chained in sequence order)
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {enabledRules.length === 0 && (
                              <span className="text-xs text-paper-400">No rules enabled — see Settings → Pricing Rules.</span>
                            )}
                            {enabledRules.map((r) => {
                              const active = line.appliedRuleIds.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  onClick={() => toggleRule(line.id, r.id)}
                                  className={clsx(
                                    "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                                    active
                                      ? "border-pine-700 bg-pine-700 text-white"
                                      : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
                                  )}
                                >
                                  {r.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Field label="Labor hours">
                            <input
                              type="number"
                              step="0.01"
                              value={line.laborHours}
                              onChange={(e) => patchLine(line.id, { laborHours: Number(e.target.value) })}
                              className={miniInputClass}
                            />
                          </Field>
                          <Field label="Labor rate / hr">
                            <input
                              type="number"
                              step="0.01"
                              value={line.laborRate}
                              onChange={(e) => patchLine(line.id, { laborRate: Number(e.target.value) })}
                              className={miniInputClass}
                            />
                          </Field>
                          <Field label="Wastage (kg)">
                            <input
                              type="number"
                              step="0.01"
                              value={line.wastageKg}
                              onChange={(e) => patchLine(line.id, { wastageKg: Number(e.target.value) })}
                              className={miniInputClass}
                            />
                          </Field>
                          <Field label="Sewing twine (kg)">
                            <input
                              type="number"
                              step="0.01"
                              value={line.twineKg}
                              onChange={(e) => patchLine(line.id, { twineKg: Number(e.target.value) })}
                              className={miniInputClass}
                            />
                          </Field>
                        </div>

                        <div className="grid grid-cols-3 gap-2 rounded-lg bg-paper-50 p-2.5 text-center sm:grid-cols-6">
                          <Stat label={`New price/kg`} value={result.newPriceKg.toFixed(2)} />
                          <Stat label="Price/piece" value={result.pricePerPiece.toFixed(2)} />
                          <Stat label="Labor" value={result.laborCost.toFixed(2)} />
                          <Stat label="Wastage" value={result.wastageCost.toFixed(2)} />
                          <Stat label="Twine" value={result.twineCost.toFixed(2)} />
                          <Stat label="U/P" value={result.unitPrice.toFixed(2)} tone="pine" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-4 border-t border-paper-100 pt-3 text-sm">
              <span>
                <span className="text-paper-500">Items:&nbsp;</span>
                <span className="font-mono font-semibold text-paper-700">{formatMoney(itemsTotal, currency)}</span>
              </span>
              <span>
                <span className="text-paper-500">Total (incl. freight):&nbsp;</span>
                <span className="font-mono font-bold text-pine-800">{formatMoney(total, currency)}</span>
              </span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Remarks" eyebrow="Step 3" />
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="FOB terms, packing notes, reference to customer inquiry…"
              className={inputClass}
            />
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate("/quotations")}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              Save as Draft
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {customer ? (
            <Card>
              <CardHeader title={customer.name} eyebrow="Customer Snapshot" />
              <p className="text-sm text-paper-600">{customer.address}</p>
              <p className="mt-2 text-xs text-paper-400">Default terms (editable above)</p>
              <p className="text-sm text-paper-700">{customer.defaultPaymentTerms}</p>
              <p className="mt-2 text-xs text-paper-400">Outstanding balance</p>
              <p className="font-mono text-sm font-semibold text-paper-800">
                {formatMoney(customer.outstandingBalanceUSD)}
              </p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-paper-400">Select a customer to see their snapshot.</p>
            </Card>
          )}
          <ProcessDiscoveryNote
            items={[
              "Which fields are mandatory before submission — is a technical assessment always required first?",
              "MOQ and lead-time defaults per item family are not yet finalized with the factory.",
              "Should freight be entered manually per quotation or pulled from a shipping-line rate table?",
              "Given Price/kg, labor, wastage, and twine defaults are catalog placeholders — factory costing to confirm actual figures per spec.",
              "Build Specification (wand icon) composes a spec string from the export description-flow option set, but still prices off the selected catalog row's Given Price/kg — a custom-built spec with its own base cost isn't modeled yet.",
            ]}
          />
        </div>
      </div>

      <SpecBuilderModal
        open={specBuilderLineId !== null}
        onClose={() => setSpecBuilderLineId(null)}
        initial={lines.find((l) => l.id === specBuilderLineId)?.specificationOverride}
        onApply={(spec) => {
          if (specBuilderLineId) patchLine(specBuilderLineId, { specificationOverride: spec });
          setSpecBuilderLineId(null);
        }}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pine" }) {
  return (
    <div>
      <p className="text-[9.5px] font-medium uppercase tracking-wide text-paper-400">{label}</p>
      <p className={clsx("font-mono text-[13px] font-semibold", tone === "pine" ? "text-pine-700" : "text-paper-800")}>{value}</p>
    </div>
  );
}
