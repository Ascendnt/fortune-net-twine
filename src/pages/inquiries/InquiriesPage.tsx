import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Search, Send, Inbox, FileText, XCircle, ShoppingCart, Paperclip } from "lucide-react";
import clsx from "clsx";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { NON_NEGATIVE, toNonNegative } from "@/lib/num";
import type { CustomerInquiry, InquiryStatus } from "@/lib/types";

// The front of the pipeline. The point this page has to make is that an inquiry is not a promise
// of a quotation: it can be forwarded to the plant, quoted, closed as out of scope, lost to a
// competitor, or turned straight into an order when the customer sends their own PO.

const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "New",
  forwarded_to_plant: "With plant",
  assessment_received: "Assessment in",
  quoted: "Quoted",
  direct_order: "Direct order",
  no_quote: "Not quoted",
  lost: "Lost",
};

const STATUS_TONE: Record<InquiryStatus, string> = {
  new: "bg-manifest-100 text-manifest-800",
  forwarded_to_plant: "bg-amber-100 text-amber-800",
  assessment_received: "bg-pine-100 text-pine-800",
  quoted: "bg-pine-100 text-pine-800",
  direct_order: "bg-pine-100 text-pine-800",
  no_quote: "bg-paper-100 text-paper-600",
  lost: "bg-alert-50 text-alert-700",
};

const FILTERS: { id: InquiryStatus | "all" | "open"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "new", label: "New" },
  { id: "forwarded_to_plant", label: "With plant" },
  { id: "assessment_received", label: "Assessment in" },
  { id: "quoted", label: "Quoted" },
  { id: "direct_order", label: "Direct order" },
  { id: "no_quote", label: "Not quoted" },
  { id: "lost", label: "Lost" },
];

const OPEN_STATUSES: InquiryStatus[] = ["new", "forwarded_to_plant", "assessment_received"];

const input =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const label = "mb-1 block text-xs font-medium text-paper-600";

type ModalKind = "forward" | "close" | "direct" | "mail" | null;

