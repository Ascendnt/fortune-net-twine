import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, Mail, Phone, Plus, Pencil, Trash2, Star, Check, X,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Card, CardHeader, KeyValue } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { CountrySelect } from "@/components/ui/CountrySelect";
import { COUNTRIES } from "@/lib/countries";
import { flagEmoji } from "@/lib/flags";
import {
  fetchCustomers, fetchAgents, fetchIssuingEntities,
  createCustomer, updateCustomer as apiUpdateCustomer, deleteCustomer as apiDeleteCustomer,
  addContactToCustomer, updateContact as apiUpdateContact, archiveContact, makeContactPrimary,
  type ApiCustomer, type ApiContact, type ApiAgent, type ApiIssuingEntity,
  type CustomerFormInput, type NewContactInput,
} from "@/lib/customersApi";

const fieldClass =
  "w-full rounded-md border border-paper-200 bg-white px-2 py-1.5 text-xs focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const formClass =
  "w-full rounded-lg border border-paper-200 bg-white px-3 py-2 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100";
const formLabel = "mb-1 block text-xs font-medium text-paper-600";

type ContactFieldDraft = { name: string; title: string; tel: string; fax: string; mobile: string; email: string };
interface DraftContact extends NewContactInput {
  localId: string;
}

const EMPTY_FORM: CustomerFormInput = {
  company_name: "",
  country: "",
  consignee: "",
  address: "",
  email: "",
  phone: "",
  default_currency: "USD",
  default_payment_terms: "T/T 30% deposit, 70% before shipment",
  issuing_entity_id: null,
  agent_id: null,
  outstanding_balance_override: null,
  customer_since: new Date().toISOString().slice(0, 10),
};

function draftContactId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Stored data is just the country name — look up its code to render a flag anywhere else in this page. */
function countryFlag(name: string): string {
  const match = COUNTRIES.find((c) => c.name === name);
  return match ? flagEmoji(match.code) : "";
}

