import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FlaskConical, FileSpreadsheet, Plus, Trash2, Clock } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, formatMoney } from "@/lib/format";
import { NON_NEGATIVE, NON_NEGATIVE_INT, toNonNegative } from "@/lib/num";
import type { AssessmentLine, AssessmentVerdict, TechnicalAssessment } from "@/lib/types";

// The plant's reply to an inquiry, and the reason this module exists: the reply arrives as costed
// lines, and those lines pre-fill the quotation. The salesperson starts from the factory's real
// figures with every pricing rule switched off, then decides the margin. That is the whole idea
// behind "a sheet that already has a pre-quotation on it based on what the plant sent back".

const VERDICT_LABEL: Record<AssessmentVerdict, string> = {
  pending: "Awaiting plant",
  feasible: "Feasible",
  feasible_with_changes: "Feasible with changes",
  not_feasible: "Not feasible",
};

const VERDICT_TONE: Record<AssessmentVerdict, string> = {
  pending: "bg-amber-100 text-amber-800",
  feasible: "bg-pine-100 text-pine-800",
  feasible_with_changes: "bg-manifest-100 text-manifest-800",
  not_feasible: "bg-alert-50 text-alert-700",
};

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const mini =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1 text-xs font-mono focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const label = "mb-1 block text-xs font-medium text-paper-600";

