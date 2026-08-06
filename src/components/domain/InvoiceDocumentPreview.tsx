import type { CommercialInvoice, Customer } from "@/lib/types";
import { formatMoney, formatWeight, formatDate } from "@/lib/format";
import fntLogo from "@/assets/fnt-logo.png";

export function InvoiceDocumentPreview({ inv, customer }: { inv: CommercialInvoice; customer?: Customer }) {
  const subtotal = inv.items.reduce((s, li) => s + li.totalPrice, 0);
  const total = subtotal + inv.freight - inv.discount + inv.tax;
  // Same per-customer issuing-entity logic as the PI preview — see PIDocumentPreview.tsx.
  const issuingEntity = customer?.letterhead ?? "FORTUNE NET & TWINE MFG. CORP.";

  return (
    <div id="ci-document-root" className="overflow-x-auto">
      <div className="relative mx-auto min-w-[640px] max-w-[820px] overflow-hidden rounded-lg border border-paper-200 bg-white p-8 font-sans text-[13px] text-paper-900 shadow-[var(--shadow-panel)] print:min-w-0 print:max-w-none print:w-full print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div className="mesh-lattice pointer-events-none absolute inset-0 opacity-40 print:hidden" />
        <div className="relative">
        <div className="flex items-start justify-between border-b-2 border-vermillion-700 pb-4 break-inside-avoid">
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
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-[11px] text-paper-400">COMMERCIAL INVOICE</p>
            <p className="font-mono text-lg font-bold text-vermillion-700">{inv.id}</p>
            <p className="mt-1 text-[11px] text-paper-500">{formatDate(inv.issueDate)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Sold to</p>
            <p className="text-[13px] font-semibold">{customer?.name}</p>
            <p className="text-[12px] text-paper-500">{customer?.address}</p>
          </div>
          <div className="space-y-1 text-[12px]">
            <Row label="Reference PI" value={inv.quotationId} />
            <Row label="Sales Order" value={inv.salesOrderId} />
            <Row label="Container No." value={inv.containerNo ?? "Pending assignment"} />
            <Row label="Bill of Lading" value={inv.billOfLadingNo ?? "Pending assignment"} />
          </div>
        </div>

        <table className="mt-5 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-vermillion-700 bg-[#fdf4f4] text-left font-mono text-[10.5px] uppercase tracking-wide text-vermillion-700">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2 text-right">Shipped Qty</th>
              <th className="py-1.5 pr-2 text-right">Weight</th>
              <th className="py-1.5 pr-2 text-right">Unit Price</th>
              <th className="py-1.5 pl-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((li) => (
              <tr key={li.id} className="break-inside-avoid border-b border-paper-100">
                <td className="py-1.5 pr-2 align-top font-mono text-[11px] text-paper-500">{li.itemCode}</td>
                <td className="py-1.5 pr-2 align-top font-medium">{li.description}</td>
                <td className="py-1.5 pr-2 text-right align-top font-mono">
                  {li.shippedQtyPcs ?? li.qtyPcs} {li.unit}
                  {li.shippedQtyPcs !== undefined && li.shippedQtyPcs !== li.qtyPcs && (
                    <span className="block text-[10px] font-sans text-paper-400">of {li.qtyPcs} quoted</span>
                  )}
                </td>
                <td className="py-1.5 pr-2 text-right align-top font-mono">{formatWeight(li.weightKg)}</td>
                <td className="py-1.5 pr-2 text-right align-top font-mono">{formatMoney(li.unitPrice, inv.currency)}</td>
                <td className="py-1.5 pl-2 text-right align-top font-mono font-semibold">{formatMoney(li.totalPrice, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end break-inside-avoid">
          <div className="w-64 space-y-1 text-[12px]">
            <Row label="Subtotal" value={formatMoney(subtotal, inv.currency)} mono />
            <Row label="Freight" value={formatMoney(inv.freight, inv.currency)} mono />
            <Row label="Discount" value={`- ${formatMoney(inv.discount, inv.currency)}`} mono />
            <div className="my-1 border-t border-paper-300" />
            <Row label="Total Due" value={formatMoney(total, inv.currency)} mono bold />
            <Row label="Shipped Weight" value={formatWeight(inv.shippedWeightKg)} mono />
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
      <span className={`${mono ? "font-mono" : ""} ${bold ? "text-[14px] font-bold text-vermillion-700" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
