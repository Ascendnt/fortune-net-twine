const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  tenant_id: number | null;
  permissions: string[];
  roles: string[];
  // Which sidebar modules this user can see at all — distinct from
  // `permissions` above (what they can DO once inside a module). See
  // Modules/Tenancy/app/Models/User.php::accessibleModules() for how the
  // backend computes this — it's derived from permissions, not a second
  // grant system, so there's exactly one place a role's access is defined.
  accessible_modules: string[];
}

const TOKEN_KEY = "fnt_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body.errors) {
      const first = Object.values(body.errors)[0];
      return Array.isArray(first) ? String(first[0]) : String(first);
    }
    return body.message ?? "Sign in failed. Please try again.";
  } catch {
    return "Sign in failed. Please try again.";
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = await response.json();
  setToken(data.token);
  return data.user as AuthUser;
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    await fetch(`${API_BASE}/api/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }).catch(() => {
      // Best-effort — clear the local token regardless of network state.
    });
  }
  clearToken();
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!response.ok) {
    clearToken();
    return null;
  }

  return (await response.json()) as AuthUser;
}
