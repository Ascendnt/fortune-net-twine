import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { computeLinePricing, formatRuleRate, lookupKeyForSpecRow } from "@/lib/pricing";
import type { LinePricing, SpecLine } from "@/lib/types";

// Specification Pricing (doc §3.5).
//
// Price / Piece (§3.6), the labour, wastage and sewing-twine side of the U/P, is parked. Those
// costs genuinely belong in the price, but the rates and the way they combine are still being
// settled with the factory, and a half-right cost is worse than none: it looks authoritative and
// quietly moves every figure on the quotation. Until then the U/P is the new price per kilo times
// the weight per piece, and anything needing more is typed in directly.
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
  /**
   * `manualUnitPrice` is the U/P the user typed in place of the calculated one, or undefined when
   * they were happy with the calculation.
   */
  onApply: (pricing: LinePricing, manualUnitPrice?: number) => void;
}) {
  const { pricingRules, lookupTables } = useStore();
  const [draft, setDraft] = useState<LinePricing | null>(null);
  /**
   * The manual U/P override.
   *
   * Prices get agreed on the phone and by email as round numbers, and the calculation is there to
   * work out what the number should be, not to dictate what was actually agreed. The override lets
   * the salesperson land on the figure the customer was quoted while keeping the workings visible
   * beside it, so the gap between the two is obvious rather than hidden.
   */
  /**
   * Both manual price overrides are hidden from this screen for now.
   *
   * The state and the apply logic stay, deliberately. A line priced by hand before they were
   * hidden still carries that price, and wiping it because the control that set it is no longer
   * on screen would silently change money on a live quotation. They are read back in, carried
   * through Apply untouched, and simply not offered again here.
   *
   * The typed U/P on the batch row is unaffected and remains the way to set a price directly.
   */
  const [manualMode, setManualMode] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  /** The same idea one level up: a new price per kg typed instead of derived from the rules. */
  const [manualKgMode, setManualKgMode] = useState(false);
  const [manualKgPrice, setManualKgPrice] = useState("");

  useEffect(() => {
    if (open && line) {
      setDraft({ ...line.pricing, appliedRuleIds: [...line.pricing.appliedRuleIds] });
      setManualMode(Boolean(line.manualUnitPrice));
      setManualPrice(line.manualUnitPrice ? String(line.unitPrice) : "");
      setManualKgMode(line.pricing.manualNewPriceKg !== undefined);
      setManualKgPrice(line.pricing.manualNewPriceKg !== undefined ? String(line.pricing.manualNewPriceKg) : "");
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

  function apply() {
    const typed = Number(manualPrice);
    // An empty or nonsensical box falls back to the calculation rather than writing a zero price
    // onto the quotation.
    const manual = manualMode && Number.isFinite(typed) && typed > 0 ? typed : undefined;
    const typedKg = Number(manualKgPrice);
    const manualKg = manualKgMode && Number.isFinite(typedKg) && typedKg > 0 ? typedKg : undefined;
    onApply(
      {
        ...draft!,
        givenPriceKg: line!.givenPriceKg,
        chain: result!.chain,
        newPriceKg: result!.newPriceKg,
        manualNewPriceKg: manualKg,
        pricePerPiece: result!.pricePerPiece,
        laborCost: result!.laborCost,
        wastageCost: result!.wastageCost,
        twineCost: result!.twineCost,
      },
      manual
    );
  }

  const additional = result.newPriceKg - line.givenPriceKg;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Specification Pricing"
      subtitle={`${line.specCode} · ${line.description}`}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={apply}>
            Apply Pricing
          </Button>
        </>
      }
    >
      {(
        <>
          <div className="mb-3 flex items-center justify-between rounded-lg bg-paper-50 px-3 py-2">
            <span className="text-xs text-paper-500">USD/WT</span>
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
                          <span className="text-paper-300">-</span>
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
              <p className="text-[11px] text-paper-500">New price / kg = USD/WT plus the sum of the additional values</p>
              <p className="text-[11px] text-paper-400">
                Additional: <span className="font-mono">{additional >= 0 ? "+" : ""}{additional.toFixed(4)}</span> ·{" "}
                {draft.appliedRuleIds.length} of {enabledRules.length} applied
              </p>
            </div>
            <span className="font-mono text-lg font-bold text-pine-800">{result.newPriceKg.toFixed(4)}</span>
          </div>

          {/* Manual computation. The rules are a way of working out what the price should be, not a
              rule about what it must be, so the new price / kg can simply be typed. The chain above
              stays on screen and is still recorded, which is what makes the gap between the agreed
              price and the calculated one visible instead of lost. */}
          {/* What this line will actually carry. Previously this only appeared after clicking
              through to a second step; with that step parked, the outcome belongs here where the
              decision is made. */}
          <div className="mt-3 space-y-1.5 rounded-lg bg-paper-50 p-3 text-xs">
            <Row label={`New price/kg × weight/pc (${line.weightPerPc.toFixed(2)})`} value={result.pricePerPiece} />
            <div className="flex items-center justify-between border-t border-paper-200 pt-1.5 text-sm font-semibold text-pine-800">
              <span>U/P (new price / piece)</span>
              <span className="font-mono">{result.unitPrice.toFixed(4)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-paper-500">
              <span>Amount at qty {line.qtyPcs}</span>
              <span className="font-mono">{result.totalPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* The manufacturing side of the price is not switched off quietly. Labour, wastage and
              sewing twine belong in the U/P, but the rates and the way they combine are still
              being worked out with the factory, and a half-right cost would be worse than none:
              it would look authoritative and quietly move every price on the quotation.
              Shown, disabled, and labelled, so it reads as coming rather than missing. */}
          <div className="mt-3 rounded-lg border border-dashed border-paper-300 bg-paper-50/60 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-paper-400" />
              <span className="text-xs font-medium text-paper-600">Price / Piece: manufacturing costs</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Coming soon
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 opacity-55 sm:grid-cols-5">
              {[
                { label: "Labor hours", value: draft.laborHours },
                { label: "Labor rate / hr", value: draft.laborRate },
                { label: "Wastage (kg)", value: draft.wastageKg },
                { label: "Sewing twine (kg)", value: draft.twineKg },
                { label: "Sewing rate / kg", value: draft.twineRate },
              ].map((f) => (
                <Field key={f.label} label={f.label}>
                  <input value={f.value} readOnly tabIndex={-1} className={clsx(miniInput, "cursor-not-allowed")} />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-paper-500">
              Until the rates are agreed with the factory, the U/P is the new price per kilo times the weight per
              piece. Use <span className="font-medium">Enter the U/P myself</span> above for anything that has to
              include labour or wastage today.
            </p>
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
