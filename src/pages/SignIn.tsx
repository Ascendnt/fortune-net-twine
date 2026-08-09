import { useMemo, useState } from "react";
import { Search, LogIn } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectableUsers } from "@/lib/users";
import { ROLES } from "@/lib/mockData";
import { initials } from "@/lib/format";
import fntLogo from "@/assets/fnt-logo.png";
import clsx from "clsx";

/**
 * Choosing who you are.
 *
 * There is no password here, and that is deliberate rather than unfinished. Without a server there
 * is nothing to check a password against, so a login form would be a piece of theatre that teaches
 * people the system is protected when it is not. What this screen does provide is identity: from
 * here on, every approval, override and activity entry names an actual person, which is the part
 * the business needs. Authentication slots in front of this when there is a backend to do it.
 */
export function SignIn() {
  const { users, signIn } = useStore();
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const active = selectableUsers(users);
    if (!query.trim()) return active;
    const q = query.toLowerCase();
    return active.filter((u) => `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="mesh-lattice-light flex min-h-screen items-center justify-center bg-pine-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[var(--shadow-pop)]">
        <div className="mb-5 flex items-center gap-3">
          <img src={fntLogo} alt="Fortune Net & Twine" className="h-11 w-11 object-contain" />
          <div>
            <p className="text-[15px] font-bold leading-tight text-pine-900">FORTUNE NET &amp; TWINE</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-paper-400">Export Sales ERP</p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-paper-900">Who are you signing in as?</h1>
        <p className="mt-1 text-xs leading-snug text-paper-500">
          Your name is recorded against everything you approve, verify or change, so pick your own.
        </p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or role…"
            className="w-full rounded-lg border border-paper-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-manifest-400 focus:outline-none focus:ring-2 focus:ring-manifest-100"
          />
        </div>

        <div className="mt-3 max-h-[45vh] space-y-1.5 overflow-y-auto">
          {list.length === 0 && (
            <p className="py-6 text-center text-sm text-paper-400">Nobody matches that.</p>
          )}
          {list.map((u) => {
            const roleInfo = ROLES.find((r) => r.id === u.role);
            return (
              <button
                key={u.id}
                onClick={() => signIn(u.id)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg border border-paper-200 px-3 py-2.5 text-left",
                  "transition-colors hover:border-manifest-400 hover:bg-manifest-50/50"
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pine-700 text-xs font-semibold text-white">
                  {initials(u.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-paper-900">{u.name}</span>
                  <span className="block truncate text-[11px] text-paper-400">
                    {roleInfo?.label ?? u.role} · {u.email}
                  </span>
                </span>
                <LogIn className="h-4 w-4 shrink-0 text-paper-300" />
              </button>
            );
          })}
        </div>

        <p className="mt-4 rounded-lg bg-paper-50 px-3 py-2 text-[11px] leading-snug text-paper-500">
          No password is asked for because there is no server yet to check one against. This identifies you so the
          record is accurate; it does not secure the system.
        </p>
      </div>
    </div>
  );
}
