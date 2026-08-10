import type { Customer, PackingList, SalesOrder } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { sectionTotals } from "@/lib/packing";
import fntLogo from "@/assets/fnt-logo.png";

/**
 * The printed packing list.
 *
 * Same house style as the Proforma Invoice — same letterhead, same pine header bars, same paper.
 * The document already says PACKING LIST at the top; a different colour would only make the set
 * look like it came from two companies. What differs is the content, which is where the difference
 * actually lies: counts, bale numbers and weights rather than prices and terms.
 *
 * Structure follows the factory's own sheet: blocks labelled with the PI they cover and whether
 * that PI is going in full or as a numbered partial, then the lines, then a bale-count subtotal.
 */
export function PackingListDocument({
  list,
  order,
  customer,
  quotationRef,
  partialNo,
  domId = "packing-list-sheet",
}: {
  list: PackingList;
  order?: SalesOrder;
  customer?: Customer;
  /** The PI this list packs against, as it is written on the customer's copy. */
  quotationRef?: string;
  /** Which partial this is, when the order ships in several. 1-based; ignored for full shipments. */
  partialNo?: number;
  domId?: string;
}) {
  const totals = sectionTotals(list.sections ?? []);
  // The factory writes partials by ordinal — "2nd-Partial Shipment" — because on a document
  // covering several PIs that is the only way to tell one load from another.
  const scopeLabel =
    list.scope === "full"
      ? "Full Shipment"
      : list.scope === "final"
        ? "Final Shipment"
        : `${ordinal(partialNo ?? 1)}-Partial Shipment`;

  return (
    <div className="overflow-x-auto">
      <div
        id={domId}
        className="print-color-exact relative mx-auto min-w-[640px] max-w-[820px] overflow-hidden bg-white p-8 font-sans text-[13px] text-paper-900 print:min-w-0 print:max-w-none print:w-full print:p-0"
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
              <p className="font-mono text-[11px] text-paper-400">PACKING LIST</p>
              <p className="font-mono text-lg font-bold text-pine-800">{list.id}</p>
              <p className="mt-1 text-[11px] text-paper-500">
                {formatDate(list.finalizedDate ?? list.createdDate)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Consignee</p>
              <p className="text-[13px] font-semibold">{customer?.name ?? order?.consignee ?? "—"}</p>
              <p className="text-[12px] text-paper-500">{customer?.address}</p>
              {order?.country && <p className="text-[12px] text-paper-500">{order.country}</p>}
              <p className="mt-1 text-[12px] text-paper-500">Notify party: Same as consignee</p>
            </div>
            <div className="space-y-1 text-[12px]">
              <Row label="Ref. No." value={quotationRef ?? order?.quotationId ?? list.salesOrderId} mono />
              <Row label="Sales order" value={order?.id ?? list.salesOrderId} mono />
              <Row label="From" value="Manila, Philippines" />
              <Row label="To" value={order?.country ?? "—"} />
              <Row label="Packed by" value={list.packedBy} />
            </div>
          </div>

          {/* What the container is carrying, in the words the factory's own sheet uses. */}
          <div className="mt-4 border-y border-paper-200 py-2 text-center break-inside-avoid">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-pine-800">
              {scopeLabel} · {totals.pieces} {totals.pieces === 1 ? "package" : "packages"} ·{" "}
              {(list.sections ?? []).length} {(list.sections ?? []).length === 1 ? "section" : "sections"}
            </p>
            <p className="mt-0.5 text-[11px] text-paper-500">
              {quotationRef ? `P.I. No. ${quotationRef} · ` : ""}FOB Manila
            </p>
          </div>

          {(list.sections ?? []).map((section) => {
            const st = sectionTotals([section]);
            return (
              <div key={section.id} className="mt-5 break-inside-avoid">
                {/* Sections are how the goods are actually grouped in the container, so the header
                    is a real divider rather than decoration. */}
                <table className="w-full table-fixed border-collapse text-[11px]">
                  <thead>
                    {/* The container/section banner sits inside the table, as it does on the
                        factory's sheet: it is a row of the manifest, not a heading above it. */}
                    <tr>
                      <td colSpan={6} className="bg-paper-100 py-1 px-2 font-semibold uppercase text-[10.5px] text-paper-800">
                        {section.title}
                      </td>
                    </tr>
                    <tr className="bg-pine-700 text-left font-mono text-[9.5px] font-semibold uppercase tracking-wide text-white">
                      {/* Left-aligned with its own gutter. Right-aligning a two-character number in
                          a narrow column pushed it against the specification, so the two read as
                          one string. The empty space belongs between them, not before the qty. */}
                      <th className="w-16 py-1.5 pl-2 pr-4">Qty</th>
                      <th className="py-1.5 px-2">Specification</th>
                      <th className="w-16 py-1.5 px-2 text-right">Bales</th>
                      <th className="w-20 py-1.5 px-2 text-right">Bale No.</th>
                      <th className="w-20 py-1.5 px-2 text-right">Net / Bale</th>
                      <th className="w-20 py-1.5 px-2 text-right">Net Wt.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.lines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-5 text-center text-[11px] text-paper-400">
                          Nothing packed in this section.
                        </td>
                      </tr>
                    )}
                    {section.lines.map((line, idx) => (
                      <tr key={line.id} className="break-inside-avoid border-b border-paper-100">
                        <td className="py-1 pl-2 pr-4 font-mono">{line.qtyPcs}</td>
                        {/* Wraps rather than truncates. A net's specification is the whole point of
                            the row — "NET-72-210-14-35…" tells a receiving clerk nothing, and the
                            column is not so narrow that a second line costs anything. */}
                        <td className="py-1 px-2 leading-tight text-pine-700">
                          <span className="font-mono">{line.itemCode}</span>{" "}
                          <span className="text-paper-700">{line.description}</span>
                        </td>
                        <td className="py-1 px-2 text-right font-mono">{line.qtyPcs}</td>
                        <td className="py-1 px-2 text-right font-mono text-paper-500">{idx + 1}</td>
                        <td className="py-1 px-2 text-right font-mono text-paper-500">
                          {line.qtyPcs > 0 ? (line.netWeightKg / line.qtyPcs).toFixed(2) : "—"}
                        </td>
                        <td className="py-1 px-2 text-right font-mono">{line.netWeightKg.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="break-inside-avoid border-t border-paper-300 text-[10.5px] font-semibold text-paper-700">
                      <td className="py-1 pl-2 pr-4 font-mono">{st.pieces}</td>
                      <td className="py-1 px-2 text-paper-500">pcs</td>
                      <td className="py-1 px-2 text-right font-mono">{st.pieces}</td>
                      <td className="py-1 px-2 text-right text-paper-500">bales</td>
                      <td className="py-1 px-2 text-right font-mono text-paper-400">
                        {st.grossKg > 0 ? `${st.grossKg.toFixed(2)} gross` : ""}
                      </td>
                      <td className="py-1 px-2 text-right font-mono">{st.netKg.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}

          <div className="mt-4 flex items-center justify-end gap-8 break-inside-avoid border-t-2 border-pine-800 pt-2 text-[12px] font-semibold text-paper-800">
            <span>Total packages:</span>
            <span className="font-mono">{totals.pieces}</span>
            <span>Total net weight:</span>
            <span className="font-mono">{totals.netKg.toFixed(2)} KG</span>
            <span>Total gross weight:</span>
            <span className="font-mono text-[13px] text-pine-800">{totals.grossKg.toFixed(2)} KG</span>
          </div>

          {list.remarks && (
            <div className="mt-4 whitespace-pre-line break-inside-avoid rounded-md bg-paper-50 px-3 py-2 text-[11.5px] text-paper-600">
              <span className="font-semibold text-paper-700">Marks and remarks: </span>
              {list.remarks}
            </div>
          )}

          {/* Signed the way the factory signs it: the company, then the person, then their role. */}
          <div className="mt-10 flex justify-end break-inside-avoid text-[11px] text-paper-500">
            <div className="text-center">
              <p className="mb-8 font-semibold text-paper-700">Fortune Net &amp; Twine Mfg. Corp.</p>
              <p className="border-t border-paper-300 px-8 pt-1 font-medium text-paper-700">{list.packedBy}</p>
              <p className="text-[10px] text-paper-400">OIC Documentation</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 1 → 1st, 2 → 2nd, and so on. The factory numbers its partials in words on the document. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-paper-500">{label}</span>
      <span className={`${mono ? "font-mono" : ""} font-medium`}>{value}</span>
    </div>
  );
}
