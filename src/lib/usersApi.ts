import { getToken } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface ApiUserRole {
  id: number;
  name: string;
}

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  is_available: boolean;
  roles: ApiUserRole[];
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

export async function fetchUsers(): Promise<ApiUser[]> {
  const res = await authedFetch("/api/users");
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function createUser(
  name: string,
  email: string,
  roleIds: number[]
): Promise<ApiUser & { temporary_password: string }> {
  const res = await authedFetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ name, email, role_ids: roleIds }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function updateUserRoles(userId: number, roleIds: number[]): Promise<ApiUser> {
  const res = await authedFetch(`/api/users/${userId}/roles`, {
    method: "PATCH",
    body: JSON.stringify({ role_ids: roleIds }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

/**
 * Requires the ACTING ADMIN's own current password (re-authentication),
 * never the target user's — because the target user's real password
 * doesn't exist anywhere in retrievable form; it's bcrypt-hashed at
 * creation, one-way, by design. This generates a new one instead.
 */
export async function resetUserPassword(
  userId: number,
  adminPassword: string
): Promise<{ user_id: number; new_password: string }> {
  const res = await authedFetch(`/api/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ admin_password: adminPassword }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}
