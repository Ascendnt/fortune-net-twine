import { MousePointerClick, Pencil, Plus, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { BATCH_LABEL, isPricingUntouched, lacingAmount } from "@/lib/batches";
import { batchTotal } from "@/lib/totals";
import { formatMoney } from "@/lib/format";
import { formatRuleRate, lookupKeyForSpecRow } from "@/lib/pricing";
import { NumberInput } from "@/components/ui/NumberInput";
import type { BatchItem, Currency, LacingLine, LookupTable, PricingRule, QuotationBatch, SpecLine } from "@/lib/types";

// Renders one batch group. All three types share the banner, delete and footer-total frame; the
// body differs by type, per doc §3.2:
//
//   ASSEMBLED  editable product title, then items      contributes to total and weight
//   NORMAL     items only                              contributes to total and weight
//   LACING     twine (KGS x rate) and flat charges     twine contributes weight, charges do not
//
// The reference system's NOTE group is deliberately absent: the quotation header's Remarks field
// already carries narrative text onto the PI, and two mechanisms for one job invites drift.

const miniInput =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export interface BatchEditorHandlers {
  onPatchBatch: (patch: Partial<QuotationBatch>) => void;
  onRemoveBatch: () => void;
  onAddItem: () => void;
  onEditItemSpec: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onAddSpecification: (itemId: string) => void;
  /** Reopens Item Selection to swap this row's code in place, keeping its price and quantity. */
  onReplaceSpec: (itemId: string, specId: string) => void;
  onPatchSpec: (itemId: string, specId: string, patch: Partial<SpecLine>) => void;
  onRemoveSpec: (itemId: string, specId: string) => void;
  onOpenPricing: (itemId: string, specId: string) => void;
  onAddLacing: () => void;
  onPatchLacing: (lacingId: string, patch: Partial<LacingLine>) => void;
  onRemoveLacing: (lacingId: string) => void;
}

export function BatchEditor({
  batch,
  currency,
  pricingRules,
  lookupTables,
  handlers,
}: {
  batch: QuotationBatch;
  currency: Currency;
  pricingRules: PricingRule[];
  lookupTables: LookupTable[];
  handlers: BatchEditorHandlers;
}) {
  const total = batchTotal(batch);

  return (
    <div className="overflow-hidden rounded-lg border border-paper-200">
      <div className="flex items-center justify-between gap-2 bg-pine-700 px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
          {BATCH_LABEL[batch.type]}
        </span>
        <button
          onClick={handlers.onRemoveBatch}
          className="rounded p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          aria-label={`Delete ${BATCH_LABEL[batch.type]} group`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3">
        {batch.type === "lacing" && (
          <LacingBody batch={batch} currency={currency} handlers={handlers} />
        )}

        {(batch.type === "normal" || batch.type === "assembled") && (
          <div className="space-y-3">
            {/* No free-text title on an ASSEMBLED group. The specification sentence on each item
                already names the product, so a second description field was one more thing to
                fill in that said nothing the document did not already carry. */}
            {(batch.items ?? []).map((item) => (
              <ItemBlock
                key={item.id}
                item={item}
                currency={currency}
                pricingRules={pricingRules}
                lookupTables={lookupTables}
                handlers={handlers}
              />
            ))}

            <div className="flex justify-center">
              <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={handlers.onAddItem}>
                Add Description
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-paper-100 bg-paper-50/70 px-3 py-2 text-xs">
        <span className="font-mono uppercase tracking-wide text-paper-500">{BATCH_LABEL[batch.type]} total</span>
        <span className="font-mono text-sm font-semibold text-pine-800">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}

function ItemBlock({
  item,
  currency,
  pricingRules,
  lookupTables,
  handlers,
}: {
  item: BatchItem;
  currency: Currency;
  pricingRules: PricingRule[];
  lookupTables: LookupTable[];
  handlers: BatchEditorHandlers;
}) {
  return (
    <div className="rounded-lg border border-paper-200">
      {/* The specification sentence can only be rebuilt through Item Selection, so this header is
          the way back into it. It reads as static text unless the affordance is explicit, hence the
          hover highlight on the whole row, the pointer cursor and the dedicated Edit control.
          Edit and Delete are stacked in one right-hand column so their icons line up. */}
      <div className="group flex items-start justify-between gap-2 border-b border-paper-100 bg-paper-50/60 px-2.5 py-2">
        <button
          onClick={() => handlers.onEditItemSpec(item.id)}
          className="-m-1 flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md p-1 text-left transition-colors hover:bg-manifest-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-manifest-600"
          title="Click to rebuild this item's specification"
        >
          <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper-300 transition-colors group-hover:text-manifest-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-semibold uppercase leading-snug text-pine-800 underline decoration-paper-300 decoration-dotted underline-offset-2 group-hover:decoration-manifest-500">
              {item.specification}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wide text-paper-400">
              {item.weightUom} · {item.qtyUom}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            onClick={() => handlers.onRemoveItem(item.id)}
            className="rounded p-1 text-paper-400 transition-colors hover:bg-white hover:text-alert-600"
            aria-label="Remove item"
            title="Remove this item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handlers.onEditItemSpec(item.id)}
            className="rounded p-1 text-paper-400 transition-colors group-hover:text-manifest-600 hover:bg-white hover:text-manifest-700"
            aria-label="Edit item specification"
            title="Edit this item's specification"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {item.specs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-paper-100 text-left font-mono text-[9.5px] uppercase tracking-wide text-paper-400">
                <th className="w-24 px-2 py-1.5">Code</th>
                <th className="px-2 py-1.5">Item</th>
                <th className="w-20 px-2 py-1.5 text-right">Weight/pc</th>
                <th className="w-24 px-2 py-1.5 text-right">USD/WT</th>
                <th className="w-20 px-2 py-1.5 text-right">Qty</th>
                <th className="w-52 px-2 py-1.5">Pricing</th>
                <th className="w-28 px-2 py-1.5 text-right">U/P</th>
                <th className="w-28 px-2 py-1.5 text-right">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {item.specs.map((spec) => (
                <SpecRow
                  key={spec.id}
                  spec={spec}
                  itemId={item.id}
                  currency={currency}
                  pricingRules={pricingRules}
                  lookupTables={lookupTables}
                  handlers={handlers}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center border-t border-paper-100 py-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => handlers.onAddSpecification(item.id)}
        >
          Add Item
        </Button>
      </div>
    </div>
  );
}

function SpecRow({
  spec,
  itemId,
  currency,
  pricingRules,
  lookupTables,
  handlers,
}: {
  spec: SpecLine;
  itemId: string;
  currency: Currency;
  pricingRules: PricingRule[];
  lookupTables: LookupTable[];
  handlers: BatchEditorHandlers;
}) {
  const untouched = isPricingUntouched(spec.pricing);
  const keyFor = lookupKeyForSpecRow({ code: spec.specCode, meshDepth: spec.meshDepth, length: spec.length });

  // The applied-rules read-out. This is what makes the rates visible without opening anything.
  // The old build showed unlabelled pills that were all switched on by default.
  const summary = spec.pricing.appliedRuleIds
    .map((id) => pricingRules.find((r) => r.id === id))
    .filter((r): r is PricingRule => Boolean(r))
    .sort((a, b) => a.sequence - b.sequence)
    .map((r) => `${r.code.split("_")[0]} ${formatRuleRate(r, lookupTables, keyFor(r))}`);

  return (
    <tr className="border-b border-paper-100 last:border-0">
      <td className="px-2 py-1.5 font-mono text-[11px] text-pine-800">{spec.specCode}</td>
      <td className="px-2 py-1.5">
        {/* Swapping the code in place, rather than deleting and re-adding, keeps the row where it
            sits and preserves its USD/WT, quantity and pricing. The picker stays filtered to the
            parent item's material and net type. */}
        <button
          onClick={() => handlers.onReplaceSpec(itemId, spec.id)}
          title="Click to choose a different item code"
          className="-m-1 w-full rounded-md p-1 text-left text-[11px] text-paper-600 underline decoration-paper-300 decoration-dotted underline-offset-2 transition-colors hover:bg-manifest-50 hover:text-manifest-900 hover:decoration-manifest-500"
        >
          {spec.description}
        </button>
      </td>
      <td className="px-2 py-1.5">
        {/* Editable. The catalog weight is a standard, and a real panel comes off the machine a
            little heavier or lighter; the quoted weight has to be the one being shipped, because
            the freight and the total weight on the document both come off it. */}
        <NumberInput
          value={spec.weightPerPc}
          onCommit={(n) => handlers.onPatchSpec(itemId, spec.id, { weightPerPc: n })}
          className={clsx(miniInput, "text-right")}
          title="Weight of one piece. Change it if the actual differs from the catalog standard."
        />
      </td>
      <td className="px-2 py-1.5">
        {/* Starts and stays blank until somebody types a rate. Zero is the stored stand-in for
            "not entered", never shown as a figure. A rate nobody has decided is absent, not nil. */}
        <NumberInput
          value={spec.givenPriceKg}
          blankValue={0}
          step="0.0001"
          onCommit={(n) => handlers.onPatchSpec(itemId, spec.id, { givenPriceKg: n })}
          className={clsx(miniInput, "text-right")}
        />
      </td>
      <td className="px-2 py-1.5">
        {/* Whole pieces, and blank until entered. */}
        <NumberInput
          value={spec.qtyPcs}
          blankValue={0}
          integer
          onCommit={(n) => handlers.onPatchSpec(itemId, spec.id, { qtyPcs: n })}
          className={clsx(miniInput, "text-right")}
        />
      </td>
      <td className="px-2 py-1.5">
        {untouched ? (
          <button
            onClick={() => handlers.onOpenPricing(itemId, spec.id)}
            className="w-full rounded-md border border-pine-700 bg-pine-700 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-pine-800"
          >
            Add Pricing
          </button>
        ) : (
          <button
            onClick={() => handlers.onOpenPricing(itemId, spec.id)}
            className="w-full rounded-md border border-manifest-200 bg-manifest-50 px-2 py-1 text-left transition-colors hover:border-manifest-500"
            title="Edit pricing"
          >
            <span className="block truncate font-mono text-[10px] text-manifest-900">
              {spec.pricing.manualNewPriceKg !== undefined
                ? "Price entered manually"
                : summary.length > 0
                  ? summary.join(" · ")
                  : "Manual costs only"}
            </span>
            <span className="block font-mono text-[10px] text-paper-500">
              → {spec.pricing.newPriceKg.toFixed(4)} /kg · edit
            </span>
          </button>
        )}
      </td>
      <td className="px-2 py-1.5">
        {/* Typed directly. Pricing is manual; the Add Pricing helper can fill this in, but the
            number here is always the one that counts. */}
        {/* Blank until a price exists. Clearing it also hands the line back to the calculation
            rather than pinning it at a manual zero. An emptied box means "I have not decided",
            not "the price is nothing". */}
        <NumberInput
          value={spec.unitPrice}
          blankValue={0}
          step="0.0001"
          onCommit={(n) =>
            handlers.onPatchSpec(itemId, spec.id, { unitPrice: n, manualUnitPrice: n > 0 })
          }
          className={clsx(miniInput, "text-right")}
        />
      </td>
      <td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-pine-800">
        {formatMoney(spec.amount, currency)}
      </td>
      <td className="px-1 py-1.5">
        <button
          onClick={() => handlers.onRemoveSpec(itemId, spec.id)}
          className="text-paper-400 hover:text-alert-600"
          aria-label="Remove specification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function LacingBody({
  batch,
  currency,
  handlers,
}: {
  batch: QuotationBatch;
  currency: Currency;
  handlers: BatchEditorHandlers;
}) {
  const lines = batch.lacing ?? [];
  return (
    <div className="space-y-2">
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-paper-100 text-left font-mono text-[9.5px] uppercase tracking-wide text-paper-400">
                <th className="w-24 px-2 py-1.5">Code</th>
                <th className="px-2 py-1.5">Lacing description</th>
                <th className="w-24 px-2 py-1.5 text-right">KG</th>
                <th className="w-24 px-2 py-1.5 text-right">Rate / Amount</th>
                <th className="w-28 px-2 py-1.5 text-right">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-paper-100 last:border-0">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-pine-800">{line.code}</td>
                  <td className="px-2 py-1.5 text-[11px] text-paper-600">
                    {line.description}
                    {line.kind === "charge" && (
                      <span className="ml-1.5 rounded bg-paper-100 px-1 py-0.5 text-[9px] uppercase text-paper-500">
                        flat charge, no weight
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {line.kind === "twine" ? (
                      <NumberInput
                        value={line.kgs}
                        onCommit={(n) => handlers.onPatchLacing(line.id, { kgs: n })}
                        className={clsx(miniInput, "text-right")}
                      />
                    ) : (
                      <span className="block text-right font-mono text-[11px] text-paper-300">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <NumberInput
                      value={line.rate}
                      step="0.0001"
                      onCommit={(n) => handlers.onPatchLacing(line.id, { rate: n })}
                      className={clsx(miniInput, "text-right")}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-pine-800">
                    {formatMoney(lacingAmount(line), currency)}
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      onClick={() => handlers.onRemoveLacing(line.id)}
                      className="text-paper-400 hover:text-alert-600"
                      aria-label="Remove lacing line"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center">
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={handlers.onAddLacing}>
          Add Lacing
        </Button>
      </div>
    </div>
  );
}
