import type { Quotation, Customer } from "@/lib/types";
import { formatMoney, formatDate, piRef } from "@/lib/format";
import { BATCH_LABEL, lacingAmount, lacingWeight } from "@/lib/batches";
import { totalsForQuotation } from "@/lib/totals";
import fntLogo from "@/assets/fnt-logo.png";

// Item numbering used to be a mutable counter closed over by child components. React renders
// children after the parent, and StrictMode renders them twice, so the counter drifted and the
// printed numbers skipped (3, 4, then 8, 9, 10 on a five-line quotation). The document is now built
// as pure data first — numbering is assigned while walking the tree, before anything renders — so
// it cannot depend on render order or render count.

type PrintRow =
  | { kind: "assembledTitle"; key: string; text: string }
  | { kind: "banner"; key: string; text: string; weightUom?: string; qtyUom?: string }
  | {
      kind: "line";
      key: string;
      no: number;
      label: string;
      weightKg: number;
      qty: number | string;
      unitPrice: number | null;
      amount: number;
    };

function buildRows(q: Quotation): PrintRow[] {
  const rows: PrintRow[] = [];
  let no = 0;

  if (q.batches?.length) {
    for (const batch of q.batches) {
      if (batch.type === "lacing") {
        const lines = batch.lacing ?? [];
        if (lines.length === 0) continue;
        rows.push({ kind: "banner", key: `${batch.id}-b`, text: BATCH_LABEL.lacing, weightUom: "KG" });
        for (const line of lines) {
          rows.push({
            kind: "line",
            key: line.id,
            no: (no += 1),
            label: `${line.code} ${line.description}`,
            weightKg: lacingWeight(line),
            qty: line.kind === "twine" ? line.kgs : "—",
            unitPrice: line.kind === "twine" ? line.rate : null,
            amount: lacingAmount(line),
          });
        }
        continue;
      }

      const items = (batch.items ?? []).filter((i) => i.specs.length > 0);
      if (items.length === 0) continue;

      if (batch.type === "assembled" && batch.title?.trim()) {
        rows.push({ kind: "assembledTitle", key: `${batch.id}-t`, text: batch.title });
      }

      for (const item of items) {
        rows.push({
          kind: "banner",
          key: `${item.id}-b`,
          text: item.specification,
          weightUom: item.weightUom,
          qtyUom: item.qtyUom,
        });
        for (const spec of item.specs) {
          rows.push({
            kind: "line",
            key: spec.id,
            no: (no += 1),
            label: `${spec.specCode} ${spec.description}`,
            weightKg: spec.weightKg,
            qty: spec.qtyPcs,
            unitPrice: spec.unitPrice,
            amount: spec.amount,
          });
        }
      }
    }
    return rows;
  }

  // Quotations authored before the batch model: consecutive lines sharing a specification string
  // print under one banner, as the factory's own PI template does.
  let lastSpec: string | null = null;
  for (const li of q.items) {
    if (li.specification !== lastSpec) {
      rows.push({ kind: "banner", key: `${li.id}-b`, text: li.specification, weightUom: "KG", qtyUom: "PCS" });
      lastSpec = li.specification;
    }
    rows.push({
      kind: "line",
      key: li.id,
      no: (no += 1),
      label: `${li.itemCode} ${li.description}`,
      weightKg: li.weightKg,
      qty: li.qtyPcs,
      unitPrice: li.unitPrice,
      amount: li.totalPrice,
    });
  }
  return rows;
}

// A line item is forced onto a single row (no wrap) so every catalog item stays one row, matching
// the factory's real PI layout — but a long description at a fixed font size would overflow the
// column instead of wrapping. Stepping the size down by length keeps it on one line at any
// reasonable length while staying legible (never below 9px).
function descFontClass(text: string): string {
  const len = text.length;
  if (len <= 45) return "text-[11px]";
  if (len <= 60) return "text-[10.5px]";
  if (len <= 75) return "text-[10px]";
  if (len <= 90) return "text-[9.5px]";
  return "text-[9px]";
}

