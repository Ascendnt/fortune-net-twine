import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, FolderPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { BatchSelectionModal } from "@/components/domain/BatchSelectionModal";
import { ItemSelectionModal } from "@/components/domain/ItemSelectionModal";
import { SpecificationPickerModal } from "@/components/domain/SpecificationPickerModal";
import { LacingSelectionModal } from "@/components/domain/LacingSelectionModal";
import { SpecificationPricingModal } from "@/components/domain/SpecificationPricingModal";
import { BatchEditor } from "./BatchEditor";
import type { BatchEditorHandlers } from "./BatchEditor";
import { useStore } from "@/lib/store";
import { SHIPMENT_TERM_OPTIONS } from "@/lib/mockData";
import { formatMoney } from "@/lib/format";
import { flattenBatches, lacingAmount, newBatch, newBatchItem, newLacingLine, newSpecLine } from "@/lib/batches";
import { quotationTotals, recomputeSpecLine } from "@/lib/totals";
import type { DiscountMode } from "@/lib/totals";
import { NON_NEGATIVE, NON_NEGATIVE_INT, toNonNegative, toPercent } from "@/lib/num";
import type { BatchType, Currency, LacingLine, Quotation, QuotationBatch, SpecLine } from "@/lib/types";
import type { SpecSelection } from "@/lib/specOptions";
import type { LacingCatalogRow, SpecMasterRow } from "@/lib/specMaster";

// The quotation authoring screen, shared by "New Quotation" and "Edit Quotation". Editing a saved
// quotation is the same job as creating one — the only differences are where the initial state comes
// from and what Save does — so both routes render this rather than maintaining two copies.

const CURRENCIES: Currency[] = ["USD", "KRW", "EUR"];

const inputClass =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-paper-600">{label}</label>
      {children}
    </div>
  );
}

/** Which modal is open, and the batch/item/spec it was opened against. */
type ModalState =
  | { kind: "none" }
  | { kind: "batch" }
  | { kind: "item"; batchId: string; itemId?: string }
  | { kind: "spec"; batchId: string; itemId: string }
  | { kind: "lacing"; batchId: string }
  | { kind: "pricing"; batchId: string; itemId: string; specId: string };

