import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { computeLinePricing, formatRuleRate, lookupKeyForSpecRow } from "@/lib/pricing";
import { NON_NEGATIVE, toNonNegative } from "@/lib/num";
import type { LinePricing, SpecLine } from "@/lib/types";

// Specification Pricing (doc §3.5) and Price / Piece (§3.6), as two stages behind one modal.
//
// Two deliberate departures from the build this replaces:
//
//  1. Nothing is applied by default. The old screen seeded every enabled rule onto every new line,
//     so a quotation silently carried Commission + Markup + MD + DW + Insurance whether or not
//     anyone intended it. Enabled means "available to apply", not "applied".
//  2. Rates are on screen. The old pills showed only a label, so "Commission" gave no hint it was
//     3%, and lookup-backed rules gave no hint what they resolved to for this particular row.

const miniInput =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function SpecificationPricingModal({
  open,
  onClose,
  line,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  line: SpecLine | null;
  onApply: (pricing: LinePricing) => void;
}) {
  const { pricingRules, lookupTables } = useStore();
  const [stage, setStage] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<LinePricing | null>(null);

  useEffect(() => {
    if (open && line) {
      setDraft({ ...line.pricing, appliedRuleIds: [...line.pricing.appliedRuleIds] });
      setStage(1);
    }
  }, [open, line]);

  const enabledRules = useMemo(
    () => pricingRules.filter((r) => r.enabled).sort((a, b) => a.sequence - b.sequence),
    [pricingRules]
  );

  const keyForRule = useMemo(
    () =>
      line
        ? lookupKeyForSpecRow({ code: line.specCode, meshDepth: line.meshDepth, length: line.length })
        : () => "default",
    [line]
  );

  const result = useMemo(() => {
    if (!line || !draft) return null;
    return computeLinePricing(
      {
        givenPriceKg: line.givenPriceKg,
        weightPerPc: line.weightPerPc,
        qtyPcs: line.qtyPcs,
        appliedRuleIds: draft.appliedRuleIds,
        laborHours: draft.laborHours,
        laborRate: draft.laborRate,
        wastageKg: draft.wastageKg,
        twineKg: draft.twineKg,
        twineRate: draft.twineRate,
        lookupKeyForRule: keyForRule,
      },
      pricingRules,
      lookupTables
    );
  }, [line, draft, pricingRules, lookupTables, keyForRule]);

  if (!line || !draft || !result) return null;

  const stepByRule = Object.fromEntries(result.chain.map((s) => [s.ruleId, s]));

  function toggle(ruleId: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            appliedRuleIds: prev.appliedRuleIds.includes(ruleId)
              ? prev.appliedRuleIds.filter((id) => id !== ruleId)
              : [...prev.appliedRuleIds, ruleId],
          }
        : prev
    );
  }

  function patch(p: Partial<LinePricing>) {
    setDraft((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function apply() {
    onApply({
      ...draft!,
      givenPriceKg: line!.givenPriceKg,
      chain: result!.chain,
      newPriceKg: result!.newPriceKg,
      pricePerPiece: result!.pricePerPiece,
      laborCost: result!.laborCost,
      wastageCost: result!.wastageCost,
      twineCost: result!.twineCost,
    });
  }

  const additional = result.newPriceKg - line.givenPriceKg;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stage === 1 ? "Specification Pricing" : "Price / Piece"}
      subtitle={`${line.specCode} · ${line.description}`}
      width="max-w-3xl"
      footer={
        <>
          {stage === 2 && (
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => setStage(1)}>
              Back
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {stage === 1 ? (
            <Button variant="primary" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => setStage(2)}>
              Proceed to Price / Piece
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={apply}>
              Apply Pricing
            </Button>
          )}
        </>
      }
    >
      {stage === 1 ? (
        <>
          <div className="mb-3 flex items-center justify-between rounded-lg bg-paper-50 px-3 py-2">
            <span className="text-xs text-paper-500">Given price / kg</span>
            <span className="font-mono text-sm font-semibold text-paper-800">{line.givenPriceKg.toFixed(4)}</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-paper-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                  <th className="w-10 py-2 pl-3" />
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Adjustment</th>
                  <th className="w-24 px-2 py-2 text-right">Rate</th>
                  <th className="w-44 px-2 py-2 text-right">Running total</th>
                </tr>
              </thead>
              <tbody>
                {enabledRules.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-paper-400">
                      No rules enabled. See Settings, then Pricing Rules.
                    </td>
                  </tr>
                )}
                {enabledRules.map((rule) => {
                  const applied = draft.appliedRuleIds.includes(rule.id);
                  const step = stepByRule[rule.id];
                  return (
                    <tr
                      key={rule.id}
                      onClick={() => toggle(rule.id)}
                      className={clsx(
                        "cursor-pointer border-b border-paper-100 last:border-0",
                        applied ? "bg-manifest-50" : "hover:bg-paper-50"
                      )}
                    >
                      <td className="py-2 pl-3">
                        <input
                          type="checkbox"
                          checked={applied}
                          onChange={() => toggle(rule.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-[10.5px] text-paper-500">{rule.code}</td>
                      <td className="px-2 py-2 font-medium text-paper-800">{rule.label}</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold text-pine-800">
                        {formatRuleRate(rule, lookupTables, keyForRule(rule))}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-paper-600">
                        {step ? (
                          <>
                            {step.before.toFixed(4)} <span className="text-paper-300">→</span>{" "}
                            <span className="font-semibold text-paper-800">{step.after.toFixed(4)}</span>
                          </>
                        ) : (
                          <span className="text-paper-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg border border-pine-200 bg-pine-50 px-3 py-2.5">
            <div>
              <p className="text-[11px] text-paper-500">New price / kg = Given price plus the sum of the additional values</p>
              <p className="text-[11px] text-paper-400">
                Additional: <span className="font-mono">{additional >= 0 ? "+" : ""}{additional.toFixed(4)}</span> ·{" "}
                {draft.appliedRuleIds.length} of {enabledRules.length} applied
              </p>
            </div>
            <span className="font-mono text-lg font-bold text-pine-800">{result.newPriceKg.toFixed(4)}</span>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Labor hours">
              <input {...NON_NEGATIVE} value={draft.laborHours} onChange={(e) => patch({ laborHours: toNonNegative(e.target.value) })} className={miniInput} />
            </Field>
            <Field label="Labor rate / hr">
              <input {...NON_NEGATIVE} value={draft.laborRate} onChange={(e) => patch({ laborRate: toNonNegative(e.target.value) })} className={miniInput} />
            </Field>
            <Field label="Wastage (kg)">
              <input {...NON_NEGATIVE} value={draft.wastageKg} onChange={(e) => patch({ wastageKg: toNonNegative(e.target.value) })} className={miniInput} />
            </Field>
            <Field label="Sewing twine (kg)">
              <input {...NON_NEGATIVE} value={draft.twineKg} onChange={(e) => patch({ twineKg: toNonNegative(e.target.value) })} className={miniInput} />
            </Field>
            <Field label="Sewing rate / kg">
              <input {...NON_NEGATIVE} value={draft.twineRate} onChange={(e) => patch({ twineRate: toNonNegative(e.target.value) })} className={miniInput} />
            </Field>
          </div>

          <div className="mt-4 space-y-1.5 rounded-lg bg-paper-50 p-3 text-xs">
            <Row label={`New price/kg × weight/pc (${line.weightPerPc.toFixed(2)})`} value={result.pricePerPiece} />
            <Row label="Labor" value={result.laborCost} />
            <Row label={`Wastage (${draft.wastageKg} kg × ${result.newPriceKg.toFixed(4)})`} value={result.wastageCost} />
            <Row label="Sewing twine" value={result.twineCost} />
            <div className="flex items-center justify-between border-t border-paper-200 pt-1.5 text-sm font-semibold text-pine-800">
              <span>U/P (new price / piece)</span>
              <span className="font-mono">{result.unitPrice.toFixed(4)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-paper-500">
              <span>Amount at qty {line.qtyPcs}</span>
              <span className="font-mono">{result.totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-paper-600">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-paper-500">
      <span>{label}</span>
      <span className="font-mono text-paper-700">{value.toFixed(4)}</span>
    </div>
  );
}
