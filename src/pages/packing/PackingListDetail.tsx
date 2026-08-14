import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PackageCheck,
  Search,
  Plus,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  FileText,
  Printer,
  Layers,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate, piRef } from "@/lib/format";
import {
  lineTotals,
  linesForOrder,
  listOrders,
  netWeightFor,
  perPieceWeightFor,
  piRefLine,
  reconcileOrder,
  scopeLabel,
  verifyPackingList,
} from "@/lib/packing";
import { canPack } from "@/lib/paymentLedger";
import { PackingListDocument } from "@/components/domain/PackingListDocument";
import { SCOPES } from "./scopes";
import type { PackingList, PackingSection, QuotationLineItem, SalesOrder, ShipmentScope } from "@/lib/types";
import clsx from "clsx";

// One packing list, open for work. The index screen lists them; this is where a list is actually
// filled in, checked against the orders it covers, and closed.
//
// It is a screen per list rather than an accordion on the index for the same reason a quotation has
// its own page: what you do here is long-form. Sections, rows, weights, a reconciliation panel and
// five dialogs do not belong stacked ten deep behind a search box.

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-2.5 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function PackingListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    packingLists,
    salesOrders,
    quotations,
    customers,
    updatePackingList,
    addPackingListOrder,
    removePackingListOrder,
    setPackingListOrderScope,
    removePackingList,
    addPackingSection,
    updatePackingSection,
    removePackingSection,
    addPackingLine,
    updatePackingLine,
    removePackingLine,
    finalizePackingList,
    reopenPackingList,
    payments,
    pushToast,
  } = useStore();

  const [previewOpen, setPreviewOpen] = useState(false);
  /** Which section is having items added to it, and what has been ticked so far. */
  const [picking, setPicking] = useState<{ sectionId: string } | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [consolidating, setConsolidating] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = packingLists.find((p) => p.id === id);

  const orderItems = (salesOrderId?: string): QuotationLineItem[] => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const quotation = order?.quotationId ? quotations.find((q) => q.id === order.quotationId) : undefined;
    return quotation?.items ?? [];
  };

  if (!list) {
    return (
      <div>
        <PageHeader
          breadcrumb={["Fortune Net & Twine ERP", "Operations", "Packing List"]}
          eyebrow="Outbound Preparation"
          title="Packing list not found"
        />
        <EmptyState
          icon={<PackageCheck className="h-5 w-5" />}
          title={`No packing list ${id ?? ""}`}
          description="It may have been deleted."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/packing")}>
              Back to packing lists
            </Button>
          }
        />
      </div>
    );
  }

  const closed = Boolean(list.finalizedDate);
  const refs = listOrders(list);
  const cust = customers.find((c) => c.id === list.customerId);

  const itemsByOrder: Record<string, QuotationLineItem[]> = Object.fromEntries(
    refs.map((ref) => [ref.salesOrderId, orderItems(ref.salesOrderId)])
  );
  const verdict = verifyPackingList(list, itemsByOrder, packingLists);
  const ordersOf = (l: PackingList): SalesOrder[] =>
    listOrders(l)
      .map((r) => salesOrders.find((o) => o.id === r.salesOrderId))
      .filter((o): o is SalesOrder => Boolean(o));

  /** The PI reference as the customer knows it, revision suffix and all. */
  const refForOrder = (salesOrderId: string) => {
    const order = salesOrders.find((o) => o.id === salesOrderId);
    const q = order?.quotationId ? quotations.find((x) => x.id === order.quotationId) : undefined;
    return q ? piRef(q.id, q.revisionNo) : (order?.quotationId ?? salesOrderId);
  };

  const reconcileFor = (salesOrderId: string) =>
    reconcileOrder(salesOrderId, orderItems(salesOrderId), packingLists, list.id);

  /** Order lines with something still to pack. Fully packed items are not offered again. */
  const remainingFor = (salesOrderId: string) =>
    reconcileFor(salesOrderId).filter((r) => r.orderedQty > 0 && r.variance < 0);

  /**
   * The customer's other orders that could ride in the same container.
   *
   * Same customer only. A container is consigned to one party, so consolidating two customers'
   * orders onto one packing list would produce a document addressed to nobody.
   */
  const canConsolidate = salesOrders.filter(
    (o) =>
      (o.currentStage === "packing" || o.currentStage === "deposit") &&
      o.customerId === list.customerId &&
      !refs.some((r) => r.salesOrderId === o.id) &&
      canPack(o, payments).ok
  );

  /** Which order a section packs against, falling back to the load's only order. */
  const sectionOrderId = (section: PackingSection) =>
    section.salesOrderId ?? (refs.length === 1 ? refs[0].salesOrderId : undefined);

  /**
   * What the picker can offer: order lines not already on this list, filtered by the search box.
   *
   * Scoped to the section's own P.I. now that a section belongs to one order. Offering another
   * order's items here would produce a row that immediately contradicts the block it sits in.
   */
  const pickingSection = picking ? (list.sections ?? []).find((s) => s.id === picking.sectionId) : undefined;
  const pickableItems = (() => {
    if (!pickingSection) return [];
    const salesOrderId = sectionOrderId(pickingSection);
    if (!salesOrderId) return [];
    const onList = new Set(linesForOrder([list], salesOrderId).map((l) => l.itemId ?? l.itemCode));
    const q = pickQuery.trim().toLowerCase();
    return orderItems(salesOrderId)
      .filter((li) => !onList.has(li.id) && !onList.has(li.itemCode))
      .filter((li) => !q || `${li.itemCode} ${li.description} ${li.specification}`.toLowerCase().includes(q))
      .map((item) => ({ salesOrderId, item }));
  })();

  /** Adds the ticked items in the order they were ticked, then clears the picker. */
  function addPickedItems() {
    if (!picking) return;
    // Mapped over `picked` rather than the table, so the rows land in click order. This is the
    // same rule the quotation builder's item selection follows.
    picked.forEach((key) => {
      const hit = pickableItems.find((x) => x.item.id === key);
      if (!hit) return;
      // Opened at nothing packed. The net weight follows the piece count from the P.I.'s weight
      // per piece, so it fills itself in the moment the packer types the count.
      addPackingLine(list!.id, picking.sectionId, {
        salesOrderId: hit.salesOrderId,
        itemId: hit.item.id,
        itemCode: hit.item.itemCode,
        description: hit.item.description,
        qtyPcs: 0,
        netWeightKg: 0,
        grossWeightKg: 0,
      });
    });
    pushToast({
      tone: "success",
      title: `${picked.length} item${picked.length === 1 ? "" : "s"} added`,
      description: "Set the pieces on the rows; the net weight follows from the P.I.",
    });
    setPicking(null);
    setPicked([]);
    setPickQuery("");
  }

  function handleClose() {
    if (!verdict.ok) {
      pushToast({ tone: "warning", title: "Cannot close this list", description: verdict.message });
      return;
    }
    setConfirmClose(true);
  }

  return (
    <div>
      {/* Everything on this screen is marked no-print, and the document is rendered again below,
          outside it. That is exactly how the PI prints: Ctrl+P produces the document alone rather
          than the application around it. Modals render inline rather than through a portal, so the
          preview dialog is inside this wrapper and disappears from the printed page with it. */}
      <div className="no-print">
        <PageHeader
          breadcrumb={["Fortune Net & Twine ERP", "Operations", list.id]}
          eyebrow="Outbound Preparation"
          title={list.id}
          description={`${piRefLine(refs)} · ${cust?.name ?? "-"} · packed by ${list.packedBy}${
            closed ? ` · closed ${formatDate(list.finalizedDate)}` : ""
          }`}
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => navigate("/packing")}
              >
                Back
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" />}
                onClick={() => setPreviewOpen(true)}
              >
                Preview
              </Button>
              {closed ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Unlock className="h-3.5 w-3.5" />}
                  onClick={() => reopenPackingList(list.id)}
                >
                  Reopen
                </Button>
              ) : (
                <>
                  <Button variant="primary" size="sm" icon={<Lock className="h-3.5 w-3.5" />} onClick={handleClose}>
                    Submit
                  </Button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="rounded p-1.5 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                    aria-label={`Delete ${list.id}`}
                    title="Delete this packing list"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          }
        />

        <Card>
          {/* The check that justifies this screen existing. Shown before the rows, because it is
              the answer the user came for. */}
          <div
            className={clsx(
              "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
              verdict.ok ? "border-pine-200 bg-pine-50 text-pine-800" : "border-amber-200 bg-amber-50 text-amber-800"
            )}
          >
            {verdict.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{verdict.message}</span>
          </div>

          {/* What is in the container, PI by PI. On a consolidated load this is the part that
              matters most: each order has its own scope and its own verdict, and the packer needs
              to see which one is holding the list up. */}
          <div className="mb-3 space-y-2">
            {verdict.perOrder.map((v) => {
              const packedHere = lineTotals(linesForOrder([list], v.salesOrderId));
              return (
                <details key={v.salesOrderId} className="rounded-lg border border-paper-200">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-pine-800">P.I. {v.piRef}</span>
                    {closed ? (
                      <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-medium text-paper-600">
                        {scopeLabel(v.scope, v.partialNo)}
                      </span>
                    ) : (
                      <select
                        value={v.scope}
                        onClick={(e) => e.preventDefault()}
                        onChange={(e) =>
                          setPackingListOrderScope(list.id, v.salesOrderId, e.target.value as ShipmentScope)
                        }
                        className="rounded-md border border-paper-200 bg-white px-1.5 py-0.5 text-[11px]"
                        title="How this P.I. is going out on this load"
                      >
                        {SCOPES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.id === "partial" ? scopeLabel("partial", v.partialNo) : s.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <Link
                      to={`/orders/${v.salesOrderId}`}
                      className="font-mono text-[10.5px] text-manifest-600 hover:underline"
                    >
                      {v.salesOrderId}
                    </Link>
                    <span className="text-paper-500">
                      {packedHere.pieces} pcs on this list · net {packedHere.netKg.toFixed(2)} KG
                    </span>
                    {!v.ok && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                    {!closed && refs.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          removePackingListOrder(list.id, v.salesOrderId);
                        }}
                        className="ml-auto rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                        title={`Drop P.I. ${v.piRef} and its rows from this load`}
                        aria-label={`Drop ${v.piRef} from this list`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </summary>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-t border-paper-100 text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                        <th className="px-3 py-1.5">Item</th>
                        <th className="w-20 px-2 py-1.5 text-right">Ordered</th>
                        <th className="w-20 px-2 py-1.5 text-right">Packed</th>
                        <th className="w-24 px-2 py-1.5 text-right">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.rows.map((r) => (
                        <tr key={r.itemId} className="border-t border-paper-100">
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-pine-800">{r.itemCode}</span>
                            {r.orderedQty === 0 && (
                              <span className="ml-2 rounded bg-alert-100 px-1.5 py-0.5 text-[10px] text-alert-700">
                                not on this order
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.orderedQty}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{r.packedQty}</td>
                          <td
                            className={clsx(
                              "px-2 py-1.5 text-right font-mono",
                              r.variance < 0 && "text-amber-700",
                              r.variance > 0 && "font-semibold text-alert-600",
                              r.variance === 0 && "text-pine-700"
                            )}
                          >
                            {r.variance === 0 ? "-" : r.variance > 0 ? `+${r.variance}` : r.variance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              );
            })}
            {!closed && canConsolidate.length > 0 && (
              <button
                onClick={() => setConsolidating(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-manifest-300 px-3 py-1.5 text-[11px] font-medium text-manifest-700 hover:bg-manifest-50"
              >
                <Layers className="h-3.5 w-3.5" />
                Add another order to this container ({canConsolidate.length} ready)
              </button>
            )}
          </div>

          <div className="space-y-3">
            {(list.sections ?? []).map((section) => {
              const sectionOrder = sectionOrderId(section);
              const items = orderItems(sectionOrder);
              return (
                <div key={section.id} className="rounded-lg border border-paper-200">
                  <div className="flex flex-wrap items-center gap-2 border-b border-paper-100 bg-paper-50/70 px-2.5 py-1.5">
                    <input
                      value={section.title}
                      disabled={closed}
                      onChange={(e) => updatePackingSection(list.id, section.id, { title: e.target.value })}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-paper-800 hover:border-paper-200 focus:border-manifest-400 focus:bg-white focus:outline-none disabled:hover:border-transparent"
                    />
                    {/* The P.I. belongs to the block, not to each row. The printed sheet groups by
                        P.I., so this is the same decision made once instead of once per row. */}
                    <label className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wide text-paper-400">
                      P.I.
                      <select
                        value={section.salesOrderId ?? ""}
                        disabled={closed}
                        onChange={(e) =>
                          updatePackingSection(list.id, section.id, { salesOrderId: e.target.value || undefined })
                        }
                        className="rounded border border-paper-200 bg-white px-1.5 py-0.5 font-mono text-[11px] normal-case tracking-normal text-paper-700 focus:border-manifest-400 focus:outline-none"
                        aria-label="Which P.I. this section packs against"
                      >
                        <option value="">none</option>
                        {refs.map((r) => (
                          <option key={r.salesOrderId} value={r.salesOrderId}>
                            {r.piRef}
                          </option>
                        ))}
                      </select>
                    </label>
                    {/* The container is per section, not per list. A consolidated load runs to
                        several containers and the sections are how they are told apart. */}
                    <input
                      value={section.containerNo ?? ""}
                      disabled={closed}
                      onChange={(e) => updatePackingSection(list.id, section.id, { containerNo: e.target.value })}
                      placeholder={list.containerNo || "Container no."}
                      className="w-40 rounded border border-paper-200 bg-white px-1.5 py-0.5 font-mono text-[11px] focus:border-manifest-400 focus:outline-none"
                      aria-label="Container number for this section"
                    />
                    {!closed && (
                      <button
                        onClick={() => removePackingSection(list.id, section.id)}
                        className="rounded p-1 text-paper-400 hover:bg-white hover:text-alert-600"
                        aria-label="Remove section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="text-left font-mono text-[10px] uppercase tracking-wide text-paper-400">
                        <th className="w-36 px-2 py-1.5">Item code</th>
                        <th className="px-2 py-1.5">Mark / description</th>
                        <th className="w-16 px-2 py-1.5">Bale no.</th>
                        <th className="w-14 px-2 py-1.5 text-right">Pcs</th>
                        <th className="w-24 px-2 py-1.5 text-right">Net KG</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {section.lines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-2 py-3 text-center text-[11px] text-paper-400">
                            Nothing in this section yet.
                          </td>
                        </tr>
                      )}
                      {section.lines.map((line) => {
                        // The net weight follows from the P.I.: weight per piece times the pieces
                        // in the bale. It is only typed on a row that matches nothing on the order,
                        // which is a blank row taken off the plant's own paperwork.
                        const derived = perPieceWeightFor(line, items) !== undefined;
                        return (
                          <tr key={line.id} className="border-t border-paper-100">
                            <td className="px-2 py-1">
                              <input
                                value={line.itemCode}
                                disabled={closed}
                                onChange={(e) =>
                                  updatePackingLine(list.id, section.id, line.id, { itemCode: e.target.value })
                                }
                                className={clsx(input, "font-mono")}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={line.description}
                                disabled={closed}
                                onChange={(e) =>
                                  updatePackingLine(list.id, section.id, line.id, { description: e.target.value })
                                }
                                className={input}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={line.baleNo ?? ""}
                                disabled={closed}
                                placeholder="-"
                                onChange={(e) =>
                                  updatePackingLine(list.id, section.id, line.id, { baleNo: e.target.value })
                                }
                                className={clsx(input, "text-center font-mono")}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="number"
                                min={0}
                                value={line.qtyPcs}
                                disabled={closed}
                                onChange={(e) => {
                                  const qtyPcs = Math.max(0, Number(e.target.value) || 0);
                                  const net = netWeightFor({ ...line, qtyPcs }, items) ?? line.netWeightKg;
                                  // Written in one patch so the stored weight can never lag behind
                                  // the count the document prints beside it.
                                  updatePackingLine(list.id, section.id, line.id, {
                                    qtyPcs,
                                    netWeightKg: net,
                                    grossWeightKg: net,
                                  });
                                }}
                                className={clsx(input, "text-right font-mono")}
                              />
                            </td>
                            <td className="px-2 py-1">
                              {derived ? (
                                <p
                                  className="px-2.5 py-1.5 text-right font-mono text-xs text-paper-600"
                                  title="Weight per piece from the P.I., times the pieces on this row"
                                >
                                  {line.netWeightKg.toFixed(2)}
                                </p>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.netWeightKg}
                                  disabled={closed}
                                  onChange={(e) => {
                                    const net = Math.max(0, Number(e.target.value) || 0);
                                    updatePackingLine(list.id, section.id, line.id, {
                                      netWeightKg: net,
                                      grossWeightKg: net,
                                    });
                                  }}
                                  className={clsx(input, "text-right font-mono")}
                                  title="Typed by hand: this row matches nothing on the order"
                                />
                              )}
                            </td>
                            <td className="px-1 py-1">
                              {!closed && (
                                <button
                                  onClick={() => removePackingLine(list.id, section.id, line.id)}
                                  className="rounded p-1 text-paper-400 hover:text-alert-600"
                                  aria-label="Remove row"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {!closed && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-paper-100 px-2.5 py-2">
                      {/* Opens the same searchable picker the quotation builder uses, rather than a
                          row of chips. A customer with twenty specifications on one order made that
                          row longer than the table it belonged to. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        disabled={!sectionOrder}
                        title={sectionOrder ? undefined : "Give this section a P.I. first"}
                        onClick={() => setPicking({ sectionId: section.id })}
                      >
                        Add Item
                      </Button>
                      <button
                        onClick={() =>
                          addPackingLine(list.id, section.id, {
                            salesOrderId: sectionOrder,
                            itemCode: "",
                            description: "",
                            qtyPcs: 0,
                            netWeightKg: 0,
                            grossWeightKg: 0,
                          })
                        }
                        className="ml-auto rounded-full border border-dashed border-paper-300 px-2.5 py-1 text-[10.5px] text-paper-500 hover:border-manifest-400 hover:text-manifest-700"
                      >
                        + Blank row
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!closed && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => addPackingSection(list.id, "")}
              >
                Add section
              </Button>
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-[11px]">
              <span className="mb-1 block font-medium text-paper-600">Container no. (default)</span>
              <input
                value={list.containerNo ?? ""}
                disabled={closed}
                onChange={(e) => updatePackingList(list.id, { containerNo: e.target.value })}
                placeholder="e.g. TCLU 4821960"
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 font-mono text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </label>
            <label className="text-[11px] sm:col-span-2">
              <span className="mb-1 block font-medium text-paper-600">Remarks</span>
              <input
                value={list.remarks ?? ""}
                disabled={closed}
                onChange={(e) => updatePackingList(list.id, { remarks: e.target.value })}
                placeholder="Packing remarks, marks and numbers, strapping…"
                className="w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </label>
          </div>
        </Card>

        <Modal
          open={consolidating}
          onClose={() => setConsolidating(false)}
          title="Add another order to this container"
          subtitle={`${list.id} · ${cust?.name ?? ""}`}
          width="max-w-2xl"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setConsolidating(false)}>
              Done
            </Button>
          }
        >
          <div className="space-y-2">
            <p className="text-xs text-paper-500">
              Only this customer's other orders are offered. A container is consigned to one party, so a list covering
              two customers would produce a document addressed to nobody.
            </p>
            {canConsolidate.map((o) => {
              const outstanding = remainingFor(o.id).length;
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-paper-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-pine-800">{refForOrder(o.id)}</p>
                    <p className="text-[11px] text-paper-500">
                      {o.id} ·{" "}
                      {outstanding === 0
                        ? "everything already packed"
                        : `${outstanding} item${outstanding === 1 ? "" : "s"} still to pack`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {SCOPES.map((s) => (
                      <button
                        key={s.id}
                        title={s.help}
                        onClick={() => {
                          addPackingListOrder(list.id, o.id, s.id);
                          // Its own block, matching how the document prints it, so the rows have
                          // somewhere to land that is already attributed to the right P.I.
                          addPackingSection(list.id, `P.I. ${refForOrder(o.id)}`, o.id);
                          pushToast({
                            tone: "success",
                            title: `${refForOrder(o.id)} added to ${list.id}`,
                            description: "A section was opened for it. Add its rows there.",
                          });
                          setConsolidating(false);
                        }}
                        className="rounded-full border border-paper-200 bg-white px-2.5 py-1 text-[11px] font-medium text-paper-600 hover:border-pine-600 hover:bg-pine-50 hover:text-pine-800"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>

        <Modal
          open={picking !== null}
          onClose={() => {
            setPicking(null);
            setPicked([]);
            setPickQuery("");
          }}
          title="Add items to this section"
          subtitle={
            pickingSection ? `P.I. ${refForOrder(sectionOrderId(pickingSection) ?? "")} · ${pickingSection.title}` : undefined
          }
          width="max-w-3xl"
          footer={
            <>
              <span className="mr-auto text-xs text-paper-500">
                {picked.length} selected · added in the order you tick them
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPicking(null);
                  setPicked([]);
                  setPickQuery("");
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={picked.length === 0} onClick={addPickedItems}>
                Add Item
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
              <input
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Search code or specification…"
                className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
              />
            </div>
            <div className="overflow-hidden rounded-lg border border-paper-200">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-pine-700 text-left font-mono text-[9.5px] uppercase tracking-wide text-white">
                    <th className="w-10 py-2 pl-3" />
                    <th className="w-32 px-2 py-2">Code</th>
                    <th className="px-2 py-2">Specification</th>
                    <th className="w-20 px-2 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {pickableItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-paper-400">
                        {pickQuery ? "Nothing matches that." : "Every item on this P.I. is already on this list."}
                      </td>
                    </tr>
                  )}
                  {pickableItems.map(({ item: li }) => {
                    const at = picked.indexOf(li.id);
                    return (
                      <tr
                        key={li.id}
                        onClick={() =>
                          setPicked((prev) => (prev.includes(li.id) ? prev.filter((x) => x !== li.id) : [...prev, li.id]))
                        }
                        className={clsx(
                          "cursor-pointer border-t border-paper-100",
                          at >= 0 ? "bg-manifest-50" : "hover:bg-paper-50"
                        )}
                      >
                        <td className="py-1.5 pl-3">
                          <input
                            type="checkbox"
                            checked={at >= 0}
                            onChange={() => {}}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 rounded border-paper-300 accent-pine-700"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="flex items-center gap-1.5">
                            {at >= 0 && (
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-manifest-600 text-[9px] font-bold text-white">
                                {at + 1}
                              </span>
                            )}
                            <span className="font-mono text-pine-800">{li.itemCode}</span>
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-paper-600">{li.description}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{li.qtyPcs}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>

        {/* The draft document, exactly as the PI works: what you see here is what prints, so the two
            cannot drift apart. */}
        <Modal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`${list.id} packing list`}
          subtitle={`${piRefLine(refs)} · ${closed ? "closed" : "draft, not yet closed"}`}
          width="max-w-4xl"
          footer={
            <>
              <span className="mr-auto text-xs text-paper-500">
                {closed ? "This is the final document." : "Draft. Weights can still change until the list is closed."}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
              <Button variant="primary" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                Print
              </Button>
            </>
          }
        >
          <PackingListDocument list={list} orders={ordersOf(list)} customer={cust} />
        </Modal>

        <Modal
          open={confirmClose}
          onClose={() => setConfirmClose(false)}
          title={`Submit ${list.id}?`}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirmClose(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  finalizePackingList(list.id);
                  pushToast({
                    tone: "success",
                    title: "Packing list closed",
                    description: "The inspection report is open. Confirm the weights and send it to the customer.",
                  });
                  setConfirmClose(false);
                }}
              >
                Submit to inspection report
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-paper-600">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Submitting opens the <span className="font-semibold">inspection report</span> for this load, the listing
              the customer counter-checks before the container leaves. The weights below carry across to it, and once
              the customer confirms them each order is settled against the kilos actually shipped.
            </p>
            {refs.length > 1 && (
              <p>
                This load covers {refs.length} orders. All of them move to inspection together, and one report goes to
                the customer for the whole container.
              </p>
            )}
            <p>
              The weights on this list are also what print on the packing list and the bill of lading. Nothing is locked
              permanently, so you can reopen it if something needs correcting.
            </p>
          </div>
        </Modal>

        <Modal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete ${list.id}?`}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  removePackingList(list.id);
                  pushToast({ tone: "info", title: "Packing list deleted", description: list.id });
                  navigate("/packing");
                }}
              >
                Delete list
              </Button>
            </>
          }
        >
          <p className="text-sm text-paper-600">
            Everything recorded on this list is removed, and the quantities on it stop counting towards every order it
            covers.
          </p>
        </Modal>
      </div>

      {/* The printed copy. Hidden on screen, and the only thing on the page when printing. */}
      <div className="hidden print:block">
        <PackingListDocument
          list={list}
          orders={ordersOf(list)}
          customer={cust}
          domId="packing-list-print"
        />
      </div>
    </div>
  );
}
