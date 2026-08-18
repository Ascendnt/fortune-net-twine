import { getToken } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface ApiContact {
  id: number;
  name: string;
  title: string | null;
  tel: string | null;
  fax: string | null;
  mobile: string | null;
  email: string | null;
  is_primary: boolean;
}

export interface ApiAgent {
  id: number;
  name: string;
  is_house_account: boolean;
  customer_count: number;
}

export interface ApiIssuingEntity {
  id: number;
  name: string;
}

export interface ApiCustomer {
  id: number;
  company_name: string;
  country: string;
  consignee: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  default_currency: string;
  default_payment_terms: string | null;
  issuing_entity: ApiIssuingEntity | null;
  agent: { id: number; name: string; is_house_account: boolean } | null;
  outstanding_balance_override: string | null;
  customer_since: string | null;
  contacts: ApiContact[];
}

/** Shape used when creating a customer WITH contacts already entered — see CUSTOMERS_MODULE.md on draft-mode saving. */
export interface NewContactInput {
  name: string;
  title?: string;
  tel?: string;
  fax?: string;
  mobile?: string;
  email?: string;
  is_primary?: boolean;
}

export interface CustomerFormInput {
  company_name: string;
  country: string;
  consignee?: string;
  address?: string;
  email?: string;
  phone?: string;
  default_currency?: string;
  default_payment_terms?: string;
  issuing_entity_id?: number | null;
  agent_id?: number | null;
  outstanding_balance_override?: number | null;
  customer_since?: string;
}

async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body.errors) {
      const first = Object.values(body.errors)[0];
      return Array.isArray(first) ? String(first[0]) : String(first);
    }
    return body.message ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export async function fetchCustomers(): Promise<ApiCustomer[]> {
  const res = await authedFetch("/api/customers");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function fetchAgents(): Promise<ApiAgent[]> {
  const res = await authedFetch("/api/agents");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function fetchIssuingEntities(): Promise<ApiIssuingEntity[]> {
  const res = await authedFetch("/api/issuing-entities");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

/** contacts, if provided, are created in the same transaction as the customer — see CustomerController::store(). */
export async function createCustomer(data: CustomerFormInput, contacts: NewContactInput[] = []): Promise<ApiCustomer> {
  const res = await authedFetch("/api/customers", { method: "POST", body: JSON.stringify({ ...data, contacts }) });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function updateCustomer(id: number, data: Partial<CustomerFormInput>): Promise<ApiCustomer> {
  const res = await authedFetch(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function deleteCustomer(id: number): Promise<void> {
  const res = await authedFetch(`/api/customers/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

export async function addContactToCustomer(customerId: number, contact: NewContactInput): Promise<ApiContact> {
  const res = await authedFetch(`/api/customers/${customerId}/contacts`, { method: "POST", body: JSON.stringify(contact) });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function updateContact(customerId: number, contactId: number, patch: Partial<NewContactInput>): Promise<ApiContact> {
  const res = await authedFetch(`/api/customers/${customerId}/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

/** "Archive," per the requirement — a soft delete on the backend, not a permanent removal. */
export async function archiveContact(customerId: number, contactId: number): Promise<void> {
  const res = await authedFetch(`/api/customers/${customerId}/contacts/${contactId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

export async function makeContactPrimary(customerId: number, contactId: number): Promise<ApiContact> {
  const res = await authedFetch(`/api/customers/${customerId}/contacts/${contactId}/make-primary`, { method: "POST" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}
