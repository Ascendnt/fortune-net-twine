import { Fragment } from "react";
import type { Customer, InspectionRecord, PackingList, SalesOrder } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { groupInspectionLines, settleInspection, weightVerdict } from "@/lib/inspectionPricing";
import { listOrders, piRefLine } from "@/lib/packing";
import fntLogo from "@/assets/fnt-logo.png";

/**
 * The printed inspection report.
 *
 * Despite the name this is not a quality-control document and nothing on it is a pass or a fail. It
 * is the listing of what is about to be shipped, sent to the customer before the container goes so
 * they can counter-check it against their own order and say they are happy for it to leave. What
 * they are checking is mostly the weights: they are billed for the kilos actually shipped, so the
 * bale-by-bale figures here are the ones the balance invoice will be built from.
 *
 * The layout is the factory's own: a header identifying the customer and the destination, then the
 * goods written specification by specification, with every bale listed beneath by number, net and
 * gross, and a subtotal under each. The Remarks block at the foot is the part that gets read
 * closely, because it states the computed weight against the measured one and says in a word which
 * way the load came out.
 *
 * Values are off by default. The customer is being asked to confirm a manifest, not to re-agree a
 * price, and the sheet reads faster without the money on it. The factory's own copy does carry a
 * rate and an amount per specification, so `showValues` puts them back.
 */