// Specification sentences are a different case: they run well past 100 characters ("NYLON BRAIDED
// NET SK DSTB (THICKER 1.5MD SELVAGE ON TOP AND BOTTOM) DWS REINFORCED BY…") and truncating them
// hides information the customer needs. They wrap to at most two lines, stepping down in size first
// so that two lines is nearly always enough.
function bannerFontClass(text: string): string {
  const len = text.length;
  if (len <= 70) return "text-[11px]";
  if (len <= 110) return "text-[10px]";
  if (len <= 160) return "text-[9.5px]";
  return "text-[9px]";
}

export function PIDocumentPreview({
  q,
  customer,
  domId = "pi-document-root",
}: {
  q: Quotation;
  customer?: Customer;
  /** Overridden when a second copy is on the page (e.g. a revision preview) so ids stay unique
   *  and the PDF export still targets the right one. */
  domId?: string;
}) {
  // The export client master shows PIs actually go out under one of two legal entities depending
  // on the account, not a single fixed name — falls back to the historical default when a customer
  // record has no letterhead set (e.g. seed customers predating this field).
  // Set on the quotation when the sales team has chosen an entity for this document; otherwise it
  // falls back to whichever entity the customer is normally billed from.
  const issuingEntity = q.issuingEntity ?? customer?.letterhead ?? "FORTUNE NET & TWINE MFG. CORP.";
  const attn = q.attentionContact || customer?.contactPerson;
  const { totalWeightKg, grandTotal } = totalsForQuotation(q);
  const rows = buildRows(q);
  // Newest first, and only actual revisions. Revision 0 is the initial issue, which needs no
  // explanation on a document that already carries its own number and date.
  const revisionsToPrint = [...(q.revisions ?? [])].filter((r) => r.revisionNo > 0).reverse();

  return (
    <div className="overflow-x-auto">
      {/* The export id sits on the SHEET, not the scroll wrapper above it. The wrapper is as wide
          as its column, while the sheet is centred at max-w-820, so capturing the wrapper
          photographed the empty space either side and scaled that dead margin into the page. */}
      <div
        id={domId}
        className="relative mx-auto min-w-[640px] max-w-[820px] overflow-hidden bg-white p-8 font-sans text-[13px] text-paper-900 print:min-w-0 print:max-w-none print:w-full print:p-0"
      >
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
              {/* The revision travels with the number so the customer and their bank are looking
                  at the same document we are: PI-33007 first, PI-33007-R1 once it is revised. */}
              <p className="font-mono text-lg font-bold text-pine-800">{piRef(q.id, q.revisionNo)}</p>
              <p className="mt-1 text-[11px] text-paper-500">{formatDate(q.issueDate)}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-paper-400">Messrs.</p>
              <p className="text-[13px] font-semibold">{customer?.name ?? q.consignee}</p>
              <p className="text-[12px] text-paper-500">{customer?.address}</p>
              {attn && <p className="mt-1 text-[12px] text-paper-500">Attn: {attn}</p>}
              {q.headerRemarks?.trim() && (
                <p className="mt-1 text-[12px] italic text-paper-500">{q.headerRemarks.trim()}</p>
              )}
            </div>
            <div className="space-y-1 text-[12px]">
              <Row label="Shipment" value={q.shipmentTerms?.trim() || formatDate(q.estimatedShipmentDate)} />
              <Row label="Payment" value={q.paymentTerms} />
              <Row label="Validity" value={q.validityDate ? formatDate(q.validityDate) : `${q.validityDays} days from issue`} />
              {q.incoterms && <Row label="Incoterms" value={q.incoterms} />}
              <Row
                label="Date"
                value={q.leadTimeDate ? formatDate(q.leadTimeDate) : `${q.leadTimeWeeks} weeks from confirmation`}
              />
            </div>
          </div>

          <table className="mt-5 w-full table-fixed border-collapse text-[11px]">
            <thead>
              <tr className="bg-pine-700 text-left font-mono text-[10px] font-semibold uppercase tracking-wide text-white">
                <th className="w-10 py-1.5 pl-2 text-center">Item No.</th>
                <th className="py-1.5 px-2">Description</th>
                <th className="w-14 py-1.5 px-2 text-right">Weight</th>
                <th className="w-12 py-1.5 px-2 text-right">Qty</th>
                <th className="w-20 py-1.5 px-2 text-right">U/P</th>
                <th className="w-24 py-1.5 px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[11px] text-paper-400">
                    No items on this quotation yet.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                if (row.kind === "assembledTitle") {
                  return (
                    <tr key={row.key} className="break-inside-avoid bg-pine-700/90">
                      <td className="py-1 pl-2" />
                      <td colSpan={5} className="py-1 px-2 text-[11px] font-semibold uppercase leading-snug text-white">
                        {row.text}
                      </td>
                    </tr>
                  );
                }

                if (row.kind === "banner") {
                  return (
                    <tr key={row.key} className="break-inside-avoid bg-paper-100">
                      <td className="py-1 pl-2" />
                      <td
                        className={`py-1 px-2 font-semibold uppercase leading-snug text-paper-900 ${bannerFontClass(row.text)}`}
                        style={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          overflow: "hidden",
                        }}
                      >
                        {row.text}
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-[10px] text-paper-500">{row.weightUom ?? ""}</td>
                      <td className="py-1 px-2 text-right font-mono text-[10px] text-paper-500">{row.qtyUom ?? ""}</td>
                      <td className="py-1 px-2" />
                      <td className="py-1 px-2" />
                    </tr>
                  );
                }

                return (
                  <tr key={row.key} className="break-inside-avoid border-b border-paper-100">
                    <td className="py-1 pl-2 text-center font-mono text-paper-500">{row.no}</td>
                    <td
                      className={`whitespace-nowrap overflow-hidden py-1 px-2 font-medium leading-tight text-pine-700 ${descFontClass(row.label)}`}
                    >
                      {row.label}
                    </td>
                    <td className="py-1 px-2 text-right font-mono">{row.weightKg.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right font-mono">{row.qty}</td>
                    <td className="py-1 px-2 text-right font-mono">
                      {row.unitPrice === null ? "—" : formatMoney(row.unitPrice, q.currency)}
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-semibold">{formatMoney(row.amount, q.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="break-inside-avoid border-t-2 border-pine-800 font-semibold text-paper-800">
                <td className="py-2 pl-2 text-right" colSpan={2}>
                  Total Weight:
                </td>
                <td className="whitespace-nowrap py-2 px-2 text-right font-mono text-[10.5px]">
                  {totalWeightKg.toFixed(2)} KG
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
            <div className="mt-4 whitespace-pre-line break-inside-avoid rounded-md bg-paper-50 px-3 py-2 text-[11.5px] text-paper-600">
              <span className="font-semibold text-paper-700">Notes: </span>
              {q.remarks}
            </div>
          )}

          {/* The revision history is printed on the document, not kept to the screen. A customer
              holding R3 needs to see what changed between R1 and R3 without asking, and so does
              anyone matching this against a bank instruction months later. The initial issue is
              left out: a single "Initial issue" line under a bare PI number says nothing. */}
          {revisionsToPrint.length > 0 && (
            <div className="mt-4 break-inside-avoid">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-paper-400">Revision history</p>
              <table className="w-full border-collapse text-[10.5px]">
                <tbody>
                  {revisionsToPrint.map((r) => (
                    <tr key={r.revisionNo} className="border-b border-paper-100 last:border-0 align-top">
                      <td className="w-12 py-1 pr-2 font-mono font-semibold text-pine-800">R{r.revisionNo}</td>
                      <td className="w-20 py-1 pr-2 font-mono text-paper-400">{formatDate(r.date)}</td>
                      <td className="py-1 text-paper-600">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
