import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Save,
  Send,
  CheckCircle2,
  Printer,
  GitBranch,
  MessageSquareReply,
  ArrowRightCircle,
  History,
  ChevronLeft,
  Pencil,
  Trash2,
  Copy,
  Undo2,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PIDocumentPreview } from "@/components/domain/PIDocumentPreview";
import { ProcessDiscoveryNote } from "@/components/domain/ProcessDiscoveryNote";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate, piRef, revisionLabel, revisionTag } from "@/lib/format";
import { totalsForQuotation } from "@/lib/totals";
import { ORDER_STAGES, stageMeta } from "@/lib/types";

type ModalKind = "revision" | "response" | "convert" | "delete" | "restore" | "preview" | "editWarning" | null;

export function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    quotations,
    role,
    updateQuotationStatus,
    createRevision,
    convertToSalesOrder,
    removeQuotation,
    duplicateQuotation,
    restoreRevision,
    updateRevisionNote,
    pushToast,
    customers,
    inquiries,
    assessments,
    salesOrders,
    payments,
  } = useStore();
  const [modal, setModal] = useState<ModalKind>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [previewNo, setPreviewNo] = useState<number | null>(null);
  const [editingNoteNo, setEditingNoteNo] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteText, setNoteText] = useState("");
  const [responseDecision, setResponseDecision] = useState<"accepted" | "rejected" | "under_negotiation">("accepted");

  const q = quotations.find((x) => x.id === id);

  const customer = q ? customers.find((c) => c.id === q.customerId) : undefined;
  const canApprove = role === "sales_manager" || role === "management" || role === "admin";

  // Single shared roll-up. Prefers the authored batch tree, falls back to the flat line list for
  // quotations that predate it.
  const total = useMemo(() => (q ? totalsForQuotation(q).grandTotal : 0), [q]);

  /**
   * The sales order raised from this quotation, if there is one.
   *
   * Its existence changes what editing means. Up to that point a quotation is a proposal and can
   * be reworked freely; afterwards it is the basis of a live order, and its figures are what the
   * customer will be invoiced against.
   */
  /**
   * Editing in place is only honest while the document is still a draft.
   *
   * Once it has been approved, somebody has signed off the figures and they may already be with
   * the customer. Changing them silently means the copy in their inbox and the copy here disagree
   * with nothing on the record to explain it. Create Revision does the same job and keeps both.
   */
  const isEditable = q?.status === "draft" || q?.status === "revised";

  const linkedOrder = q?.salesOrderId ? salesOrders.find((so) => so.id === q.salesOrderId) : undefined;
  /** A closed-out order is history. Nothing upstream of it can usefully change any more. */
  const orderCompleted = linkedOrder?.currentStage === "completed";

  /** Past deposit means money has moved, so a change of value is somebody else's decision too. */
  const orderPastDeposit = linkedOrder
    ? ORDER_STAGES.findIndex((s) => s.id === linkedOrder.currentStage) >
      ORDER_STAGES.findIndex((s) => s.id === "deposit")
    : false;
  /**
   * Whether a revision may safely send the order back to quotation-only.
   *
   * Nothing has been lost if nothing has been paid — the order is just the figures, raised again
   * once the revision is accepted. Once money has actually arrived, deleting the order would delete
   * the record of that money with it, so the order is left alone instead. Mirrors the same check
   * `createRevision` makes in the store; kept here too so the warning describes what will actually
   * happen rather than the general rule.
   */
  const orderRevertible = linkedOrder
    ? !payments.some((p) => p.salesOrderId === linkedOrder.id && p.amountReceived > 0)
    : false;

  // Traceability back up the chain: which inquiry this came from, and whether the plant costed it.
  const sourceInquiry = inquiries.find((i) => i.quotationId === q?.id);
  const sourceAssessment = assessments.find((a) => a.quotationId === q?.id);

  const previewRevision = q?.revisions.find((r) => r.revisionNo === previewNo);
  // Viewing the CURRENT revision shows the live record, not its snapshot. A snapshot is captured
  // when its revision is created and only refreshed when the history next changes, so for the
  // revision you are actively editing it is stale by definition. Earlier revisions are closed
  // books, so those render from their snapshot laid over the current record. Either way it goes
  // through the same document component as the real PI, so the two cannot drift apart.
  const previewQuotation = !q
    ? undefined
    : previewNo === q.revisionNo
      ? q
      : previewRevision?.snapshot
        ? { ...q, ...previewRevision.snapshot, revisionNo: previewRevision.revisionNo }
        : undefined;

  if (!q) {
    return (
      <div>
        <PageHeader title="Quotation not found" breadcrumb={["Fortune Net & Twine ERP", "Quotations"]} />
        <Button variant="secondary" onClick={() => navigate("/quotations")}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to Quotations
        </Button>
      </div>
    );
  }

  function closeModal() {
    setModal(null);
    setNoteText("");
  }

  function handleSubmitForApproval() {
    updateQuotationStatus(q!.id, "for_approval");
    pushToast({ tone: "info", title: "Submitted for approval", description: `${q!.id} sent to Sales Manager.` });
  }

  function handleApprove() {
    updateQuotationStatus(q!.id, "approved");
    pushToast({ tone: "success", title: "Quotation approved", description: `${q!.id} is ready to send to the customer.` });
  }

  function handleMarkSent() {
    updateQuotationStatus(q!.id, "sent");
    pushToast({ tone: "info", title: "Marked as sent", description: `${q!.id} recorded as sent to customer.` });
  }

  function handleCreateRevision() {
    if (!noteText.trim()) return;
    createRevision(q!.id, noteText.trim());
    pushToast({ tone: "info", title: "Revision created", description: `${q!.id} is now Revision ${q!.revisionNo + 1}.` });
    closeModal();
  }

  function handleRecordResponse() {
    updateQuotationStatus(q!.id, responseDecision, noteText.trim() || undefined);
    pushToast({
      tone: responseDecision === "accepted" ? "success" : responseDecision === "rejected" ? "danger" : "warning",
      title: "Customer response recorded",
      description: `${q!.id} marked as ${responseDecision.replace("_", " ")}.`,
    });
    closeModal();
  }

  function handleConvert() {
    const soId = convertToSalesOrder(q!.id);
    closeModal();
    pushToast({ tone: "success", title: "Sales order created", description: `${soId} created from ${q!.id}.` });
    navigate(`/orders/${soId}`);
  }

  return (
    <div>
      <div className="no-print">
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Quotations", piRef(q.id, q.revisionNo)]}
        eyebrow={revisionLabel(q.revisionNo)}
        title={piRef(q.id, q.revisionNo)}
        description={`${customer?.name ?? q.consignee} · ${customer?.country ?? "—"}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={q.status} />
            <Button variant="secondary" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
              Print
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {/* A revised quotation is a draft again: it has to go back through approval, otherwise the
            revision could be sent out carrying the previous version's sign-off. */}
        {(q.status === "draft" || q.status === "revised") && (
          <Button variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={handleSubmitForApproval}>
            Submit
          </Button>
        )}
        {q.status === "for_approval" && canApprove && (
          <Button variant="success" size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={handleApprove}>
            Approve
          </Button>
        )}
        {q.status === "for_approval" && !canApprove && (
          <span className="flex items-center rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-200">
            Awaiting Sales Manager approval
          </span>
        )}
        {q.status === "approved" && (
          <Button variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={handleMarkSent}>
            Mark as Sent
          </Button>
        )}
        {(q.status === "sent" || q.status === "under_negotiation") && (
          <Button
            variant="primary"
            size="sm"
            icon={<MessageSquareReply className="h-3.5 w-3.5" />}
            onClick={() => setModal("response")}
          >
            Record Customer Response
          </Button>
        )}
        {q.status === "accepted" && !q.salesOrderId && (
          <Button
            variant="success"
            size="sm"
            icon={<ArrowRightCircle className="h-3.5 w-3.5" />}
            onClick={() => setModal("convert")}
          >
            Convert to Sales Order
          </Button>
        )}
        {q.salesOrderId && (
          <Link to={`/orders/${q.salesOrderId}`}>
            <Button variant="secondary" size="sm" icon={<ArrowRightCircle className="h-3.5 w-3.5" />}>
              View Sales Order {q.salesOrderId}
            </Button>
          </Link>
        )}
        {/* Edit disappears once the quotation has been approved. Past that point the customer, or
            at least an approver, has seen the figures, and changing them in place leaves no trace
            that they ever differed. Revising is the honest route: the old version is kept, the new
            one is numbered, and the customer's copy can still be reconciled against ours. */}
        {isEditable && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => (linkedOrder ? setModal("editWarning") : navigate(`/quotations/${q.id}/edit`))}
          >
            Edit
          </Button>
        )}
        {/* No revising a finished order. Once the goods have shipped, been paid for and the order
            closed, there is nothing left for a new version of the quotation to change — it would
            only put a document on file that contradicts what actually happened. */}
        {!orderCompleted && (
          <Button
            variant="secondary"
            size="sm"
            icon={<GitBranch className="h-3.5 w-3.5" />}
            onClick={() => setModal("revision")}
          >
            Create Revision
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => {
            const newId = duplicateQuotation(q.id);
            if (!newId) return;
            pushToast({
              tone: "success",
              title: "Quotation duplicated",
              description: `${newId} created for ${customer?.name ?? q.consignee}.`,
            });
            navigate(`/quotations/${newId}`);
          }}
        >
          Duplicate
        </Button>
        <Button variant="ghost" size="sm" icon={<Save className="h-3.5 w-3.5" />} onClick={() => pushToast({ tone: "info", title: "Draft saved" })}>
          Save Draft
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-alert-600"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => setModal("delete")}
        >
          Delete
        </Button>
      </div>
      </div>

      <div className="grid grid-cols-1 gap-5 print:block xl:grid-cols-[380px_1fr]">
        <div className="space-y-4 no-print">
          <Card>
            <CardHeader title="Commercial Summary" eyebrow="Terms" />
            <KeyValue label="Currency" value={q.currency} />
            <KeyValue label="Payment terms" value={q.paymentTerms} />
            <KeyValue label="Deposit required" value={`${q.depositPercent}%`} />
            {q.incoterms && <KeyValue label="Incoterms" value={q.incoterms} />}
            <KeyValue label="Date" value={q.leadTimeDate ? formatDate(q.leadTimeDate) : `${q.leadTimeWeeks} weeks`} />
            <KeyValue label="Est. shipment" value={formatDate(q.estimatedShipmentDate)} />
            <KeyValue label="Validity" value={q.validityDate ? formatDate(q.validityDate) : `${q.validityDays} days`} />
            <div className="my-2 border-t border-paper-100" />
            {sourceInquiry && (
              <KeyValue
                label="From inquiry"
                value={
                  <Link to="/inquiries" className="font-mono text-manifest-600 hover:underline">
                    {sourceInquiry.id}
                  </Link>
                }
              />
            )}
            {sourceAssessment && (
              <KeyValue
                label="Plant assessment"
                value={
                  <Link to="/technical" className="font-mono text-manifest-600 hover:underline">
                    {sourceAssessment.id}
                  </Link>
                }
              />
            )}
            <KeyValue label="Total value" value={formatMoney(total, q.currency)} mono />
            <KeyValue label="Assigned to" value={q.assignedSalesperson} />
          </Card>

          <Card>
            <CardHeader title="Revision History" eyebrow="Audit" action={<History className="h-4 w-4 text-paper-300" />} />
            <div className="space-y-3">
              {[...q.revisions].reverse().map((r) => {
                const isCurrent = r.revisionNo === q.revisionNo;
                return (
                  <div key={r.revisionNo} className="flex gap-2.5 text-xs">
                    <span
                      title={revisionLabel(r.revisionNo)}
                      className={`mt-0.5 flex h-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold ${
                        isCurrent ? "bg-pine-700 text-white" : "bg-pine-100 text-pine-700"
                      }`}
                    >
                      {r.revisionNo > 0 ? revisionTag(r.revisionNo) : "ORIG"}
                    </span>
                    <div className="min-w-0 flex-1">
                      {editingNoteNo === r.revisionNo ? (
                        <div className="flex items-start gap-1.5">
                          <input
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            className="w-full rounded-md border border-paper-200 px-2 py-1 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              updateRevisionNote(q.id, r.revisionNo, noteDraft.trim() || r.note);
                              setEditingNoteNo(null);
                            }}
                          >
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingNoteNo(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingNoteNo(r.revisionNo);
                            setNoteDraft(r.note);
                          }}
                          title="Click to edit this note"
                          className="-m-0.5 block w-full rounded p-0.5 text-left text-paper-700 hover:bg-paper-50"
                        >
                          {r.note}
                        </button>
                      )}
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="text-[10.5px] text-paper-400">
                          {r.changedBy} · {formatDate(r.date)}
                          {isCurrent && <span className="ml-1 font-medium text-pine-700">· current</span>}
                        </p>
                        {/* View first, restore second. Checking what an old revision looked like
                            should not require restoring it and adding a pointless audit entry. */}
                        {r.snapshot && (
                          <button
                            onClick={() => {
                              setPreviewNo(r.revisionNo);
                              setModal("preview");
                            }}
                            className="flex items-center gap-1 text-[10.5px] font-medium text-manifest-600 hover:text-manifest-800"
                          >
                            <Eye className="h-3 w-3" /> View
                          </button>
                        )}
                        {!isCurrent && r.snapshot && (
                          <button
                            onClick={() => {
                              setRestoreTarget(r.revisionNo);
                              setModal("restore");
                            }}
                            className="flex items-center gap-1 text-[10.5px] font-medium text-paper-500 hover:text-manifest-800"
                          >
                            <Undo2 className="h-3 w-3" /> Restore
                          </button>
                        )}
                        {!isCurrent && !r.snapshot && (
                          <span className="text-[10.5px] text-paper-300" title="Saved before revision snapshots existed">
                            no snapshot
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {q.customerResponseNote && (
            <Card className="border-manifest-200 bg-manifest-50/40">
              <CardHeader title="Customer Response" eyebrow="Latest note" />
              <p className="text-sm text-paper-700">{q.customerResponseNote}</p>
            </Card>
          )}

          {q.items.some((li) => li.pricing) && (
            <Card>
              <CardHeader title="Pricing Breakdown" eyebrow="Internal margin review" />
              <div className="space-y-4">
                {q.items
                  .filter((li) => li.pricing)
                  .map((li) => (
                    <div key={li.id} className="border-b border-paper-100 pb-3 last:border-0 last:pb-0">
                      <p className="mb-1.5 text-xs font-semibold text-paper-800">{li.itemCode}</p>
                      <div className="space-y-1 text-[11.5px]">
                        <div className="flex justify-between text-paper-500">
                          <span>Given price/kg</span>
                          <span className="font-mono text-paper-700">{li.pricing!.givenPriceKg.toFixed(2)}</span>
                        </div>
                        {li.pricing!.chain.map((step, i) => (
                          <div key={i} className="flex justify-between text-paper-500">
                            <span>{step.label}</span>
                            <span className="font-mono text-paper-700">→ {step.after.toFixed(4)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-dashed border-paper-200 pt-1 font-medium text-paper-700">
                          <span>New price/kg</span>
                          <span className="font-mono">{li.pricing!.newPriceKg.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-paper-500">
                          <span>Labor + Wastage + Twine</span>
                          <span className="font-mono text-paper-700">
                            {(li.pricing!.laborCost + li.pricing!.wastageCost + li.pricing!.twineCost).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between font-semibold text-pine-700">
                          <span>U/P</span>
                          <span className="font-mono">{li.unitPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          <ProcessDiscoveryNote
            items={[
              "Is customer acceptance received as a signed PI, email confirmation, or separate PO?",
              "Discount approval threshold above which Sales Manager sign-off is mandatory, still to be confirmed.",
              "PI validity auto-expiry: should the system auto-flag expired PIs, or is this manual today?",
            ]}
          />
        </div>

        <PIDocumentPreview q={q} customer={customer} />
      </div>

      <Modal
        open={modal === "revision"}
        onClose={closeModal}
        title="Create New Revision"
        subtitle={`This will create Revision ${q.revisionNo + 1} of ${q.id}.`}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateRevision} disabled={!noteText.trim()}>
              Create Revision
            </Button>
          </>
        }
      >
        {/* A quotation that has already become an order is not a document on its own any more.
            Revising it moves real numbers downstream, so the consequence is spelled out before
            the click rather than discovered at final payment. */}
        {linkedOrder && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {linkedOrder.id} was raised from this quotation
            </p>
            {orderRevertible ? (
              <p className="leading-snug">
                Nothing has been paid against {linkedOrder.id} yet, so creating this revision sends it back to
                quotation-only — {linkedOrder.id} is deleted and this quotation's Sales Order link is cleared. Once the
                revised terms are accepted, convert it to a sales order again.
              </p>
            ) : (
              <ul className="ml-5 list-disc space-y-0.5 leading-snug">
                <li>Money has already moved on this order, so it is kept rather than deleted.</li>
                <li>The order value follows this quotation once the revised figures are saved.</li>
                <li>Deposit and balance are restated to match — anything already verified is left alone.</li>
                <li>Approval resets, and the customer's acceptance is cleared: they agreed to the current version, not this one.</li>
                {orderPastDeposit && (
                  <li className="font-semibold">
                    This order has already reached {stageMeta(linkedOrder.currentStage).label}. Check with Finance before
                    changing what it is worth.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        <label className="mb-1.5 block text-xs font-medium text-paper-600">Reason for revision</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          placeholder="e.g. Adjusted mesh depth per factory counter-offer"
          className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </Modal>

      <Modal
        open={modal === "response"}
        onClose={closeModal}
        title="Record Customer Response"
        subtitle={`Log how ${customer?.name ?? "the customer"} responded to ${q.id}.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleRecordResponse}>
              Save Response
            </Button>
          </>
        }
      >
        <div className="mb-3 grid grid-cols-3 gap-2">
          {(["accepted", "under_negotiation", "rejected"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setResponseDecision(d)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                responseDecision === d
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              }`}
            >
              {d.replace("_", " ")}
            </button>
          ))}
        </div>
        <label className="mb-1.5 block text-xs font-medium text-paper-600">Note (optional)</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          placeholder="e.g. Customer requests standard selvage length be guaranteed in writing"
          className="w-full rounded-lg border border-paper-200 px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </Modal>

      {/* A read-only rendering of the document as it stood at the chosen revision, built by laying
          that revision's snapshot over the current record. Nothing is written, so looking costs
          nothing in the audit trail. Restore is offered from here for when looking was enough to
          decide. */}
      <Modal
        open={modal === "editWarning"}
        onClose={closeModal}
        title="This quotation already has a sales order"
        subtitle={linkedOrder ? `${linkedOrder.id} was raised from ${piRef(q.id, q.revisionNo)}.` : undefined}
        width="max-w-lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<GitBranch className="h-3.5 w-3.5" />}
              onClick={() => setModal("revision")}
            >
              Create a revision instead
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate(`/quotations/${q.id}/edit`)}>
              Edit anyway
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-paper-600">
          <p>
            Saving changes here updates {linkedOrder?.id} to match: the order value, and the deposit and balance still
            outstanding against it. Payments already verified are left alone, because that money actually arrived.
          </p>
          {orderPastDeposit && linkedOrder && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {linkedOrder.id} has reached {stageMeta(linkedOrder.currentStage).label}. Money has already moved on this
              order, so check with Finance before changing what it is worth.
            </p>
          )}
          <p className="text-xs text-paper-500">
            Editing in place leaves no trace of what the figures used to be. If the customer needs to see what changed,
            create a revision instead — it keeps the old version and issues the document as{" "}
            {piRef(q.id, q.revisionNo + 1)}.{" "}
            {orderRevertible
              ? `Nothing has been paid against ${linkedOrder?.id} yet, so a revision sends it back to quotation-only rather than updating it in place.`
              : `${linkedOrder?.id} stays linked either way — money has already moved on it.`}
          </p>
        </div>
      </Modal>

      <Modal
        open={modal === "preview" && previewRevision !== undefined}
        onClose={() => {
          closeModal();
          setPreviewNo(null);
        }}
        title={`${revisionLabel(previewNo ?? 0)} preview${previewNo === q.revisionNo ? " (current, live)" : ""}`}
        subtitle={
          previewRevision
            ? `${previewRevision.note} · ${previewRevision.changedBy} · ${formatDate(previewRevision.date)}`
            : undefined
        }
        width="max-w-4xl"
        footer={
          <>
            <span className="mr-auto text-xs text-paper-500">
              {previewNo === q.revisionNo
                ? "The current revision, shown live as it stands now."
                : "Read only. Nothing is changed by viewing a revision."}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                closeModal();
                setPreviewNo(null);
              }}
            >
              Close
            </Button>
            {previewNo !== null && previewNo !== q.revisionNo && (
              <Button
                variant="primary"
                size="sm"
                icon={<Undo2 className="h-3.5 w-3.5" />}
                onClick={() => {
                  setRestoreTarget(previewNo);
                  setPreviewNo(null);
                  setModal("restore");
                }}
              >
                Restore this revision
              </Button>
            )}
          </>
        }
      >
        {previewQuotation && (
          <div className="rounded-lg border border-paper-200">
            <PIDocumentPreview q={previewQuotation} customer={customer} domId="pi-revision-preview" />
          </div>
        )}
      </Modal>

      <Modal
        open={modal === "restore"}
        onClose={() => {
          closeModal();
          setRestoreTarget(null);
        }}
        title={`Restore Revision ${restoreTarget}?`}
        subtitle="Nothing in the history is lost."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                closeModal();
                setRestoreTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (restoreTarget !== null) {
                  restoreRevision(q.id, restoreTarget);
                  pushToast({
                    tone: "success",
                    title: "Revision restored",
                    description: `${piRef(q.id, restoreTarget)} is current again. The restore is in the Activity Logs.`,
                  });
                }
                closeModal();
                setRestoreTarget(null);
              }}
            >
              Restore revision
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          What's on screen now is captured into the {revisionLabel(q.revisionNo).toLowerCase()} first, so nothing is
          lost. The quotation then goes back to being{" "}
          <span className="font-semibold">{revisionLabel(restoreTarget ?? 0).toLowerCase()}</span> — the same number the
          customer already has for this content, rather than a new one. The restore is recorded in the Activity Logs
          with your name against it. Approval resets, so the restored version has to be approved again.
        </p>
      </Modal>

      <Modal
        open={modal === "delete"}
        onClose={closeModal}
        title={`Delete ${q.id}?`}
        subtitle="This removes the quotation from this browser. It cannot be undone."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                removeQuotation(q.id);
                pushToast({ tone: "info", title: "Quotation deleted", description: `${q.id} removed.` });
                navigate("/quotations");
              }}
            >
              Delete quotation
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          {q.salesOrderId
            ? `This quotation has already been converted to ${q.salesOrderId}. Deleting it leaves that sales order in place, referencing a quotation that no longer exists.`
            : "Any batch groups, specifications and pricing on this quotation will be discarded."}
        </p>
      </Modal>

      <Modal
        open={modal === "convert"}
        onClose={closeModal}
        title="Convert to Sales Order"
        subtitle={`This creates a new Sales Order from ${q.id} and starts the fulfillment lifecycle.`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeModal}>
              Cancel
            </Button>
            <Button variant="success" size="sm" onClick={handleConvert}>
              Create Sales Order
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          A new Sales Order will be created for <span className="font-semibold">{customer?.name}</span> with a
          value of <span className="font-mono font-semibold">{formatMoney(total, q.currency)}</span>. Deposit and
          balance payment records will be generated automatically based on the agreed{" "}
          <span className="font-semibold">{q.depositPercent}%</span> deposit term.
        </p>
      </Modal>
    </div>
  );
}
