import type { Customer, PackingLine, PackingList, SalesOrder } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { lineTotals, linesForOrder, listOrders, piRefLine, scopeLabel, sectionTotals } from "@/lib/packing";
import fntLogo from "@/assets/fnt-logo.png";

/**
 * The printed packing list.
 *
 * Same house style as the Proforma Invoice: same letterhead, same pine header bars, same paper.
 * The document already says PACKING LIST at the top; a different colour would only make the set
 * look like it came from two companies. What differs is the content, which is where the difference
 * actually lies: counts, bale numbers and weights rather than prices and terms.
 *
 * The structure follows the factory's own sheet. A load is a container, not an order: the reference
 * line reads "P/I Nos. 32913, 32930 & 32972R1", and the body is one block per PI, each headed with
 * its container and whether that PI is going in full or as a numbered partial. Those blocks are the
 * point of the document. The customer checks their own PI's block, and the warehouse at the far
 * end checks the container's.
 *
 * Where it departs from the original is legibility, and only that. The factory's sheet is a
 * spreadsheet with the columns fighting each other: bale numbers, counts and weights run together
 * in a way that takes a second read. Same blocks, same columns, same order, but set so a line can
 * be read once.
 */
export function PackingListDocument({
  list,
  orders,
  customer,
  domId = "packing-list-sheet",
}: {
  list: PackingList;
  /** The sales orders this list covers, for the destination and the marks. */
  orders?: SalesOrder[];
  customer?: Customer;
  domId?: string;
}) {
  const refs = listOrders(list);
  const totals = sectionTotals(list.sections ?? []);
  const bales = (list.sections ?? []).reduce((n, s) => n + s.lines.length, 0);
  const destination = orders?.find((o) => o.country)?.country ?? customer?.country ?? "-";
  const orderOf = (salesOrderId: string) => orders?.find((o) => o.id === salesOrderId);

  // Rows the packer typed in without saying which order they belong to. On a single-order list they
  // are obviously that order's; on a consolidated one they belong to nothing, and they still have
  // to print, because goods in the container that appear on no block are goods nobody checks.
  const attributed = new Set(refs.flatMap((r) => linesForOrder([list], r.salesOrderId)).map((l) => l.id));
  const unattributed = (list.sections ?? []).flatMap((s) => s.lines).filter((l) => !attributed.has(l.id));

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
              <p className="font-mono text-[11px] text-paper-400">PACKING LIST</p>
              <p className="font-mono text-lg font-bold text-pine-800">{list.id}</p>
              <p className="mt-1 text-[11px] text-paper-500">
                {formatDate(list.finalizedDate ?? list.createdDate)}
              </p>
            </div>
          </div>

          {/* The reference line the customer reads first. Every PI in the container, written the way
              the factory writes it, because a consolidated load is quoted back by its PIs and never
              by the packing list number. */}
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-paper-200 pb-2 break-inside-avoid">
            <p className="text-[12px]">
              <span className="text-paper-500">Ref. No. </span>
              <span className="font-mono font-semibold text-pine-800">{piRefLine(refs)}</span>
            </p>
            <p className="text-[12px] text-paper-500">
              Date: <span className="font-medium text-paper-800">{formatDate(list.finalizedDate ?? list.createdDate)}</span>
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Consignee</p>
              <p className="text-[13px] font-semibold">
                {customer?.consignee || customer?.name || orders?.[0]?.consignee || "-"}
              </p>
              {customer?.address && <p className="text-[12px] leading-snug text-paper-500">{customer.address}</p>}
              <p className="text-[12px] text-paper-500">{destination}</p>
              <p className="mt-1 text-[12px] text-paper-500">Notify party: Same as consignee</p>
            </div>
            <div className="space-y-1 text-[12px]">
              <Row label="Shipped per vessel" value={list.remarks?.match(/MV [^,.]+/)?.[0] ?? "-"} />
              <Row label="From" value="Manila, Philippines" />
              <Row label="To" value={destination} />
              <Row label="Container no." value={list.containerNo || "-"} mono />
              <Row label="Packed by" value={list.packedBy} />
            </div>
          </div>

          {/* The marks on the outside of the bales, and what the container is carrying. Both come
              straight off the factory's sheet, which puts them side by side above the manifest. */}
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 break-inside-avoid rounded-md border border-paper-200 bg-paper-50/60 px-3 py-2.5">
            <div>
              <p className="font-mono text-[9.5px] uppercase tracking-wide text-paper-400">Shipping marks</p>
              <p className="mt-0.5 font-mono text-[12px] font-bold uppercase text-paper-800">
                {markFor(customer)}
              </p>
              <p className="font-mono text-[10.5px] text-paper-500">Specification</p>
              <p className="font-mono text-[10.5px] text-paper-500">B/No.</p>
            </div>
            <div className="border-l border-paper-200 pl-4">
              <p className="font-mono text-[9.5px] uppercase tracking-wide text-paper-400">Contents</p>
              <p className="mt-0.5 text-[12px] font-semibold text-pine-800">
                STC: {totals.pieces} {totals.pieces === 1 ? "package" : "packages"}
                <span className="font-normal text-paper-500">
                  {" "}
                  ({bales} {bales === 1 ? "bale" : "bales"} in {(list.sections ?? []).length}{" "}
                  {(list.sections ?? []).length === 1 ? "section" : "sections"})
                </span>
              </p>
              <p className="font-mono text-[11px] text-paper-600">{piRefLine(refs)}</p>
              <p className="text-[11px] text-paper-500">FOB Manila</p>
            </div>
          </div>

          {/* One block per PI. Each carries its own scope, because the same container routinely
              finishes one PI off in full while taking the second partial of another. That is
              exactly what the factory's sheet shows, and what a single list-level scope could not. */}
          {refs.map((ref) => {
            const order = orderOf(ref.salesOrderId);
            const sections = (list.sections ?? [])
              .map((s) => ({
                ...s,
                lines: s.lines.filter(
                  (l) => (l.salesOrderId ?? (refs.length === 1 ? ref.salesOrderId : undefined)) === ref.salesOrderId
                ),
              }))
              .filter((s) => s.lines.length > 0);
            const blockLines = sections.flatMap((s) => s.lines);
            if (blockLines.length === 0) return null;
            const bt = lineTotals(blockLines);
            return (
              <div key={ref.salesOrderId} className="mt-5 break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 bg-pine-800 px-2.5 py-1.5 text-white">
                  <p className="font-mono text-[11px] font-bold tracking-wide">
                    P.I. No. {ref.piRef}
                    <span className="font-normal text-pine-100"> · {scopeLabel(ref.scope, ref.partialNo)}</span>
                  </p>
                  <p className="font-mono text-[10px] text-pine-100">
                    {order?.id ?? ref.salesOrderId}
                    {order?.customerPoNo ? ` · P.O. ${order.customerPoNo}` : ""}
                  </p>
                </div>
                {sections.map((section) => (
                  <LineTable
                    key={section.id}
                    title={section.title}
                    containerNo={section.containerNo || list.containerNo}
                    lines={section.lines}
                  />
                ))}
                {/* The per-PI subtotal is the figure the customer reconciles against their own
                    order, so it sits with the block rather than only in the grand total. */}
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t-2 border-pine-700 bg-pine-50 px-2.5 py-1.5 text-[11px] font-semibold text-pine-900">
                  <span>
                    P.I. {ref.piRef} total
                  </span>
                  <span className="font-mono">
                    {bt.pieces} {bt.pieces === 1 ? "pc." : "pcs."}
                  </span>
                  <span className="font-mono">
                    {bt.bales} {bt.bales === 1 ? "bale" : "bales"}
                  </span>
                  <span className="font-mono">Net {bt.netKg.toFixed(2)} KG</span>
                  <span className="font-mono">Gross {bt.grossKg.toFixed(2)} KG</span>
                </div>
              </div>
            );
          })}

          {unattributed.length > 0 && (
            <div className="mt-5 break-inside-avoid">
              <div className="bg-paper-700 px-2.5 py-1.5">
                <p className="font-mono text-[11px] font-bold tracking-wide text-white">
                  Additional packages
                  <span className="font-normal text-paper-200"> · not booked against a P.I.</span>
                </p>
              </div>
              <LineTable title="" containerNo={list.containerNo} lines={unattributed} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-x-8 gap-y-1 break-inside-avoid border-t-2 border-pine-800 pt-2 text-[12px] font-semibold text-paper-800">
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

/**
 * One section's rows.
 *
 * The container banner sits inside the table, as it does on the factory's sheet: it is a row of the
 * manifest, not a heading above it.
 */
function LineTable({
  title,
  containerNo,
  lines,
}: {
  title: string;
  containerNo?: string;
  lines: PackingLine[];
}) {
  const totals = lineTotals(lines);
  return (
    <table className="w-full table-fixed border-collapse text-[11px]">
      <thead>
        {(title || containerNo) && (
          <tr>
            <td colSpan={6} className="bg-paper-100 px-2 py-1 text-[10.5px] font-semibold uppercase text-paper-800">
              {title}
              {containerNo && (
                <span className="ml-2 font-mono font-normal normal-case text-paper-500">
                  Container No. {containerNo}
                </span>
              )}
            </td>
          </tr>
        )}
        <tr className="bg-pine-700 text-left font-mono text-[9.5px] font-semibold uppercase tracking-wide text-white">
          {/* Left-aligned with its own gutter. Right-aligning a two-character number in a narrow
              column pushed it against the specification, so the two read as one string. The empty
              space belongs between them, not before the qty. */}
          <th className="w-16 py-1.5 pl-2 pr-4">Qty</th>
          <th className="py-1.5 px-2">Specification</th>
          <th className="w-14 py-1.5 px-2 text-right">Bales</th>
          <th className="w-20 py-1.5 px-2 text-right">Bale No.</th>
          <th className="w-20 py-1.5 px-2 text-right">Net / Bale</th>
          <th className="w-20 py-1.5 px-2 text-right">Net Wt.</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr>
            <td colSpan={6} className="py-5 text-center text-[11px] text-paper-400">
              Nothing packed in this section.
            </td>
          </tr>
        )}
        {lines.map((line, idx) => (
          <tr key={line.id} className="break-inside-avoid border-b border-paper-100">
            <td className="py-1 pl-2 pr-4 font-mono">
              {line.qtyPcs} <span className="text-[9.5px] text-paper-400">{line.qtyPcs === 1 ? "pc." : "pcs."}</span>
            </td>
            {/* Wraps rather than truncates. A net's specification is the whole point of the row.
                "NET-72-210-14-35…" tells a receiving clerk nothing, and the column is not so narrow
                that a second line costs anything. */}
            <td className="py-1 px-2 leading-tight text-pine-700">
              <span className="font-mono">{line.itemCode}</span>{" "}
              <span className="text-paper-700">{line.description}</span>
            </td>
            <td className="py-1 px-2 text-right font-mono">1</td>
            <td className="py-1 px-2 text-right font-mono text-paper-500">{line.baleNo || idx + 1}</td>
            <td className="py-1 px-2 text-right font-mono text-paper-500">
              {line.qtyPcs > 0 ? (line.netWeightKg / line.qtyPcs).toFixed(2) : "-"}
            </td>
            <td className="py-1 px-2 text-right font-mono">{line.netWeightKg.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="break-inside-avoid border-t border-paper-300 text-[10.5px] font-semibold text-paper-700">
          <td className="py-1 pl-2 pr-4 font-mono">{totals.pieces}</td>
          <td className="py-1 px-2 text-paper-500">{totals.pieces === 1 ? "pc." : "pcs."}</td>
          <td className="py-1 px-2 text-right font-mono">{totals.bales}</td>
          <td className="py-1 px-2 text-right text-paper-500">{totals.bales === 1 ? "bale" : "bales"}</td>
          <td className="py-1 px-2 text-right font-mono text-paper-400">
            {totals.grossKg > 0 ? `${totals.grossKg.toFixed(2)} gross` : ""}
          </td>
          <td className="py-1 px-2 text-right font-mono">{totals.netKg.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * The mark stencilled on the bales.
 *
 * The factory abbreviates the consignee, writing "K.T.I." for KTI Company Limited. Initials of the
 * significant words get there for most names, and the full name is right above it either way.
 */
function markFor(customer?: Customer): string {
  const name = customer?.consignee || customer?.name;
  if (!name) return "-";
  const skip = new Set(["co", "ltd", "inc", "corp", "company", "limited", "the", "and", "sa", "as", "of"]);
  const parts = name
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !skip.has(w.toLowerCase()));
  if (parts.length === 0) return name.toUpperCase();
  if (parts.length === 1) return parts[0].toUpperCase();
  return parts.map((w) => w[0].toUpperCase()).join(".") + ".";
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-paper-500">{label}</span>
      <span className={`${mono ? "font-mono" : ""} font-medium`}>{value}</span>
    </div>
  );
}