export function InspectionReportDocument({
  record,
  list,
  orders,
  customer,
  showValues = false,
  domId = "inspection-report-sheet",
}: {
  record: InspectionRecord;
  /** The load this report covers, for the container and the PI references. */
  list?: PackingList;
  orders?: SalesOrder[];
  customer?: Customer;
  /** Print the agreed rate and the amount per specification, as the factory's own copy does. */
  showValues?: boolean;
  domId?: string;
}) {
  const lines = record.lines ?? [];
  const groups = groupInspectionLines(lines);
  const settlement = settleInspection(lines);
  const verdict = weightVerdict(settlement);
  const refs = list ? listOrders(list) : [];
  const currency = orders?.[0]?.currency;
  const destination = orders?.find((o) => o.country)?.country ?? customer?.country ?? "-";
  const poNos = [...new Set((orders ?? []).map((o) => o.customerPoNo).filter(Boolean))].join(", ");

  return (
    <div className="overflow-x-auto">
      <div
        id={domId}
        className="print-color-exact relative mx-auto min-w-[680px] max-w-[860px] overflow-hidden bg-white p-8 font-sans text-[13px] text-paper-900 print:min-w-0 print:max-w-none print:w-full print:p-0"
      >
        <div className="relative">
          <div className="flex items-start justify-between border-b-2 border-pine-800 pb-4 break-inside-avoid">
            <div className="flex items-center gap-3">
              <img src={fntLogo} alt="Fortune Net & Twine" className="h-14 w-14 object-contain" />
              <div>
                <p className="text-[15px] font-bold leading-tight text-pine-900">
                  Fortune Net &amp; Twine Manufacturing Corp.
                </p>
                <p className="text-[11px] leading-tight text-paper-500">
                  70 D. Bonifacio St., Bo. Canumay, Valenzuela, Metro Manila, Philippines
                </p>
                <p className="text-[11px] leading-tight text-paper-500">
                  42 Sto. Domingo St., 1100 Quezon City, Metro Manila, Philippines
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] text-paper-400">INSPECTION REPORT</p>
              <p className="font-mono text-lg font-bold text-pine-800">{record.id}</p>
              <p className="mt-1 text-[11px] text-paper-500">
                {formatDate(record.confirmedDate ?? record.sentDate ?? new Date().toISOString().slice(0, 10))}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
            <div className="space-y-1 text-[12px]">
              <Row label="Customer" value={customer?.consignee || customer?.name || "-"} />
              <Row label="P.O. No." value={poNos || "-"} mono />
              <Row label="Destination" value={destination} />
            </div>
            <div className="space-y-1 text-[12px]">
              <Row label="Loading" value="Manila, Philippines" />
              <Row label="Shipment" value={list?.containerNo || "-"} mono />
              <Row label="Ref. No." value={refs.length ? piRefLine(refs) : "-"} mono />
            </div>
          </div>

          {/* What the customer is being asked to do. Said plainly at the top, because the document's
              name suggests a quality certificate and it is not one. A customer who reads it as a
              QC pass will not check the weights, which is the whole reason it was sent. */}
          <div className="mt-4 break-inside-avoid rounded-md border border-manifest-200 bg-manifest-50/60 px-3 py-2 text-[11.5px] leading-snug text-paper-700">
            <span className="font-semibold text-paper-800">For your confirmation. </span>
            Listed below are the goods packed for this shipment with their measured net and gross
            weights. Please counter-check against your order and confirm that they may be shipped.
            {list && (
              <>
                {" "}
                Packing list <span className="font-mono text-pine-800">{list.id}</span>.
              </>
            )}
          </div>

          {refs.length > 1 && (
            <p className="mt-3 text-[11px] text-paper-500">
              This container consolidates {refs.length} of your orders. Each is listed separately below.
            </p>
          )}

          {/* One block per PI, then per specification within it, then the bales. The nesting is the
              document: a customer with three orders in one container reads only their own block,
              and the bale numbers are what they tick off when it lands. */}
          {(refs.length ? refs.map((r) => r.salesOrderId) : [...new Set(lines.map((l) => l.salesOrderId))]).map(
            (salesOrderId) => {
              const ref = refs.find((r) => r.salesOrderId === salesOrderId);
              const mine = groups.filter((g) => g.salesOrderId === salesOrderId);
              if (mine.length === 0) return null;
              const sub = settleInspection(mine.flatMap((g) => g.bales));
              return (
                <div key={salesOrderId || "unassigned"} className="mt-5 break-inside-avoid">
                  {/* Pine-700, the same navy the PI's table header is set in. The darker pine-800
                      this used to carry read as black on paper and made the set look like it came
                      from two companies. The column header below steps one shade lighter so the
                      two bars stay distinguishable. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 bg-pine-700 px-2.5 py-1.5 text-white">
                    <p className="font-mono text-[11px] font-bold tracking-wide">
                      {ref ? `P.I. No. ${ref.piRef}` : "Additional packages"}
                    </p>
                    <p className="font-mono text-[10px] text-pine-100">{salesOrderId || "not booked to an order"}</p>
                  </div>

                  <table className="w-full table-fixed border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-pine-600 text-left font-mono text-[9.5px] font-semibold uppercase tracking-wide text-white">
                        <th className="w-16 py-1.5 pl-2 pr-4">Quantity</th>
                        <th className="py-1.5 px-2">Specification</th>
                        <th className="w-20 py-1.5 px-2 text-right">Bale No.</th>
                        <th className="w-24 py-1.5 px-2 text-right">Net Wt. Kgs.</th>
                        <th className="w-24 py-1.5 px-2 text-right">Gross Wt. Kgs.</th>
                        {showValues && <th className="w-20 py-1.5 px-2 text-right">Rate</th>}
                        {showValues && <th className="w-24 py-1.5 px-2 text-right">Amount</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {mine.map((group) => (
                        <Fragment key={group.key}>
                          {group.bales.map((bale, idx) => (
                            <tr key={bale.id} className="break-inside-avoid">
                              {/* Quantity and specification are written once against the first
                                  bale, as on the factory's sheet. Repeating them down every bale of
                                  a fourteen-bale line turns the block into a wall and hides where
                                  one specification ends and the next begins. */}
                              <td className="py-1 pl-2 pr-4 align-top font-mono">
                                {idx === 0 ? (
                                  <>
                                    {group.qtyPcs}{" "}
                                    <span className="text-[9.5px] text-paper-400">
                                      {group.qtyPcs === 1 ? "pc." : "pcs."}
                                    </span>
                                  </>
                                ) : (
                                  ""
                                )}
                              </td>
                              <td className="py-1 px-2 align-top leading-tight">
                                {idx === 0 && (
                                  <>
                                    <span className="font-mono text-pine-700">{group.itemCode}</span>{" "}
                                    <span className="text-paper-700">{group.description}</span>
                                  </>
                                )}
                              </td>
                              <td className="py-1 px-2 text-right font-mono text-paper-500">{bale.baleNo}</td>
                              <td className="py-1 px-2 text-right font-mono">{bale.netWeightKg.toFixed(2)}</td>
                              <td className="py-1 px-2 text-right font-mono text-paper-600">
                                {bale.grossWeightKg.toFixed(2)}
                              </td>
                              {showValues && <td />}
                              {showValues && <td />}
                            </tr>
                          ))}
                          <tr className="break-inside-avoid border-y border-paper-200 text-[10.5px] font-semibold text-paper-800">
                            <td />
                            <td className="py-1 px-2 text-right text-[10px] font-normal uppercase tracking-wide text-paper-400">
                              {group.bales.length} {group.bales.length === 1 ? "bale" : "bales"}
                            </td>
                            <td />
                            <td className="py-1 px-2 text-right font-mono">{group.netWeightKg.toFixed(2)}</td>
                            <td className="py-1 px-2 text-right font-mono">{group.grossWeightKg.toFixed(2)}</td>
                            {showValues && (
                              <td className="py-1 px-2 text-right font-mono font-normal text-paper-500">
                                {group.pricePerKg ? formatMoney(group.pricePerKg, currency) : "-"}
                              </td>
                            )}
                            {showValues && (
                              <td className="py-1 px-2 text-right font-mono text-pine-800">
                                {formatMoney(group.actualAmount, currency)}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                    {refs.length > 1 && (
                      <tfoot>
                        <tr className="break-inside-avoid bg-pine-50 text-[10.5px] font-semibold text-pine-900">
                          <td colSpan={3} className="py-1 pl-2 pr-2">
                            {ref ? `P.I. ${ref.piRef} total` : "Total"}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">{sub.netWeightKg.toFixed(2)}</td>
                          <td className="py-1 px-2 text-right font-mono">{sub.grossWeightKg.toFixed(2)}</td>
                          {showValues && <td />}
                          {showValues && (
                            <td className="py-1 px-2 text-right font-mono">
                              {formatMoney(sub.actualValue, currency)}
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              );
            }
          )}

          {lines.length === 0 && (
            <p className="mt-6 rounded-md border border-dashed border-paper-300 py-8 text-center text-[12px] text-paper-400">
              Nothing has been weighed against this report yet.
            </p>
          )}

          {showValues && (
            <div className="mt-3 flex items-center justify-end gap-6 break-inside-avoid border-t-2 border-pine-800 pt-2 text-[12px] font-semibold text-paper-800">
              <span>Total value:</span>
              <span className="font-mono text-[13px] text-pine-800">
                {formatMoney(settlement.actualValue, currency)}
              </span>
            </div>
          )}

          {/* The Remarks block, and the reason the report is worth sending. Four figures and a word:
              what the goods were computed to weigh, what they actually weigh gross and net, and
              which way the difference went. */}
          <div className="mt-5 break-inside-avoid rounded-md border border-paper-300 px-3.5 py-3">
            <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-paper-500">Remarks</p>
            <dl className="space-y-1 text-[12px]">
              <Figure n={1} label="Computed weight" value={settlement.computedWeightKg} />
              <Figure n={2} label="Net weight" value={settlement.netWeightKg} />
              <Figure n={3} label="Gross weight" value={settlement.grossWeightKg} />
              <Figure
                n={4}
                label="Weight difference"
                value={settlement.weightDifferenceKg}
                // Negative weights are written in brackets, as they are on the factory's sheet and
                // on every other document an export clerk handles.
                render={(v) => (v < 0 ? `(${Math.abs(v).toFixed(2)})` : v.toFixed(2))}
                tone={verdict === "On weight" ? "flat" : settlement.weightDifferenceKg < 0 ? "down" : "up"}
              />
            </dl>
            <div className="mt-2 flex items-center gap-3 border-t border-paper-200 pt-2 text-[12px]">
              <span className="font-mono font-semibold text-paper-700">
                {settlement.weightDifferencePct >= 0 ? "+" : ""}
                {settlement.weightDifferencePct.toFixed(2)}%
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  verdict === "On weight"
                    ? "bg-paper-100 text-paper-600"
                    : verdict === "Underweight"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-pine-100 text-pine-800"
                }`}
              >
                {verdict}
              </span>
            </div>
          </div>

          {record.remarks && (
            <div className="mt-3 whitespace-pre-line break-inside-avoid rounded-md bg-paper-50 px-3 py-2 text-[11.5px] text-paper-600">
              {record.remarks}
            </div>
          )}

          {/* Two signatures, not one. The factory's copy is signed by whoever prepared it; the point
              of sending it is the line underneath, which is the customer saying it may ship. */}
          <div className="mt-10 flex flex-wrap items-end justify-between gap-8 break-inside-avoid text-[11px] text-paper-500">
            <div className="text-center">
              <p className="mb-8 font-semibold text-paper-700">Fortune Net &amp; Twine Mfg. Corp.</p>
              <p className="border-t border-paper-300 px-8 pt-1 font-medium text-paper-700">
                {record.preparedBy || "-"}
              </p>
              <p className="text-[10px] text-paper-400">Prepared by</p>
            </div>
            <div className="text-center">
              <p className="mb-8 font-semibold text-paper-700">{customer?.consignee || customer?.name || "Customer"}</p>
              <p className="border-t border-paper-300 px-8 pt-1 font-medium text-paper-700">
                {record.result === "confirmed" ? formatDate(record.confirmedDate) : " "}
              </p>
              <p className="text-[10px] text-paper-400">Confirmed for shipment · date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Figure({
  n,
  label,
  value,
  render,
  tone = "flat",
}: {
  n: number;
  label: string;
  value: number;
  render?: (v: number) => string;
  tone?: "flat" | "up" | "down";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="flex-1 text-paper-600">
        <span className="mr-1.5 text-paper-400">{n})</span>
        {label}
        <span className="mx-2 inline-block flex-1 border-b border-dotted border-paper-300 align-baseline" />
      </dt>
      <dd
        className={`w-28 text-right font-mono font-semibold ${
          tone === "down" ? "text-amber-700" : tone === "up" ? "text-pine-700" : "text-paper-800"
        }`}
      >
        {(render ?? ((v: number) => v.toFixed(2)))(value)}
      </dd>
      <span className="w-8 text-[11px] text-paper-400">Kgs.</span>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-paper-500">{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-right font-medium`}>{value}</span>
    </div>
  );
}