export function TechnicalAssessmentsPage() {
  const navigate = useNavigate();
  const { assessments, inquiries, customers, updateAssessment, createQuotationFromAssessment, pushToast } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(assessments[0]?.id ?? null);

  const selected = assessments.find((a) => a.id === selectedId) ?? assessments[0];
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";

  const stats = useMemo(
    () => ({
      pending: assessments.filter((a) => a.verdict === "pending").length,
      answered: assessments.filter((a) => a.verdict !== "pending").length,
      quoted: assessments.filter((a) => a.quotationId).length,
    }),
    [assessments]
  );

  function patchLine(assessment: TechnicalAssessment, lineId: string, patch: Partial<AssessmentLine>) {
    updateAssessment(assessment.id, {
      lines: assessment.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    });
  }

  function addLine(assessment: TechnicalAssessment) {
    const line: AssessmentLine = {
      id: `l${Date.now().toString(36)}`,
      description: "",
      specification: "",
      material: "Nylon",
      netType: "Braided Net",
      weightPerPc: 0,
      qtyPcs: 1,
      costPerKg: 0,
    };
    updateAssessment(assessment.id, { lines: [...assessment.lines, line] });
  }

  const estimatedValue = selected
    ? selected.lines.reduce((s, l) => s + l.costPerKg * l.weightPerPc * l.qtyPcs, 0)
    : 0;

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales"]}
        eyebrow="Factory Feasibility & Costing"
        title="Technical Assessments"
        description="Feasibility and costing from the factory, used as the basis for pricing."
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Awaiting plant" value={String(stats.pending)} tone="amber" />
        <StatCard label="Answered" value={String(stats.answered)} tone="pine" />
        <StatCard label="Turned into quotations" value={String(stats.quoted)} tone="pine" />
      </div>

      {assessments.length === 0 ? (
        <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="No assessments yet" />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {assessments.map((a) => {
              const inquiry = inquiries.find((i) => i.id === a.inquiryId);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                    selected?.id === a.id
                      ? "border-pine-700 bg-pine-50"
                      : "border-paper-200 bg-white hover:border-paper-300 hover:bg-paper-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-pine-800">{a.id}</span>
                    <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-medium", VERDICT_TONE[a.verdict])}>
                      {VERDICT_LABEL[a.verdict]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-paper-700">{customerName(a.customerId)}</p>
                  <p className="truncate text-[10.5px] text-paper-400">{inquiry?.subject ?? a.inquiryId}</p>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="space-y-4">
              <Card>
                <CardHeader
                  title={selected.id}
                  eyebrow={`From ${selected.inquiryId}`}
                  subtitle={`${customerName(selected.customerId)} · requested ${formatDate(selected.requestedDate)}`}
                  action={
                    selected.quotationId ? (
                      <Link to={`/quotations/${selected.quotationId}`}>
                        <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
                          View {selected.quotationId}
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                        disabled={selected.verdict === "pending" || selected.verdict === "not_feasible" || selected.lines.length === 0}
                        onClick={() => {
                          const id = createQuotationFromAssessment(selected.id);
                          if (!id) return;
                          pushToast({
                            tone: "success",
                            title: "Quotation pre-filled",
                            description: `${id} opened at the plant's costing, pricing rules off.`,
                          });
                          navigate(`/quotations/${id}`);
                        }}
                      >
                        Generate quotation
                      </Button>
                    )
                  }
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label}>Verdict</label>
                    <select
                      value={selected.verdict}
                      onChange={(e) => {
                        const verdict = e.target.value as AssessmentVerdict;
                        updateAssessment(selected.id, {
                          verdict,
                          respondedDate: verdict === "pending" ? undefined : new Date().toISOString().slice(0, 10),
                        });
                      }}
                      className={input}
                    >
                      {(Object.keys(VERDICT_LABEL) as AssessmentVerdict[]).map((v) => (
                        <option key={v} value={v}>
                          {VERDICT_LABEL[v]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Assessed by</label>
                    <input
                      value={selected.assessedBy}
                      onChange={(e) => updateAssessment(selected.id, { assessedBy: e.target.value })}
                      className={input}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Plant remarks</label>
                    <textarea
                      value={selected.plantRemarks}
                      onChange={(e) => updateAssessment(selected.id, { plantRemarks: e.target.value })}
                      rows={3}
                      placeholder="Feasibility, substitutions, caveats…"
                      className={input}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label}>Lead time note</label>
                    <input
                      value={selected.leadTimeNote ?? ""}
                      onChange={(e) => updateAssessment(selected.id, { leadTimeNote: e.target.value })}
                      placeholder="e.g. 8 weeks, Hi-Ex stock committed until September"
                      className={input}
                    />
                  </div>
                </div>

                {selected.verdict === "pending" && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    Waiting on the plant since {formatDate(selected.requestedDate)}. Set a verdict once they reply.
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Costing sheet"
                  eyebrow="Factory figures"
                  subtitle="Carries into a quotation as the starting USD/WT. Prices remain fully editable there."
                  action={
                    <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addLine(selected)}>
                      Add line
                    </Button>
                  }
                />

                {selected.lines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-paper-300 py-8 text-center text-sm text-paper-400">
                    No costing yet. Add the plant's lines here, or paste them in when their reply arrives.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-paper-200">
                    <table className="w-full min-w-[860px] border-collapse text-xs">
                      <thead>
                        <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                          <th className="w-24 px-2 py-2">Code</th>
                          <th className="px-2 py-2">Description</th>
                          <th className="w-24 px-2 py-2 text-right">Weight/pc</th>
                          <th className="w-20 px-2 py-2 text-right">Qty</th>
                          <th className="w-24 px-2 py-2 text-right">Cost/kg</th>
                          <th className="w-28 px-2 py-2 text-right">Est. value</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {selected.lines.map((l) => (
                          <tr key={l.id} className="border-b border-paper-100 last:border-0">
                            <td className="px-2 py-1.5">
                              <input
                                value={l.specCode ?? ""}
                                onChange={(e) => patchLine(selected, l.id, { specCode: e.target.value })}
                                placeholder="N-1596"
                                className={mini}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={l.description}
                                onChange={(e) => patchLine(selected, l.id, { description: e.target.value })}
                                className={clsx(mini, "font-sans")}
                              />
                              {l.note && <p className="mt-0.5 text-[10.5px] italic text-amber-700">{l.note}</p>}
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...NON_NEGATIVE}
                                value={l.weightPerPc}
                                onChange={(e) => patchLine(selected, l.id, { weightPerPc: toNonNegative(e.target.value) })}
                                className={clsx(mini, "text-right")}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...NON_NEGATIVE_INT}
                                value={l.qtyPcs}
                                onChange={(e) => patchLine(selected, l.id, { qtyPcs: toNonNegative(e.target.value) })}
                                className={clsx(mini, "text-right")}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                {...NON_NEGATIVE}
                                value={l.costPerKg}
                                onChange={(e) => patchLine(selected, l.id, { costPerKg: toNonNegative(e.target.value) })}
                                className={clsx(mini, "text-right")}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-pine-800">
                              {formatMoney(l.costPerKg * l.weightPerPc * l.qtyPcs)}
                            </td>
                            <td className="px-1 py-1.5">
                              <button
                                onClick={() =>
                                  updateAssessment(selected.id, { lines: selected.lines.filter((x) => x.id !== l.id) })
                                }
                                className="text-paper-400 hover:text-alert-600"
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selected.lines.length > 0 && (
                  <div className="mt-3 flex justify-end gap-4 border-t border-paper-100 pt-3 text-sm">
                    <span>
                      <span className="text-paper-500">Estimated at cost:&nbsp;</span>
                      <span className="font-mono font-bold text-pine-800">{formatMoney(estimatedValue)}</span>
                    </span>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
