import { getToken } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface ApiPermission {
  id: number;
  code: string;
  label: string;
  module: string;
}

export interface ApiRole {
  id: number;
  name: string;
  slug: string;
  is_system_default: boolean;
  can_override: boolean;
  permission_codes: string[];
  user_count: number;
}

async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return response;
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

export async function fetchRoles(): Promise<ApiRole[]> {
  const res = await authedFetch("/api/roles");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function fetchPermissions(): Promise<ApiPermission[]> {
  const res = await authedFetch("/api/permissions");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function createRole(name: string): Promise<ApiRole> {
  const res = await authedFetch("/api/roles", { method: "POST", body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function deleteRole(roleId: number): Promise<void> {
  const res = await authedFetch(`/api/roles/${roleId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

/** THE access-grant call — replaces a role's entire permission set with exactly what's passed. */
export async function syncRolePermissions(roleId: number, permissionCodes: string[]): Promise<ApiRole> {
  const res = await authedFetch(`/api/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_codes: permissionCodes }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}
