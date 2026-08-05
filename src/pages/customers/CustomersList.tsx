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
import type { Contact, Currency, Customer } from "@/lib/types";

const fieldClass =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const formClass =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const formLabel = "mb-1 block text-xs font-medium text-paper-600";

type CustomerDraft = Omit<Customer, "id">;

const EMPTY_CUSTOMER: CustomerDraft = {
  name: "",
  consignee: "",
  country: "",
  address: "",
  contactPerson: "",
  email: "",
  phone: "",
  defaultPaymentTerms: "T/T 30% deposit, 70% before shipment",
  defaultCurrency: "USD",
  totalOrders: 0,
  totalValueUSD: 0,
  outstandingBalanceUSD: 0,
  since: new Date().toISOString().slice(0, 10),
  letterhead: "FORTUNE NET & TWINE MFG. CORP.",
  agent: "HOUSE ACCOUNT",
};

export function CustomersList() {
  const { customers, addContact, updateContact, removeContact, addCustomer, updateCustomer, removeCustomer, pushToast } =
    useStore();
  const [customerForm, setCustomerForm] = useState<{ draft: CustomerDraft; id: string | null } | null>(null);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState<Customer | null>(null);
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

  function saveCustomer() {
    if (!customerForm) return;
    const { draft, id } = customerForm;
    if (!draft.name.trim() || !draft.country.trim()) {
      pushToast({ tone: "warning", title: "Name and country are required" });
      return;
    }
    const normalized: CustomerDraft = {
      ...draft,
      name: draft.name.trim(),
      country: draft.country.trim(),
      consignee: draft.consignee.trim() || draft.name.trim(),
    };
    if (id) {
      updateCustomer(id, normalized);
      pushToast({ tone: "success", title: "Customer updated", description: normalized.name });
    } else {
      addCustomer(normalized);
      pushToast({ tone: "success", title: "Customer added", description: normalized.name });
    }
    setCustomerForm(null);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Customer Master"
        title="Customers"
        description="Company profiles, default terms, contacts, and outstanding balances."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setCustomerForm({ draft: { ...EMPTY_CUSTOMER }, id: null })}
          >
            Add Customer
          </Button>
        }
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
          <TH> </TH>
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
              <TD>
                <div className="flex justify-end gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const { id, ...draft } = c;
                      void id;
                      setCustomerForm({ draft, id: c.id });
                    }}
                    className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-manifest-700"
                    aria-label={`Edit ${c.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteCustomer(c);
                    }}
                    className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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

      <Modal
        open={customerForm !== null}
        onClose={() => setCustomerForm(null)}
        title={customerForm?.id ? "Edit customer" : "Add customer"}
        subtitle="Defaults pre-fill new quotations but stay editable per quotation."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCustomerForm(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={saveCustomer}>
              {customerForm?.id ? "Save changes" : "Add customer"}
            </Button>
          </>
        }
      >
        {customerForm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={formLabel}>Company name</label>
              <input
                value={customerForm.draft.name}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, name: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Country</label>
              <input
                value={customerForm.draft.country}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, country: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Consignee</label>
              <input
                value={customerForm.draft.consignee}
                placeholder="Defaults to the company name"
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, consignee: e.target.value } })}
                className={formClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={formLabel}>Address</label>
              <input
                value={customerForm.draft.address}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, address: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Primary contact</label>
              <input
                value={customerForm.draft.contactPerson}
                onChange={(e) =>
                  setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, contactPerson: e.target.value } })
                }
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Email</label>
              <input
                value={customerForm.draft.email}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, email: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Phone</label>
              <input
                value={customerForm.draft.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, phone: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Default currency</label>
              <select
                value={customerForm.draft.defaultCurrency}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    draft: { ...customerForm.draft, defaultCurrency: e.target.value as Currency },
                  })
                }
                className={formClass}
              >
                {(["USD", "KRW", "EUR"] as Currency[]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={formLabel}>Default payment terms</label>
              <input
                value={customerForm.draft.defaultPaymentTerms}
                onChange={(e) =>
                  setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, defaultPaymentTerms: e.target.value } })
                }
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Issuing entity (letterhead)</label>
              <select
                value={customerForm.draft.letterhead ?? "FORTUNE NET & TWINE MFG. CORP."}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    draft: { ...customerForm.draft, letterhead: e.target.value as Customer["letterhead"] },
                  })
                }
                className={formClass}
              >
                <option value="FORTUNE NET & TWINE MFG. CORP.">Fortune Net &amp; Twine Mfg. Corp.</option>
                <option value="NETTEX MFG. AND EXPORT CORP.">Nettex Mfg. and Export Corp.</option>
              </select>
            </div>
            <div>
              <label className={formLabel}>Agent</label>
              <input
                value={customerForm.draft.agent ?? ""}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, agent: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Outstanding balance (USD)</label>
              <input
                type="number"
                step="0.01"
                value={customerForm.draft.outstandingBalanceUSD}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    draft: { ...customerForm.draft, outstandingBalanceUSD: Number(e.target.value) },
                  })
                }
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Customer since</label>
              <input
                type="date"
                value={customerForm.draft.since}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, since: e.target.value } })}
                className={formClass}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDeleteCustomer !== null}
        onClose={() => setConfirmDeleteCustomer(null)}
        title={`Delete ${confirmDeleteCustomer?.name}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteCustomer(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirmDeleteCustomer) {
                  removeCustomer(confirmDeleteCustomer.id);
                  pushToast({ tone: "info", title: "Customer deleted", description: confirmDeleteCustomer.name });
                }
                setConfirmDeleteCustomer(null);
              }}
            >
              Delete customer
            </Button>
          </>
        }
      >
        <p className="text-sm text-paper-600">
          Quotations and sales orders already raised for this customer stay in place, but will show an unknown customer.
        </p>
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
