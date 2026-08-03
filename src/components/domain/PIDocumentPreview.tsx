import { Fragment } from "react";
import type { Quotation, Customer, QuotationLineItem } from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/format";
import fntLogo from "@/assets/fnt-logo.png";

// Consecutive lines that share the exact same specification text are printed as one group: the
// spec sentence once (as the factory's own PI template does — the source client's real PIs write
// out the composed spec once, then list each catalog size/code underneath it), rather than
// repeating the same long spec string on every row.
function groupBySpecification(items: QuotationLineItem[]): { spec: string; items: QuotationLineItem[] }[] {
  const groups: { spec: string; items: QuotationLineItem[] }[] = [];
  for (const li of items) {
    const last = groups[groups.length - 1];
    if (last && last.spec === li.specification) {
      last.items.push(li);
    } else {
      groups.push({ spec: li.specification, items: [li] });
    }
  }
  return groups;
}

// Item code + description is forced onto a single line (no wrap) so every catalog item stays
// one row, matching the factory's real PI layout — but a long description at a fixed font size
// would just overflow the column instead of wrapping. Stepping the font size down by length keeps
// it on one line at any reasonable length while staying legible (never below 9px).
function descFontClass(text: string): string {
  const len = text.length;
  if (len <= 45) return "text-[11px]";
  if (len <= 60) return "text-[10.5px]";
  if (len <= 75) return "text-[10px]";
  if (len <= 90) return "text-[9.5px]";
  return "text-[9px]";
}