export function CustomersList() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [agents, setAgents] = useState<ApiAgent[]>([]);
  const [issuingEntities, setIssuingEntities] = useState<ApiIssuingEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [customerForm, setCustomerForm] = useState<{ draft: CustomerFormInput; draftContacts: DraftContact[]; id: number | null } | null>(null);
  const [editModalView, setEditModalView] = useState<"fields" | "contacts">("fields");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState<ApiCustomer | null>(null);

  async function refresh() {
    const [customersRes, agentsRes, entitiesRes] = await Promise.all([fetchCustomers(), fetchAgents(), fetchIssuingEntities()]);
    setCustomers(customersRes);
    setAgents(agentsRes);
    setIssuingEntities(entitiesRes);
  }

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined;
  const filtered = customers.filter(
    (c) => c.company_name.toLowerCase().includes(query.toLowerCase()) || c.country.toLowerCase().includes(query.toLowerCase())
  );

  function openCustomerForm(existing: ApiCustomer | null) {
    setCustomerForm({
      draft: existing
        ? {
            company_name: existing.company_name,
            country: existing.country,
            consignee: existing.consignee,
            address: existing.address ?? "",
            email: existing.email ?? "",
            phone: existing.phone ?? "",
            default_currency: existing.default_currency,
            default_payment_terms: existing.default_payment_terms ?? "",
            issuing_entity_id: existing.issuing_entity?.id ?? null,
            agent_id: existing.agent?.id ?? null,
            outstanding_balance_override: existing.outstanding_balance_override ? Number(existing.outstanding_balance_override) : null,
            customer_since: existing.customer_since ?? "",
          }
        : { ...EMPTY_FORM },
      draftContacts: [],
      id: existing?.id ?? null,
    });
    setEditModalView("fields");
    setActionError(null);
  }

  function closeCustomerForm() {
    setCustomerForm(null);
    setEditModalView("fields");
  }

  function setDraftContacts(contacts: DraftContact[]) {
    setCustomerForm((prev) => (prev ? { ...prev, draftContacts: contacts } : prev));
  }

  async function saveCustomer() {
    if (!customerForm) return;
    const { draft, draftContacts, id } = customerForm;
    if (!draft.company_name.trim() || !draft.country.trim()) {
      setActionError("Company name and country are required.");
      return;
    }

    setSavingCustomer(true);
    setActionError(null);
    try {
      const normalized: CustomerFormInput = {
        ...draft,
        company_name: draft.company_name.trim(),
        country: draft.country.trim(),
        consignee: draft.consignee?.trim() || draft.company_name.trim(),
      };

      if (id) {
        await apiUpdateCustomer(id, normalized);
      } else {
        await createCustomer(
          normalized,
          draftContacts.map(({ localId, ...c }) => c)
        );
      }
      await refresh();
      closeCustomerForm();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that customer.");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleDeleteCustomer(customer: ApiCustomer) {
    try {
      await apiDeleteCustomer(customer.id);
      await refresh();
      setConfirmDeleteCustomer(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete that customer.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-paper-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading customers…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-3 text-alert-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
        <div>
          <p className="text-sm font-medium">Couldn't load customers</p>
          <p className="text-xs text-alert-700">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Fortune Net & Twine ERP", "Records"]}
        eyebrow="Customer Master"
        title="Customers"
        description="Company profiles, default terms, contacts, and outstanding balances."
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openCustomerForm(null)}>
            Add Customer
          </Button>
        }
      />

      {actionError && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-alert-200 bg-alert-50 px-3.5 py-2.5 text-alert-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alert-600" />
          <p className="text-xs">{actionError}</p>
        </div>
      )}

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
            <TR key={c.id} onClick={() => setSelectedId(c.id)}>
              <TD>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine-100 font-mono text-[11px] font-semibold text-pine-700">
                    {c.company_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{c.company_name}</p>
                    <p className="text-xs text-paper-400">{c.contacts.find((ct) => ct.is_primary)?.name ?? c.contacts[0]?.name ?? "No contact yet"}</p>
                  </div>
                </div>
              </TD>
              <TD>
                <span className="mr-1">{countryFlag(c.country)}</span>
                {c.country}
              </TD>
              <TD className="text-xs">{c.default_payment_terms ?? "—"}</TD>
              <TD className="font-mono text-paper-300" title="Available once the Sales Order module exists">—</TD>
              <TD className="font-mono text-paper-300" title="Available once the Sales Order module exists">—</TD>
              <TD className="font-mono font-medium" title="Manually entered — not yet a live computed figure (needs Payments)">
                {c.outstanding_balance_override ? `$${Number(c.outstanding_balance_override).toLocaleString()}` : "—"}
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openCustomerForm(c);
                    }}
                    className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-manifest-700"
                    aria-label={`Edit ${c.company_name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteCustomer(c);
                    }}
                    className="rounded p-1 text-paper-400 hover:bg-paper-100 hover:text-alert-600"
                    aria-label={`Delete ${c.company_name}`}
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
        onClose={() => setSelectedId(null)}
        title={selected?.company_name ?? ""}
        subtitle={selected ? `${countryFlag(selected.country)} ${selected.country}` : undefined}
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
              <KeyValue label="Default payment terms" value={selected.default_payment_terms ?? "—"} />
              <KeyValue label="Default currency" value={selected.default_currency} />
              <KeyValue label="Customer since" value={selected.customer_since ?? "—"} />
              <KeyValue label="Agent" value={selected.agent?.name ?? "—"} />
              <KeyValue label="Issuing entity" value={selected.issuing_entity?.name ?? "—"} />
              <div className="my-2 border-t border-paper-100" />
              <KeyValue
                label="Outstanding balance"
                value={selected.outstanding_balance_override ? `$${Number(selected.outstanding_balance_override).toLocaleString()}` : "—"}
                mono
              />
            </Card>

            <ContactsManagerSection mode="persisted" customerId={selected.id} contacts={selected.contacts} onRefresh={refresh} />
          </div>
        )}
      </Modal>

      <Modal
        open={customerForm !== null}
        onClose={closeCustomerForm}
        title={
          editModalView === "contacts"
            ? `Contacts — ${customerForm?.draft.company_name || "New Customer"}`
            : customerForm?.id
              ? "Edit customer"
              : "Add customer"
        }
        subtitle={editModalView === "fields" ? "Defaults pre-fill new quotations but stay editable per quotation." : undefined}
        width="max-w-2xl"
        footer={
          editModalView === "contacts" ? (
            <Button variant="secondary" size="sm" onClick={() => setEditModalView("fields")} icon={<ChevronLeft className="h-3.5 w-3.5" />}>
              Back to customer details
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={closeCustomerForm} disabled={savingCustomer}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={saveCustomer} disabled={savingCustomer}>
                {savingCustomer ? "Saving…" : customerForm?.id ? "Save changes" : "Add customer"}
              </Button>
            </>
          )
        }
      >
        {customerForm && editModalView === "contacts" && (
          customerForm.id ? (
            <ContactsManagerSection
              mode="persisted"
              customerId={customerForm.id}
              contacts={customers.find((c) => c.id === customerForm.id)?.contacts ?? []}
              onRefresh={refresh}
            />
          ) : (
            <ContactsManagerSection mode="draft" contacts={customerForm.draftContacts} onChange={setDraftContacts} />
          )
        )}

        {customerForm && editModalView === "fields" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={formLabel}>Company name</label>
              <input
                value={customerForm.draft.company_name}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, company_name: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Country</label>
              <CountrySelect
                value={customerForm.draft.country}
                onChange={(v) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, country: v } })}
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

            <div className="sm:col-span-2 rounded-lg bg-paper-50 px-3 py-2.5">
              <p className="text-xs font-medium text-paper-600">
                {(() => {
                  const count = customerForm.id
                    ? customers.find((c) => c.id === customerForm.id)?.contacts.length ?? 0
                    : customerForm.draftContacts.length;
                  const primary = customerForm.id
                    ? customers.find((c) => c.id === customerForm.id)?.contacts.find((ct) => ct.is_primary)?.name
                    : customerForm.draftContacts.find((ct) => ct.is_primary)?.name;
                  return count === 0 ? "No contacts yet" : `Primary contact: ${primary ?? "—"}`;
                })()}
              </p>
              <button
                type="button"
                onClick={() => setEditModalView("contacts")}
                className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-manifest-700 hover:text-manifest-800 hover:underline"
              >
                View Contact List
                {(() => {
                  const count = customerForm.id
                    ? customers.find((c) => c.id === customerForm.id)?.contacts.length ?? 0
                    : customerForm.draftContacts.length;
                  return count > 0 ? ` (${count})` : "";
                })()}
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div>
              <label className={formLabel}>Email</label>
              <input
                value={customerForm.draft.email ?? ""}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, email: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Phone</label>
              <input
                value={customerForm.draft.phone ?? ""}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, phone: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Default currency</label>
              <select
                value={customerForm.draft.default_currency}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, default_currency: e.target.value } })}
                className={formClass}
              >
                {["USD", "KRW", "EUR"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={formLabel}>Default payment terms</label>
              <input
                value={customerForm.draft.default_payment_terms ?? ""}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, default_payment_terms: e.target.value } })}
                className={formClass}
              />
            </div>
            <div>
              <label className={formLabel}>Issuing entity (letterhead)</label>
              <SearchableSelect
                value={customerForm.draft.issuing_entity_id ? String(customerForm.draft.issuing_entity_id) : ""}
                onChange={(v) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, issuing_entity_id: v ? Number(v) : null } })}
                options={issuingEntities.map((e) => ({ value: String(e.id), label: e.name }))}
                placeholder="Select issuing entity…"
                clearable
              />
            </div>
            <div>
              <label className={formLabel}>Agent</label>
              <SearchableSelect
                value={customerForm.draft.agent_id ? String(customerForm.draft.agent_id) : ""}
                onChange={(v) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, agent_id: v ? Number(v) : null } })}
                options={agents.map((a) => ({ value: String(a.id), label: a.name, sublabel: a.is_house_account ? undefined : "external agent" }))}
                placeholder="Search agents…"
                clearable
              />
            </div>
            <div>
              <label className={formLabel}>Outstanding balance (USD)</label>
              {/*
                Read-only, not an editable input — corrected based on a
                fresh site analysis: the real Add/Edit Customer form's own
                note reads "Calculated from invoices raised less payments
                verified. To change it, record or verify a payment." An
                earlier pass on this project had this as a free-entry
                number field; the current live site does not. Genuinely
                nothing to compute FROM yet (Sales Orders/Payments aren't
                built), so this shows the seed value if one exists and
                explains why it can't be typed into directly, rather than
                offering an input that doesn't match how the real form
                behaves.
              */}
              <div className={`${formClass} bg-paper-50 text-paper-600`}>
                {customerForm.draft.outstanding_balance_override != null
                  ? `$${Number(customerForm.draft.outstanding_balance_override).toLocaleString()}`
                  : "$0"}
              </div>
              <p className="mt-0.5 text-[10px] text-paper-400">
                Calculated from invoices raised less payments verified. To change it, record or verify a payment
                once Sales Orders exist.
              </p>
            </div>
            <div>
              <label className={formLabel}>Customer since</label>
              <input
                type="date"
                value={customerForm.draft.customer_since ?? ""}
                onChange={(e) => setCustomerForm({ ...customerForm, draft: { ...customerForm.draft, customer_since: e.target.value } })}
                className={formClass}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDeleteCustomer !== null}
        onClose={() => setConfirmDeleteCustomer(null)}
        title={`Delete ${confirmDeleteCustomer?.company_name}?`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteCustomer(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={() => confirmDeleteCustomer && handleDeleteCustomer(confirmDeleteCustomer)}>
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

type ContactsManagerProps =
  | { mode: "persisted"; customerId: number; contacts: ApiContact[]; onRefresh: () => Promise<void> }
  | { mode: "draft"; contacts: DraftContact[]; onChange: (contacts: DraftContact[]) => void };

function ContactsManagerSection(props: ContactsManagerProps) {
  const [editingKey, setEditingKey] = useState<string | number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ContactFieldDraft>({ name: "", title: "", tel: "", fax: "", mobile: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetDraft() {
    setDraft({ name: "", title: "", tel: "", fax: "", mobile: "", email: "" });
  }
  function startAdd() {
    resetDraft();
    setEditingKey(null);
    setAdding(true);
  }
  function startEdit(c: ApiContact | DraftContact, key: string | number) {
    setDraft({ name: c.name, title: c.title ?? "", tel: c.tel ?? "", fax: c.fax ?? "", mobile: c.mobile ?? "", email: c.email ?? "" });
    setAdding(false);
    setEditingKey(key);
  }
  function cancel() {
    setAdding(false);
    setEditingKey(null);
    setError(null);
    resetDraft();
  }

  function toPatch(): NewContactInput {
    return {
      name: draft.name.trim(),
      title: draft.title.trim() || undefined,
      tel: draft.tel.trim() || undefined,
      fax: draft.fax.trim() || undefined,
      mobile: draft.mobile.trim() || undefined,
      email: draft.email.trim() || undefined,
    };
  }

  async function handleSave() {
    if (!draft.name.trim()) return;
    const patch = toPatch();

    if (props.mode === "persisted") {
      setBusy(true);
      setError(null);
      try {
        if (editingKey) await apiUpdateContact(props.customerId, editingKey as number, patch);
        else await addContactToCustomer(props.customerId, patch);
        await props.onRefresh();
        cancel();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that contact.");
      } finally {
        setBusy(false);
      }
    } else {
      if (editingKey) {
        props.onChange(props.contacts.map((c) => (c.localId === editingKey ? { ...c, ...patch } : c)));
      } else {
        props.onChange([...props.contacts, { localId: draftContactId(), ...patch, is_primary: props.contacts.length === 0 }]);
      }
      cancel();
    }
  }

  async function handleArchive(item: ApiContact | DraftContact) {
    if (props.mode === "persisted") {
      const c = item as ApiContact;
      setBusy(true);
      setError(null);
      try {
        await archiveContact(props.customerId, c.id);
        await props.onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't archive that contact.");
      } finally {
        setBusy(false);
      }
    } else {
      const c = item as DraftContact;
      const remaining = props.contacts.filter((x) => x.localId !== c.localId);
      if (c.is_primary && remaining.length > 0 && !remaining.some((x) => x.is_primary)) {
        remaining[0] = { ...remaining[0], is_primary: true };
      }
      props.onChange(remaining);
    }
  }

  async function handleMakePrimary(item: ApiContact | DraftContact) {
    if (props.mode === "persisted") {
      const c = item as ApiContact;
      setBusy(true);
      setError(null);
      try {
        await makeContactPrimary(props.customerId, c.id);
        await props.onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't update the primary contact.");
      } finally {
        setBusy(false);
      }
    } else {
      const c = item as DraftContact;
      props.onChange(props.contacts.map((x) => ({ ...x, is_primary: x.localId === c.localId })));
    }
  }

  const contactList = props.contacts;

  return (
    <div>
      {error && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-alert-200 bg-alert-50 px-3 py-2 text-alert-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-paper-500">
          Contacts, pick who a quotation is addressed to
        </p>
        {!adding && !editingKey && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1 rounded-md border border-paper-200 px-2 py-1 text-[11px] font-medium text-paper-600 hover:border-manifest-400 hover:text-manifest-700"
          >
            <Plus className="h-3 w-3" /> Add contact
          </button>
        )}
      </div>

      {props.mode === "draft" && contactList.length === 0 && !adding && (
        <p className="mb-1.5 rounded-lg border border-dashed border-paper-200 bg-paper-50 px-3 py-2 text-[11px] text-paper-400">
          No contacts added yet. Anyone you add here is saved together with the customer when you click "Add customer."
        </p>
      )}

      <div className="space-y-1.5">
        {contactList.map((c) => {
          const key = "id" in c ? c.id : c.localId;
          return editingKey === key ? (
            <ContactForm key={key} draft={draft} setDraft={setDraft} onSave={handleSave} onCancel={cancel} busy={busy} />
          ) : (
            <div key={key} className="flex items-start justify-between gap-2 rounded-lg bg-paper-50 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleMakePrimary(c)}
                    disabled={busy || c.is_primary}
                    title={c.is_primary ? "Primary contact" : "Make primary"}
                    className="shrink-0 disabled:cursor-default"
                  >
                    <Star className={`h-3 w-3 ${c.is_primary ? "fill-manifest-500 text-manifest-500" : "text-paper-300 hover:text-manifest-400"}`} />
                  </button>
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
                  {c.tel && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {c.tel}
                    </span>
                  )}
                  {c.mobile && <span>Mobile: {c.mobile}</span>}
                  {c.fax && <span>Fax: {c.fax}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => startEdit(c, key)} disabled={busy} className="rounded p-1 text-paper-400 hover:bg-white hover:text-paper-700">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {contactList.length > 1 && (
                  <button
                    onClick={() => handleArchive(c)}
                    disabled={busy}
                    className="rounded p-1 text-paper-400 hover:bg-white hover:text-alert-600"
                    aria-label={`Archive ${c.name}`}
                    title="Archive this contact"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {adding && <ContactForm draft={draft} setDraft={setDraft} onSave={handleSave} onCancel={cancel} isNew busy={busy} />}
      </div>
    </div>
  );
}

function ContactForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  isNew,
  busy,
}: {
  draft: ContactFieldDraft;
  setDraft: (d: ContactFieldDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
  busy?: boolean;
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
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (optional)" className={`col-span-2 ${fieldClass}`} />
        <input value={draft.tel} onChange={(e) => setDraft({ ...draft, tel: e.target.value })} placeholder="Tel (optional)" className={fieldClass} />
        <input value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} placeholder="Mobile (optional)" className={fieldClass} />
        <input value={draft.fax} onChange={(e) => setDraft({ ...draft, fax: e.target.value })} placeholder="Fax (optional)" className={fieldClass} />
        <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="Email (optional)" className={fieldClass} />
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} disabled={busy} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-paper-500 hover:bg-white">
          <X className="h-3 w-3" /> Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!draft.name.trim() || busy}
          className="flex items-center gap-1 rounded-md bg-pine-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-pine-600 disabled:bg-paper-300"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} {isNew ? "Add contact" : "Save"}
        </button>
      </div>
    </div>
  );
}
