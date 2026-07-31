import type { Quotation, Customer } from "@/lib/types";
import { formatMoney, formatWeight, formatDate } from "@/lib/format";
import fntLogo from "@/assets/fnt-logo.png";

export function PIDocumentPreview({ q, customer }: { q: Quotation; customer?: Customer }) {
  const subtotal = q.items.reduce((s, li) => s + li.totalPrice, 0);
  const totalWeight = q.items.reduce((s, li) => s + li.weightKg, 0);
  const total = subtotal + q.freight - q.discount + q.tax;
  const deposit = total * (q.depositPercent / 100);
  const balance = total - deposit;

  return (
    <div className="relative mx-auto max-w-[820px] overflow-hidden rounded-lg border border-paper-200 bg-white p-8 font-sans text-[13px] text-paper-900 shadow-[var(--shadow-panel)] print:shadow-none">
      <div className="mesh-lattice pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative">
        <div className="flex items-start justify-between border-b-2 border-pine-800 pb-4">
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
            <p className="font-mono text-[11px] text-paper-400">PROFORMA INVOICE</p>
            <p className="font-mono text-lg font-bold text-pine-800">{q.id}</p>
            {q.revisionNo > 0 && (
              <p className="font-mono text-[11px] text-vermillion-600">Revision {q.revisionNo}</p>
            )}
            <p className="mt-1 text-[11px] text-paper-500">{formatDate(q.issueDate)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Messrs.</p>
            <p className="text-[13px] font-semibold">{customer?.name ?? q.consignee}</p>
            <p className="text-[12px] text-paper-500">{customer?.address}</p>
            <p className="mt-1 text-[12px] text-paper-500">Attn: {customer?.contactPerson}</p>
          </div>
          <div className="space-y-1 text-[12px]">
            <Row label="Shipment" value={formatDate(q.estimatedShipmentDate)} />
            <Row label="Payment" value={q.paymentTerms} />
            <Row label="Validity" value={`${q.validityDays} days from issue`} />
            <Row label="MOQ" value={q.moq} />
            <Row label="Lead time" value={`${q.leadTimeWeeks} weeks from confirmation`} />
          </div>
        </div>

        <table className="mt-5 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-pine-800 bg-pine-50/60 text-left font-mono text-[10.5px] uppercase tracking-wide text-pine-800">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2">Description / Specification</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2 text-right">Weight</th>
              <th className="py-1.5 pr-2 text-right">Unit Price</th>
              <th className="py-1.5 pl-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.items.map((li) => (
              <tr key={li.id} className="border-b border-paper-100">
                <td className="py-1.5 pr-2 align-top font-mono text-[11px] text-paper-500">{li.itemCode}</td>
                <td className="py-1.5 pr-2 align-top">
                  <p className="font-medium">{li.description}</p>
                  <p className="text-[11px] text-paper-400">{li.specification}</p>
                </td>
                <td className="py-1.5 pr-2 text-right align-top font-mono">
                  {li.qtyPcs} {li.unit}
                </td>
                <td className="py-1.5 pr-2 text-right align-top font-mono">{formatWeight(li.weightKg)}</td>
                <td className="py-1.5 pr-2 text-right align-top font-mono">{formatMoney(li.unitPrice, q.currency)}</td>
                <td className="py-1.5 pl-2 text-right align-top font-mono font-semibold">
                  {formatMoney(li.totalPrice, q.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-[12px]">
            <Row label="Subtotal" value={formatMoney(subtotal, q.currency)} mono />
            <Row label="Freight / charges" value={formatMoney(q.freight, q.currency)} mono />
            <Row label="Discount" value={`- ${formatMoney(q.discount, q.currency)}`} mono />
            <Row label="Tax" value={formatMoney(q.tax, q.currency)} mono />
            <div className="my-1 border-t border-paper-300" />
            <Row label="Total Amount" value={formatMoney(total, q.currency)} mono bold />
            <Row label="Total Weight" value={formatWeight(totalWeight)} mono />
            <div className="my-1 border-t border-dashed border-paper-200" />
            <Row label={`Required deposit (${q.depositPercent}%)`} value={formatMoney(deposit, q.currency)} mono />
            <Row label="Remaining balance" value={formatMoney(balance, q.currency)} mono />
          </div>
        </div>

        {q.remarks && (
          <div className="mt-4 rounded-md bg-paper-50 px-3 py-2 text-[11.5px] text-paper-600">
            <span className="font-semibold text-paper-700">Remarks: </span>
            {q.remarks}
          </div>
        )}

        <div className="mt-8 flex justify-between text-[11px] text-paper-400">
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
