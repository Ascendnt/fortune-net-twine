import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Mail, Phone, Plus, Pencil, Trash2, Star, Check, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { formatMoney, formatDate, initials } from "@/lib/format";
import type { Contact } from "@/lib/types";

const fieldClass =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";

export function CustomersList() {
  const { customers, addContact, updateContact, removeContact } = useStore();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<{ name: string; title: string; email: string; phone: string }>({
    name: "",
    title: "",
    email: "",
    phone: "",
  });
  const navigate = useNavigate();

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined;
  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.country.toLowerCase().includes(query.toLowerCase())
  );

  function openCustomer(id: string) {
    setSelectedId(id);
    setAddingContact(false);
    setEditingContactId(null);
  }

  function closeModal() {
    setSelectedId(null);
    setAddingContact(false);
    setEditingContactId(null);
  }

  function resetDraft() {
    setContactDraft({ name: "", title: "", email: "", phone: "" });
  }

  function startAdd() {
    resetDraft();
    setEditingContactId(null);
    setAddingContact(true);
  }

  function startEdit(c: Contact) {
    setContactDraft({ name: c.name, title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "" });
    setAddingContact(false);
    setEditingContactId(c.id);
  }

  function cancelContactEdit() {
    setAddingContact(false);
    setEditingContactId(null);
    resetDraft();
  }

  function saveContact() {
    if (!selected || !contactDraft.name.trim()) return;
    const patch = {
      name: contactDraft.name.trim(),
      title: contactDraft.title.trim() || undefined,
      email: contactDraft.email.trim() || undefined,
      phone: contactDraft.phone.trim() || undefined,
    };
    if (editingContactId) {
      updateContact(selected.id, editingContactId, patch);
    } else {
      addContact(selected.id, { ...patch, isPrimary: !(selected.contacts && selected.contacts.length > 0) });
    }
    cancelContactEdit();
  }

  const contactList: Contact[] = selected?.contacts ?? (selected ? [{ id: "primary", name: selected.contactPerson, isPrimary: true }] : []);

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Customer Master"
        title="Customers"
        description="Company profiles, default terms, contacts, and outstanding balances."
      />

      <div className="mb-4 relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer or country…"
          className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </div>

      <Table>
        <THead>
          <TH>Customer</TH>
          <TH>Country</TH>
          <TH>Default Terms</TH>
          <TH>Total Orders</TH>
          <TH>Total Value</TH>
          <TH>Outstanding</TH>
        </THead>
        <tbody>
          {filtered.map((c) => (
            <TR key={c.id} onClick={() => openCustomer(c.id)}>
              <TD>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine-100 font-mono text-[11px] font-semibold text-pine-700">
                    {initials(c.name)}
                  </div>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-paper-400">{c.contactPerson}</p>
                  </div>
                </div>
              </TD>
              <TD>{c.country}</TD>
              <TD className="text-xs">{c.defaultPaymentTerms}</TD>
              <TD className="font-mono">{c.totalOrders}</TD>
              <TD className="font-mono font-medium">{formatMoney(c.totalValueUSD)}</TD>
              <TD className={`font-mono font-medium ${c.outstandingBalanceUSD > 0 ? "text-alert-600" : "text-pine-600"}`}>
                {formatMoney(c.outstandingBalanceUSD)}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <Modal
        open={!!selected}
        onClose={closeModal}
        title={selected?.name ?? ""}
        subtitle={selected?.country}
        width="max-w-xl"
        footer={
          selected && (
            <Button variant="primary" size="sm" onClick={() => navigate("/quotations/new")}>
              New Quotation for this Customer
            </Button>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <Card padded={false} className="border-0 shadow-none">
              <KeyValue label="Consignee" value={selected.consignee} />
              <KeyValue label="Address" value={<span className="text-right">{selected.address}</span>} />
              <div className="my-2 border-t border-paper-100" />
              <KeyValue label="Default payment terms" value={selected.defaultPaymentTerms} />
              <KeyValue label="Default currency" value={selected.defaultCurrency} />
              <KeyValue label="Customer since" value={formatDate(selected.since)} />
              <KeyValue label="Agent" value={selected.agent ?? "—"} />
              <KeyValue
                label="Issuing entity"
                value={
                  selected.letterhead === "NETTEX MFG. AND EXPORT CORP."
                    ? "Nettex Mfg. and Export Corp."
                    : "Fortune Net & Twine Manufacturing Corp."
                }
              />
              <div className="my-2 border-t border-paper-100" />
              <KeyValue label="Total orders" value={String(selected.totalOrders)} />
              <KeyValue label="Total value" value={formatMoney(selected.totalValueUSD)} mono />
              <KeyValue label="Outstanding balance" value={formatMoney(selected.outstandingBalanceUSD)} mono />
            </Card>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">
                  Contacts — pick who a quotation is addressed to
                </p>
                {!addingContact && !editingContactId && (
                  <button
                    onClick={startAdd}
                    className="flex items-center gap-1 rounded-md border border-paper-200 px-2 py-1 text-[11px] font-medium text-paper-600 hover:border-manifest-400 hover:text-manifest-700"
                  >
                    <Plus className="h-3 w-3" /> Add contact
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {contactList.map((c) =>
                  editingContactId === c.id ? (
                    <ContactForm key={c.id} draft={contactDraft} setDraft={setContactDraft} onSave={saveContact} onCancel={cancelContactEdit} />
                  ) : (
                    <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-paper-50 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {c.isPrimary && <Star className="h-3 w-3 shrink-0 fill-manifest-500 text-manifest-500" />}
                          <p className="truncate text-sm font-medium text-paper-800">
                            {c.name}
                            {c.title && <span className="ml-1 text-xs font-normal text-paper-400">· {c.title}</span>}
                          </p>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-paper-400">
                          {c.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => startEdit(c)} className="rounded p-1 text-paper-400 hover:bg-white hover:text-paper-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {selected.contacts && selected.contacts.length > 1 && (
                          <button
                            onClick={() => removeContact(selected.id, c.id)}
                            className="rounded p-1 text-paper-400 hover:bg-white hover:text-alert-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
                {addingContact && (
                  <ContactForm draft={contactDraft} setDraft={setContactDraft} onSave={saveContact} onCancel={cancelContactEdit} isNew />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {filtered.length === 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-paper-400">
          <Users className="h-4 w-4" /> No customers match your search.
        </div>
      )}
    </div>
  );
}

function ContactForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  isNew,
}: {
  draft: { name: string; title: string; email: string; phone: string };
  setDraft: (d: { name: string; title: string; email: string; phone: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-manifest-300 bg-manifest-50/40 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Name (e.g. Mr. Juan Dela Cruz)"
          className={`col-span-2 ${fieldClass}`}
        />
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Title (optional)"
          className={fieldClass}
        />
        <input
          value={draft.phone}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          placeholder="Phone (optional)"
          className={fieldClass}
        />
        <input
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          placeholder="Email (optional)"
          className={`col-span-2 ${fieldClass}`}
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-paper-500 hover:bg-white">
          <X className="h-3 w-3" /> Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!draft.name.trim()}
          className="flex items-center gap-1 rounded-md bg-pine-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-pine-600 disabled:bg-paper-300"
        >
          <Check className="h-3 w-3" /> {isNew ? "Add contact" : "Save"}
        </button>
      </div>
    </div>
  );
}