export function QuotationBuilder({ existing }: { existing?: Quotation }) {
  const navigate = useNavigate();
  const { createQuotation, updateQuotation, pushToast, currentUser, pricingRules, lookupTables, customers } = useStore();
  const isEdit = Boolean(existing);

  const [customerId, setCustomerId] = useState(existing?.customerId ?? customers[0]?.id ?? "");
  const customer = customers.find((c) => c.id === customerId);

  // Currency, payment terms, consignee, and Attn contact all pre-fill from the customer's master
  // data when a customer is picked but stay fully editable per quotation — real accounts sometimes
  // ship to a different consignee, quote in a different currency, or negotiate different terms.
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? customer?.defaultCurrency ?? "USD");
  const [paymentTerms, setPaymentTerms] = useState(existing?.paymentTerms ?? customer?.defaultPaymentTerms ?? "");
  const [consignee, setConsignee] = useState(existing?.consignee ?? customer?.consignee ?? "");
  const [attentionContact, setAttentionContact] = useState(existing?.attentionContact ?? customer?.contactPerson ?? "");
  const [depositPercent, setDepositPercent] = useState(existing?.depositPercent ?? 30);
  const [leadTimeWeeks, setLeadTimeWeeks] = useState(existing?.leadTimeWeeks ?? 6);
  const [validityDays, setValidityDays] = useState(existing?.validityDays ?? 7);
  const [moq, setMoq] = useState(existing?.moq ?? "Subject to confirmation");
  // Cover-letter fields the reference quotation header carries (doc §3.1). Shipment is a phrase,
  // not a date — the client master's standard wordings back the datalist.
  const [shipmentTerms, setShipmentTerms] = useState(existing?.shipmentTerms ?? "");
  const [dearSirs, setDearSirs] = useState(existing?.dearSirs ?? "");
  const [freight, setFreight] = useState(existing?.freight ?? 0);
  const [discount, setDiscount] = useState(existing?.discount ?? 0);
  const [discountMode, setDiscountMode] = useState<DiscountMode>(existing?.discountMode ?? "amount");
  const [tax, setTax] = useState(existing?.tax ?? 0);
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");

  const [batches, setBatches] = useState<QuotationBatch[]>(existing?.batches ?? []);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });

  const contactOptions = customer?.contacts?.length
    ? customer.contacts
    : customer
      ? [{ id: "primary", name: customer.contactPerson, isPrimary: true }]
      : [];

  const totals = quotationTotals(batches, freight, discount, tax, discountMode);

  // The standard phrasings from the client master, plus whatever this quotation already carries so
  // an older or hand-written value still shows rather than reading as empty.
  const shipmentOptions =
    shipmentTerms && !SHIPMENT_TERM_OPTIONS.includes(shipmentTerms)
      ? [shipmentTerms, ...SHIPMENT_TERM_OPTIONS]
      : SHIPMENT_TERM_OPTIONS;

  // Editing a quotation authored before the batch model would silently discard its line items, so
  // that case is blocked rather than allowed to destroy data.
  const legacyWithoutBatches = isEdit && !existing?.batches?.length && (existing?.items.length ?? 0) > 0;

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

  // ---- tree mutation helpers -------------------------------------------------------------

  function patchBatch(batchId: string, patch: Partial<QuotationBatch>) {
    setBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, ...patch } : b)));
  }

  function mapItems(batchId: string, fn: (items: NonNullable<QuotationBatch["items"]>) => NonNullable<QuotationBatch["items"]>) {
    setBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, items: fn(b.items ?? []) } : b)));
  }

  /** Every spec-line edit runs back through the engine so U/P, amount and weight stay in step. */
  function patchSpec(batchId: string, itemId: string, specId: string, patch: Partial<SpecLine>) {
    mapItems(batchId, (items) =>
      items.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              specs: item.specs.map((s) =>
                s.id !== specId ? s : recomputeSpecLine({ ...s, ...patch }, pricingRules, lookupTables)
              ),
            }
      )
    );
  }

  function addBatch(type: BatchType) {
    setBatches((prev) => [...prev, newBatch(type)]);
    setModal({ kind: "none" });
  }

  function confirmItemSelection(selection: SpecSelection, specification: string) {
    if (modal.kind !== "item") return;
    const { batchId, itemId } = modal;
    if (itemId) {
      // Editing an existing item's specification. Its spec rows are kept — the user chose to re-run
      // the selection, not to discard their work.
      mapItems(batchId, (items) =>
        items.map((it) =>
          it.id !== itemId
            ? it
            : {
                ...it,
                specification,
                material: selection.material,
                netType: selection.netType,
                weightUom: selection.weightUnit || "KGS",
                qtyUom: selection.qtyUnit || "PCS",
              }
        )
      );
    } else {
      mapItems(batchId, (items) => [
        ...items,
        newBatchItem({
          specification,
          material: selection.material,
          netType: selection.netType,
          weightUom: selection.weightUnit || "KGS",
          qtyUom: selection.qtyUnit || "PCS",
        }),
      ]);
    }
    setModal({ kind: "none" });
  }

  function confirmSpecifications(rows: SpecMasterRow[]) {
    if (modal.kind !== "spec") return;
    const { batchId, itemId } = modal;
    mapItems(batchId, (items) =>
      items.map((item) =>
        item.id !== itemId
          ? item
          : {
              ...item,
              // Skip codes already on this item rather than duplicating a row.
              specs: [
                ...item.specs,
                ...rows
                  .filter((r) => !item.specs.some((s) => s.specCode === r.code))
                  .map((r) => recomputeSpecLine(newSpecLine(r), pricingRules, lookupTables)),
              ],
            }
      )
    );
    setModal({ kind: "none" });
  }

  function confirmLacing(rows: LacingCatalogRow[]) {
    if (modal.kind !== "lacing") return;
    const { batchId } = modal;
    setBatches((prev) =>
      prev.map((b) => (b.id === batchId ? { ...b, lacing: [...(b.lacing ?? []), ...rows.map(newLacingLine)] } : b))
    );
    setModal({ kind: "none" });
  }

  function patchLacing(batchId: string, lacingId: string, patch: Partial<LacingLine>) {
    setBatches((prev) =>
      prev.map((b) =>
        b.id !== batchId
          ? b
          : {
              ...b,
              lacing: (b.lacing ?? []).map((l) => {
                if (l.id !== lacingId) return l;
                const next = { ...l, ...patch };
                return { ...next, amount: lacingAmount(next) };
              }),
            }
      )
    );
  }

  function handlersFor(batch: QuotationBatch): BatchEditorHandlers {
    return {
      onPatchBatch: (patch) => patchBatch(batch.id, patch),
      onRemoveBatch: () => setBatches((prev) => prev.filter((b) => b.id !== batch.id)),
      onAddItem: () => setModal({ kind: "item", batchId: batch.id }),
      onEditItemSpec: (itemId) => setModal({ kind: "item", batchId: batch.id, itemId }),
      onRemoveItem: (itemId) => mapItems(batch.id, (items) => items.filter((i) => i.id !== itemId)),
      onAddSpecification: (itemId) => setModal({ kind: "spec", batchId: batch.id, itemId }),
      onPatchSpec: (itemId, specId, patch) => patchSpec(batch.id, itemId, specId, patch),
      onRemoveSpec: (itemId, specId) =>
        mapItems(batch.id, (items) =>
          items.map((i) => (i.id !== itemId ? i : { ...i, specs: i.specs.filter((s) => s.id !== specId) }))
        ),
      onOpenPricing: (itemId, specId) => setModal({ kind: "pricing", batchId: batch.id, itemId, specId }),
      onAddLacing: () => setModal({ kind: "lacing", batchId: batch.id }),
      onPatchLacing: (lacingId, patch) => patchLacing(batch.id, lacingId, patch),
      onRemoveLacing: (lacingId) =>
        setBatches((prev) =>
          prev.map((b) => (b.id !== batch.id ? b : { ...b, lacing: (b.lacing ?? []).filter((l) => l.id !== lacingId) }))
        ),
    };
  }

  // ---- lookups for the open modal --------------------------------------------------------

  const activeItem =
    modal.kind === "item" && modal.itemId
      ? batches.find((b) => b.id === modal.batchId)?.items?.find((i) => i.id === modal.itemId)
      : undefined;

  const specTarget =
    modal.kind === "spec"
      ? batches.find((b) => b.id === modal.batchId)?.items?.find((i) => i.id === modal.itemId)
      : undefined;

  const pricingTarget =
    modal.kind === "pricing"
      ? batches
          .find((b) => b.id === modal.batchId)
          ?.items?.find((i) => i.id === modal.itemId)
          ?.specs.find((s) => s.id === modal.specId) ?? null
      : null;

  // ---- save ------------------------------------------------------------------------------

  function handleSave() {
    if (!customer) {
      pushToast({ tone: "warning", title: "Select a customer" });
      return;
    }
    const items = flattenBatches(batches);
    if (items.length === 0) {
      pushToast({
        tone: "warning",
        title: "Nothing to quote",
        description: "Add at least one specification or lacing line.",
      });
      return;
    }

    const shared = {
      customerId,
      consignee: consignee || customer.name,
      attentionContact,
      currency,
      validityDays,
      paymentTerms: paymentTerms || customer.defaultPaymentTerms,
      shipmentTerms,
      dearSirs,
      moq,
      leadTimeWeeks,
      estimatedShipmentDate: new Date(Date.now() + leadTimeWeeks * 7 * 86400000).toISOString().slice(0, 10),
      batches,
      items,
      freight,
      discount,
      discountMode,
      tax,
      depositPercent,
      remarks,
    };

    if (existing) {
      updateQuotation(existing.id, shared);
      pushToast({ tone: "success", title: "Quotation updated", description: `${existing.id} saved.` });
      navigate(`/quotations/${existing.id}`);
      return;
    }

    const id = createQuotation({
      ...shared,
      issueDate: new Date().toISOString().slice(0, 10),
      assignedSalesperson: currentUser,
    });
    pushToast({ tone: "success", title: "Quotation drafted", description: `${id} saved as draft.` });
    navigate(`/quotations/${id}`);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Quotations", existing ? existing.id : "New"]}
        eyebrow="Quotation Management"
        title={existing ? `Edit ${existing.id}` : "New Quotation"}
        description={
          existing
            ? "Change any part of this quotation: terms, batch groups, specifications or pricing, then save."
            : "Draft a new Proforma Invoice. Build it from batch groups, then price each specification."
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<ChevronLeft className="h-4 w-4" />}
            onClick={() => navigate(existing ? `/quotations/${existing.id}` : "/quotations")}
          >
            Back
          </Button>
        }
      />

      {legacyWithoutBatches && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This quotation was created before the batch builder existed, so its lines can't be edited here yet. Saving
          would replace them. Create a revision or a new quotation instead.
        </div>
      )}

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
                    options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.country }))}
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
                      {c.title ? `, ${c.title}` : ""}
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
              <Field label="Shipment">
                <SearchableSelect
                  value={shipmentTerms}
                  onChange={setShipmentTerms}
                  placeholder="Select shipment terms…"
                  options={shipmentOptions.map((o) => ({ value: o, label: o }))}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Dear Sirs (salutation line)">
                  <input
                    value={dearSirs}
                    onChange={(e) => setDearSirs(e.target.value)}
                    placeholder="e.g. We are pleased to quote you as follows:"
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="MOQ">
                <input value={moq} onChange={(e) => setMoq(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Deposit required (%)">
                <input
                  {...NON_NEGATIVE}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(toPercent(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Lead time (weeks)">
                <input
                  {...NON_NEGATIVE_INT}
                  value={leadTimeWeeks}
                  onChange={(e) => setLeadTimeWeeks(toNonNegative(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Validity (days)">
                <input
                  {...NON_NEGATIVE_INT}
                  value={validityDays}
                  onChange={(e) => setValidityDays(toNonNegative(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Freight / additional charges">
                <input
                  {...NON_NEGATIVE}
                  value={freight}
                  onChange={(e) => setFreight(toNonNegative(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Discount">
                <div className="flex gap-2">
                  <input
                    {...NON_NEGATIVE}
                    value={discount}
                    onChange={(e) =>
                      setDiscount(discountMode === "percent" ? toPercent(e.target.value) : toNonNegative(e.target.value))
                    }
                    className={inputClass}
                  />
                  <select
                    value={discountMode}
                    onChange={(e) => {
                      const mode = e.target.value as DiscountMode;
                      setDiscountMode(mode);
                      // Switching to percent would otherwise carry a money figure straight into a
                      // percentage field, so a value above 100 is capped as it changes meaning.
                      if (mode === "percent") setDiscount((d) => Math.min(100, d));
                    }}
                    className="w-24 shrink-0 rounded-lg border border-paper-200 bg-white px-2 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                  >
                    <option value="amount">{currency}</option>
                    <option value="percent">%</option>
                  </select>
                </div>
                {discountMode === "percent" && discount > 0 && (
                  <p className="mt-1 text-[11px] text-paper-500">
                    {discount}% of {formatMoney(totals.itemsTotal, currency)} is{" "}
                    <span className="font-mono">{formatMoney(totals.discountValue, currency)}</span>
                  </p>
                )}
              </Field>
              <Field label="Tax">
                <input
                  {...NON_NEGATIVE}
                  value={tax}
                  onChange={(e) => setTax(toNonNegative(e.target.value))}
                  className={inputClass}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Batch Items"
              eyebrow="Step 2 · Quotation Builder"
              subtitle="Each batch group holds items; each item holds the specification codes that carry price and weight. Pricing rules start off, so apply them per specification."
            />

            {batches.length === 0 ? (
              <p className="rounded-lg border border-dashed border-paper-300 py-8 text-center text-sm text-paper-400">
                No batch groups yet. Generate one to begin.
              </p>
            ) : (
              <div className="space-y-3">
                {batches.map((batch) => (
                  <BatchEditor
                    key={batch.id}
                    batch={batch}
                    currency={currency}
                    pricingRules={pricingRules}
                    lookupTables={lookupTables}
                    handlers={handlersFor(batch)}
                  />
                ))}
              </div>
            )}

            <div className="mt-3 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                onClick={() => setModal({ kind: "batch" })}
              >
                Generate Batch Item
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-paper-100 pt-3 text-sm">
              <span>
                <span className="text-paper-500">Items:&nbsp;</span>
                <span className="font-mono text-paper-700">{formatMoney(totals.itemsTotal, currency)}</span>
              </span>
              {totals.discountValue > 0 && (
                <span>
                  <span className="text-paper-500">Discount:&nbsp;</span>
                  <span className="font-mono text-alert-600">
                    -{formatMoney(totals.discountValue, currency)}
                    {discountMode === "percent" && ` (${discount}%)`}
                  </span>
                </span>
              )}
              <span>
                <span className="text-paper-500">Total weight:&nbsp;</span>
                <span className="font-mono font-semibold text-paper-700">{totals.totalWeightKg.toFixed(2)} KGS</span>
              </span>
              <span>
                <span className="text-paper-500">Grand total:&nbsp;</span>
                <span className="font-mono font-bold text-pine-800">{formatMoney(totals.grandTotal, currency)}</span>
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
            <Button variant="secondary" onClick={() => navigate(existing ? `/quotations/${existing.id}` : "/quotations")}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {existing ? "Save Changes" : "Save as Draft"}
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
              <p className="font-mono text-sm font-semibold text-paper-800">{formatMoney(customer.outstandingBalanceUSD)}</p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-paper-400">Select a customer to see their snapshot.</p>
            </Card>
          )}
          <ProcessDiscoveryNote
            items={[
              "Which fields are mandatory before submission? Is a technical assessment always required first?",
              "Should freight be entered manually per quotation or pulled from a shipping-line rate table?",
              "Given Price/kg is typed per specification line; whether the factory expects a default per spec code is still open.",
              "Material narrows Net Type using whatever the specification master actually carries. The factory's real material and net-type dependency table should replace that inference.",
              "Lacing twine rates default to 2.50/kg from the simulation sample; the real per-code rate card is still to come.",
            ]}
          />
        </div>
      </div>

      <BatchSelectionModal open={modal.kind === "batch"} onClose={() => setModal({ kind: "none" })} onPick={addBatch} />

      <ItemSelectionModal
        open={modal.kind === "item"}
        onClose={() => setModal({ kind: "none" })}
        initial={
          activeItem
            ? {
                category: "",
                material: activeItem.material,
                netType: activeItem.netType,
                knots: "",
                selvages: "",
                stretching: "",
                reinforcement: "",
                others: "",
                color: "",
                weightUnit: activeItem.weightUom,
                qtyUnit: activeItem.qtyUom,
              }
            : undefined
        }
        onConfirm={confirmItemSelection}
      />

      <SpecificationPickerModal
        open={modal.kind === "spec"}
        onClose={() => setModal({ kind: "none" })}
        material={specTarget?.material ?? ""}
        netType={specTarget?.netType ?? ""}
        onConfirm={confirmSpecifications}
      />

      <LacingSelectionModal open={modal.kind === "lacing"} onClose={() => setModal({ kind: "none" })} onConfirm={confirmLacing} />

      <SpecificationPricingModal
        open={modal.kind === "pricing"}
        onClose={() => setModal({ kind: "none" })}
        line={pricingTarget}
        onApply={(pricing) => {
          if (modal.kind !== "pricing") return;
          patchSpec(modal.batchId, modal.itemId, modal.specId, { pricing });
          setModal({ kind: "none" });
        }}
      />
    </div>
  );
}