export function PIDocumentPreview({ q, customer }: { q: Quotation; customer?: Customer }) {
  // The export client master shows PIs actually go out under one of two legal entities depending
  // on the account, not a single fixed name — falls back to the historical default when a customer
  // record has no letterhead set (e.g. seed customers predating this field).
  const issuingEntity = customer?.letterhead ?? "FORTUNE NET & TWINE MFG. CORP.";
  const attn = q.attentionContact || customer?.contactPerson;
  const groups = groupBySpecification(q.items);
  const totalWeightKg = q.items.reduce((s, li) => s + li.weightKg, 0);
  const grandTotal = q.items.reduce((s, li) => s + li.totalPrice, 0) + q.freight - q.discount + q.tax;
  let itemNo = 0;

  return (
    <div id="pi-document-root" className="overflow-x-auto">
      <div className="relative mx-auto min-w-[640px] max-w-[820px] overflow-hidden bg-white p-8 font-sans text-[13px] text-paper-900 print:min-w-0 print:max-w-none print:w-full print:p-0">
        <div className="mesh-lattice pointer-events-none absolute inset-0 opacity-40 print:hidden" />
        <div className="relative">
        <div className="flex items-start justify-between border-b-2 border-pine-800 pb-4 break-inside-avoid">
          <div className="flex items-center gap-3">
            <img src={fntLogo} alt="Fortune Net & Twine" className="h-14 w-14 object-contain" />
            <div>
              <p className="text-[15px] font-bold leading-tight text-pine-900">
                {issuingEntity === "NETTEX MFG. AND EXPORT CORP."
                  ? "Nettex Mfg. and Export Corp."
                  : "Fortune Net & Twine Manufacturing Corp."}
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
            <p className="font-mono text-[11px] text-paper-400">PROFORMA INVOICE</p>
            <p className="font-mono text-lg font-bold text-pine-800">{q.id}</p>
            {q.revisionNo > 0 && (
              <p className="font-mono text-[11px] text-vermillion-600">Revision {q.revisionNo}</p>
            )}
            <p className="mt-1 text-[11px] text-paper-500">{formatDate(q.issueDate)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Messrs.</p>
            <p className="text-[13px] font-semibold">{customer?.name ?? q.consignee}</p>
            <p className="text-[12px] text-paper-500">{customer?.address}</p>
            {attn && <p className="mt-1 text-[12px] text-paper-500">Attn: {attn}</p>}
          </div>
          <div className="space-y-1 text-[12px]">
            <Row label="Shipment" value={formatDate(q.estimatedShipmentDate)} />
            <Row label="Payment" value={q.paymentTerms} />
            <Row label="Validity" value={`${q.validityDays} days from issue`} />
            <Row label="MOQ" value={q.moq} />
            <Row label="Lead time" value={`${q.leadTimeWeeks} weeks from confirmation`} />
          </div>
        </div>

        <p className="mt-5 border-b border-paper-200 pb-1 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-pine-800">
          Items
        </p>
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead>
            <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
              <th className="w-10 py-1.5 pl-2 text-center">Item No.</th>
              <th className="py-1.5 px-2">Item Specification</th>
              <th className="w-14 py-1.5 px-2 text-right">UOM</th>
              <th className="w-12 py-1.5 px-2 text-right">Qty</th>
              <th className="w-20 py-1.5 px-2 text-right">U/P</th>
              <th className="w-24 py-1.5 px-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <Fragment key={gi}>
                <tr className="break-inside-avoid bg-paper-100">
                  <td className="py-1 pl-2" />
                  <td className="truncate py-1 px-2 font-semibold uppercase leading-tight text-paper-900">{g.spec}</td>
                  <td className="py-1 px-2 text-right font-mono text-[10px] text-paper-500">KGS</td>
                  <td className="py-1 px-2 text-right font-mono text-[10px] text-paper-500">PCS</td>
                  <td className="py-1 px-2" />
                  <td className="py-1 px-2" />
                </tr>
                {g.items.map((li) => {
                  itemNo += 1;
                  const label = `${li.itemCode} ${li.description}`;
                  return (
                    <tr key={li.id} className="break-inside-avoid border-b border-paper-100">
                      <td className="py-1 pl-2 text-center font-mono text-paper-500">{itemNo}</td>
                      <td
                        className={`whitespace-nowrap overflow-hidden py-1 px-2 font-medium leading-tight text-pine-700 ${descFontClass(label)}`}
                      >
                        {label}
                      </td>
                      <td className="py-1 px-2 text-right font-mono">{li.weightKg.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-mono">{li.qtyPcs}</td>
                      <td className="py-1 px-2 text-right font-mono">{formatMoney(li.unitPrice, q.currency)}</td>
                      <td className="py-1 px-2 text-right font-mono font-semibold">
                        {formatMoney(li.totalPrice, q.currency)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="break-inside-avoid border-t-2 border-pine-800 font-semibold text-paper-800">
              <td className="py-2 pl-2 text-right" colSpan={2}>
                Total Weight:
              </td>
              <td className="whitespace-nowrap py-2 px-2 text-right font-mono text-[10.5px]">
                {totalWeightKg.toFixed(2)} KGS
              </td>
              <td className="py-2 px-2 text-right" colSpan={2}>
                Grand Total:
              </td>
              <td className="whitespace-nowrap py-2 px-2 text-right font-mono text-[13px] text-pine-800">
                {formatMoney(grandTotal, q.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {q.remarks && (
          <div className="mt-4 break-inside-avoid rounded-md bg-paper-50 px-3 py-2 text-[11.5px] text-paper-600">
            <span className="font-semibold text-paper-700">Remarks: </span>
            {q.remarks}
          </div>
        )}

        <div className="mt-8 flex justify-between break-inside-avoid text-[11px] text-paper-400">
          <div>
            <p className="mb-6">Prepared by:</p>
            <p className="border-t border-paper-300 pt-1">{q.assignedSalesperson}</p>
          </div>
          <div className="text-right">
            <p className="mb-6">{q.approver ? "Approved by:" : "Pending approval"}</p>
            <p className="border-t border-paper-300 pt-1">{q.approver ?? "—"}</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-paper-500">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${bold ? "text-[14px] font-bold text-pine-800" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
