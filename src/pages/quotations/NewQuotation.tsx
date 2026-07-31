import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { useStore } from "@/lib/store";
import { CUSTOMERS, ITEM_MASTER } from "@/lib/mockData";
import { formatMoney } from "@/lib/format";
import type { QuotationLineItem } from "@/lib/types";

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

export function NewQuotation() {
  const navigate = useNavigate();
  const { createQuotation, pushToast, currentUser } = useStore();

  const [customerId, setCustomerId] = useState(CUSTOMERS[0].id);
  const [depositPercent, setDepositPercent] = useState(30);
  const [leadTimeWeeks, setLeadTimeWeeks] = useState(6);
  const [validityDays, setValidityDays] = useState(7);
  const [freight, setFreight] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<QuotationLineItem[]>([]);

  const customer = CUSTOMERS.find((c) => c.id === customerId)!;

  function addItem() {
    const im = ITEM_MASTER[0];
    setItems((prev) => [
      ...prev,
      {
        id: `L${prev.length + 1}-${Date.now()}`,
        itemCode: im.code,
        description: im.description,
        specification: `${im.meshDepth}, ${im.color}`,
        qtyPcs: 1,
        unit: im.uom,
        unitPrice: im.unitPrice,
        weightKg: im.unitWeightKg,
        totalPrice: im.unitPrice,
      },
    ]);
  }

  function updateItem(id: string, patch: Partial<QuotationLineItem>) {
    setItems((prev) =>
      prev.map((li) => {
        if (li.id !== id) return li;
        const merged = { ...li, ...patch };
        merged.totalPrice = merged.qtyPcs * merged.unitPrice;
        return merged;
      })
    );
  }

  function setItemCode(id: string, code: string) {
    const im = ITEM_MASTER.find((x) => x.code === code);
    if (!im) return;
    updateItem(id, {
      itemCode: im.code,
      description: im.description,
      specification: `${im.meshDepth}, ${im.color}`,
      unitPrice: im.unitPrice,
      weightKg: im.unitWeightKg,
    });
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((li) => li.id !== id));
  }

  const total = items.reduce((s, li) => s + li.totalPrice, 0) + freight;

  function handleCreate() {
    if (items.length === 0) {
      pushToast({ tone: "warning", title: "Add at least one line item" });
      return;
    }
    const id = createQuotation({
      customerId,
      consignee: customer.name,
      currency: customer.defaultCurrency,
      validityDays,
      issueDate: new Date().toISOString().slice(0, 10),
      paymentTerms: customer.defaultPaymentTerms,
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
            <div className="grid grid-cols-2 gap-4">
              <Field label="Customer">
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass}>
                  {CUSTOMERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.country}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <input disabled value={customer.defaultCurrency} className={`${inputClass} bg-paper-50 text-paper-500`} />
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
              eyebrow="Step 2"
              action={
                <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addItem}>
                  Add Item
                </Button>
              }
            />
            {items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-paper-300 py-8 text-center text-sm text-paper-400">
                No items yet — add a line item from the item master.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((li) => (
                  <div key={li.id} className="grid grid-cols-12 items-center gap-2 rounded-lg border border-paper-100 p-2.5">
                    <select
                      value={li.itemCode}
                      onChange={(e) => setItemCode(li.id, e.target.value)}
                      className="col-span-5 rounded-md border border-paper-200 px-2 py-1.5 text-xs"
                    >
                      {ITEM_MASTER.map((im) => (
                        <option key={im.code} value={im.code}>
                          {im.description}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={li.qtyPcs}
                      onChange={(e) => updateItem(li.id, { qtyPcs: Number(e.target.value) })}
                      className="col-span-2 rounded-md border border-paper-200 px-2 py-1.5 text-xs"
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      value={li.unitPrice}
                      onChange={(e) => updateItem(li.id, { unitPrice: Number(e.target.value) })}
                      className="col-span-2 rounded-md border border-paper-200 px-2 py-1.5 text-xs"
                      placeholder="Unit price"
                    />
                    <span className="col-span-2 text-right font-mono text-xs font-semibold">
                      {formatMoney(li.totalPrice, customer.defaultCurrency)}
                    </span>
                    <button onClick={() => removeItem(li.id)} className="col-span-1 flex justify-end text-paper-400 hover:text-alert-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex justify-end border-t border-paper-100 pt-3 text-sm">
              <span className="text-paper-500">Total (incl. freight):&nbsp;</span>
              <span className="font-mono font-bold text-pine-800">{formatMoney(total, customer.defaultCurrency)}</span>
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
          <Card>
            <CardHeader title={customer.name} eyebrow="Customer Snapshot" />
            <p className="text-sm text-paper-600">{customer.address}</p>
            <p className="mt-2 text-xs text-paper-400">Default terms</p>
            <p className="text-sm text-paper-700">{customer.defaultPaymentTerms}</p>
            <p className="mt-2 text-xs text-paper-400">Outstanding balance</p>
            <p className="font-mono text-sm font-semibold text-paper-800">
              {formatMoney(customer.outstandingBalanceUSD)}
            </p>
          </Card>
          <ProcessDiscoveryNote
            items={[
              "Which fields are mandatory before submission — is a technical assessment always required first?",
              "MOQ and lead-time defaults per item family are not yet finalized with the factory.",
              "Should freight be entered manually per quotation or pulled from a shipping-line rate table?",
            ]}
          />
        </div>
      </div>
    </div>
  );
}