export function InquiriesPage() {
  const navigate = useNavigate();
  const {
    inquiries,
    assessments,
    mail,
    customers,
    forwardInquiryToPlant,
    closeInquiry,
    createDirectSalesOrder,
    createInquiryFromMail,
    markMailRead,
    pushToast,
  } = useStore();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [target, setTarget] = useState<CustomerInquiry | null>(null);
  const [forwardNote, setForwardNote] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [closeKind, setCloseKind] = useState<"no_quote" | "lost">("no_quote");
  const [po, setPo] = useState({ poNo: "", value: 0, deliveryDate: new Date().toISOString().slice(0, 10) });

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "Unknown customer";

  const rows = useMemo(
    () =>
      inquiries.filter((i) => {
        if (filter === "open" && !OPEN_STATUSES.includes(i.status)) return false;
        if (filter !== "all" && filter !== "open" && i.status !== filter) return false;
        if (!query) return true;
        const haystack = `${i.id} ${i.subject} ${customerName(i.customerId)} ${i.requirement}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inquiries, filter, query, customers]
  );

  const stats = useMemo(() => {
    const total = inquiries.length;
    const quoted = inquiries.filter((i) => i.status === "quoted").length;
    const direct = inquiries.filter((i) => i.status === "direct_order").length;
    const closed = inquiries.filter((i) => i.status === "no_quote" || i.status === "lost").length;
    // The headline number for this page: how many inquiries never became a quotation at all.
    const withoutQuote = total === 0 ? 0 : Math.round(((direct + closed) / total) * 100);
    return { total, quoted, direct, closed, withoutQuote };
  }, [inquiries]);

  const unread = mail.filter((m) => m.folder === "inbox" && !m.read).length;

  function openModal(kind: ModalKind, inquiry: CustomerInquiry | null) {
    setTarget(inquiry);
    setForwardNote("");
    setCloseReason("");
    setCloseKind("no_quote");
    setPo({ poNo: "", value: 0, deliveryDate: new Date().toISOString().slice(0, 10) });
    setModal(kind);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Sales"]}
        eyebrow="Pipeline Intake"
        title="Customer Inquiries"
        description="Everything that has come in, and what happened to it. Not every inquiry becomes a quotation."
        actions={
          <Button variant="primary" size="sm" icon={<Inbox className="h-3.5 w-3.5" />} onClick={() => setModal("mail")}>
            Mailbox{unread > 0 ? ` (${unread})` : ""}
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total inquiries" value={String(stats.total)} />
        <StatCard label="Became quotations" value={String(stats.quoted)} tone="pine" />
        <StatCard label="Straight to order" value={String(stats.direct)} tone="pine" />
        <StatCard label="Never quoted" value={`${stats.withoutQuote}%`} tone="amber" sublabel="Closed, lost or direct" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inquiry, customer, requirement…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-pine-700 bg-pine-700 text-white"
                  : "border-paper-200 bg-white text-paper-600 hover:bg-paper-50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Mail className="h-5 w-5" />} title="No inquiries match your filters" />
      ) : (
        <Table>
          <THead>
            <TH>Inquiry</TH>
            <TH>Customer</TH>
            <TH>Received</TH>
            <TH>Status</TH>
            <TH>Outcome</TH>
            <TH>Actions</TH>
          </THead>
          <tbody>
            {rows.map((i) => {
              const assessment = assessments.find((a) => a.id === i.assessmentId);
              return (
                <TR key={i.id}>
                  <TD>
                    <p className="font-mono text-xs font-semibold text-pine-800">{i.id}</p>
                    <p className="max-w-md truncate text-xs text-paper-600">{i.subject}</p>
                    {i.attachments.length > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-paper-400">
                        <Paperclip className="h-3 w-3" /> {i.attachments.length}
                      </p>
                    )}
                  </TD>
                  <TD className="text-xs">{customerName(i.customerId)}</TD>
                  <TD className="font-mono text-xs">{formatDate(i.receivedDate)}</TD>
                  <TD>
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[i.status])}>
                      {STATUS_LABEL[i.status]}
                    </span>
                  </TD>
                  <TD className="text-xs">
                    {i.quotationId && (
                      <Link to={`/quotations/${i.quotationId}`} className="font-mono text-manifest-600 hover:underline">
                        {i.quotationId}
                      </Link>
                    )}
                    {i.salesOrderId && (
                      <Link to={`/orders/${i.salesOrderId}`} className="font-mono text-manifest-600 hover:underline">
                        {i.salesOrderId}
                      </Link>
                    )}
                    {!i.quotationId && !i.salesOrderId && (
                      <span className="text-paper-400">{i.closeReason ? "Closed" : "-"}</span>
                    )}
                    {assessment && !i.quotationId && (
                      <Link
                        to="/technical"
                        className="ml-1 font-mono text-[10.5px] text-paper-400 hover:text-manifest-600"
                      >
                        {assessment.id}
                      </Link>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {i.status === "new" && (
                        <Button variant="secondary" size="sm" icon={<Send className="h-3 w-3" />} onClick={() => openModal("forward", i)}>
                          Forward to plant
                        </Button>
                      )}
                      {i.status === "assessment_received" && (
                        <Button variant="primary" size="sm" icon={<FileText className="h-3 w-3" />} onClick={() => navigate("/technical")}>
                          Review assessment
                        </Button>
                      )}
                      {OPEN_STATUSES.includes(i.status) && (
                        <>
                          <Button variant="secondary" size="sm" icon={<ShoppingCart className="h-3 w-3" />} onClick={() => openModal("direct", i)}>
                            Direct order
                          </Button>
                          <Button variant="ghost" size="sm" icon={<XCircle className="h-3 w-3" />} onClick={() => openModal("close", i)}>
                            Close
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      {/* ---- Forward to plant ---- */}
      <Modal
        open={modal === "forward"}
        onClose={() => setModal(null)}
        title={`Forward ${target?.id} to the plant`}
        subtitle="Opens a pending technical assessment so the wait on the plant is tracked, not just sitting in a sent folder."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (target) {
                  const id = forwardInquiryToPlant(target.id, forwardNote);
                  pushToast({ tone: "success", title: "Forwarded to plant", description: `${id} opened, awaiting reply.` });
                }
                setModal(null);
              }}
            >
              Forward
            </Button>
          </>
        }
      >
        <label className={label}>Note to the plant</label>
        <textarea
          value={forwardNote}
          onChange={(e) => setForwardNote(e.target.value)}
          rows={4}
          placeholder="What do you need from them? Feasibility, costing, a substitution view…"
          className={input}
        />
        <p className="mt-2 text-xs text-paper-500">
          Sends from the sales mailbox and files a copy under Sent to plant.
        </p>
      </Modal>

      {/* ---- Close without quoting ---- */}
      <Modal
        open={modal === "close"}
        onClose={() => setModal(null)}
        title={`Close ${target?.id} without quoting`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!closeReason.trim()}
              onClick={() => {
                if (target) {
                  closeInquiry(target.id, closeKind, closeReason.trim());
                  pushToast({ tone: "info", title: "Inquiry closed", description: target.id });
                }
                setModal(null);
              }}
            >
              Close inquiry
            </Button>
          </>
        }
      >
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["no_quote", "lost"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setCloseKind(k)}
              className={clsx(
                "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                closeKind === k ? "border-pine-700 bg-pine-50" : "border-paper-200 hover:bg-paper-50"
              )}
            >
              <span className="block font-semibold text-paper-800">{k === "no_quote" ? "Not quoted" : "Lost"}</span>
              <span className="block text-[11px] text-paper-500">
                {k === "no_quote" ? "We chose not to quote" : "We quoted or considered, customer went elsewhere"}
              </span>
            </button>
          ))}
        </div>
        <label className={label}>Reason</label>
        <textarea
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
          rows={3}
          placeholder="Why? This is the part that is useful six months from now."
          className={input}
        />
      </Modal>

      {/* ---- Direct order on the customer's own PO ---- */}
      <Modal
        open={modal === "direct"}
        onClose={() => setModal(null)}
        title={`Raise a sales order from ${target?.id}`}
        subtitle="For customers who send their own PO with parts and prices already agreed. No proforma is issued."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!po.poNo.trim() || po.value <= 0}
              onClick={() => {
                if (target) {
                  const soId = createDirectSalesOrder(target.id, { ...po, poNo: po.poNo.trim() });
                  pushToast({ tone: "success", title: "Sales order raised", description: `${soId} created on PO ${po.poNo}.` });
                  setModal(null);
                  navigate(`/orders/${soId}`);
                  return;
                }
                setModal(null);
              }}
            >
              Create sales order
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Customer PO number</label>
            <input value={po.poNo} onChange={(e) => setPo({ ...po, poNo: e.target.value })} placeholder="PO-88231" className={input} />
          </div>
          <div>
            <label className={label}>Order value</label>
            <input {...NON_NEGATIVE} value={po.value} onChange={(e) => setPo({ ...po, value: toNonNegative(e.target.value) })} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Requested delivery</label>
            <input
              type="date"
              value={po.deliveryDate}
              onChange={(e) => setPo({ ...po, deliveryDate: e.target.value })}
              className={input}
            />
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-paper-50 px-3 py-2 text-[11.5px] text-paper-500">
          The order starts at Internal Verification rather than Customer Confirmation: raising the PO <em>is</em> the
          customer's confirmation. Deposit and balance milestones are generated at 30%.
        </p>
      </Modal>

      <MailboxModal open={modal === "mail"} onClose={() => setModal(null)} onRead={markMailRead} onRaise={(id) => {
        const inquiryId = createInquiryFromMail(id);
        pushToast({ tone: "success", title: "Inquiry raised", description: `${inquiryId} created from email.` });
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Mock mailbox
// ---------------------------------------------------------------------------------------------

function MailboxModal({
  open,
  onClose,
  onRead,
  onRaise,
}: {
  open: boolean;
  onClose: () => void;
  onRead: (id: string) => void;
  onRaise: (id: string) => void;
}) {
  const { mail } = useStore();
  const [folder, setFolder] = useState<"inbox" | "sent" | "plant_reply">("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const messages = mail.filter((m) => m.folder === folder);
  const selected = messages.find((m) => m.id === selectedId) ?? messages[0];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mailbox"
      subtitle="Sales mailbox. Raise an inquiry from a customer email, or read the plant's reply."
      width="max-w-5xl"
      footer={
        <>
          <span className="mr-auto text-xs text-paper-500">sales@fortunenet.com.ph</span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-1">
        {(
          [
            ["inbox", "Inbox"],
            ["sent", "Sent to plant"],
            ["plant_reply", "Plant replies"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            onClick={() => {
              setFolder(id);
              setSelectedId(null);
            }}
            className={clsx(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              folder === id ? "bg-pine-700 text-white" : "text-paper-600 hover:bg-paper-100"
            )}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[260px_1fr]">
        <div className="max-h-[46vh] space-y-1 overflow-y-auto rounded-lg border border-paper-200 p-1.5">
          {messages.length === 0 && <p className="px-2 py-6 text-center text-xs text-paper-400">Nothing here.</p>}
          {messages.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedId(m.id);
                if (!m.read) onRead(m.id);
              }}
              className={clsx(
                "block w-full rounded-md px-2.5 py-2 text-left transition-colors",
                selected?.id === m.id ? "bg-manifest-50" : "hover:bg-paper-50"
              )}
            >
              <p className={clsx("truncate text-xs", m.read ? "text-paper-600" : "font-semibold text-paper-900")}>
                {m.subject}
              </p>
              <p className="truncate text-[10.5px] text-paper-400">{m.from}</p>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-paper-200 p-3">
          {!selected ? (
            <p className="py-10 text-center text-xs text-paper-400">Select a message.</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-paper-900">{selected.subject}</p>
              <p className="mt-0.5 text-[11px] text-paper-500">
                {selected.from} → {selected.to} · {formatDate(selected.date.slice(0, 10))}
              </p>
              {selected.attachmentNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.attachmentNames.map((a) => (
                    <span key={a} className="flex items-center gap-1 rounded-full bg-paper-100 px-2 py-0.5 text-[10.5px] text-paper-600">
                      <Paperclip className="h-2.5 w-2.5" /> {a}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-paper-700">{selected.body}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper-100 pt-3">
                {selected.folder === "inbox" && !selected.linkedInquiryId && (
                  <Button variant="primary" size="sm" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => onRaise(selected.id)}>
                    Raise inquiry from this email
                  </Button>
                )}
                {selected.linkedInquiryId && (
                  <span className="font-mono text-[11px] text-pine-700">Linked to {selected.linkedInquiryId}</span>
                )}
                {selected.linkedAssessmentId && (
                  <span className="font-mono text-[11px] text-pine-700">· {selected.linkedAssessmentId}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

    </Modal>
  );
}
