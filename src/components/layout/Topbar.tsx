import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Plus, ChevronDown, Check, Menu, LogOut } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/mockData";
import { initials } from "@/lib/format";
import { buildNotifications } from "@/lib/notifications";
import { PERMISSION_LABELS, permissionsFor } from "@/lib/permissions";
import clsx from "clsx";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { role, signedInUser, signOut, currentUser, pushToast, quotations, salesOrders, payments, inspections } =
    useStore();
  const [roleOpen, setRoleOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();

  const activeRole = ROLES.find((r) => r.id === role) ?? { label: "—", description: "" };

  // Derived from live state, not a fixed list. An item disappears the moment the thing it is
  // chasing is dealt with, which is the only way a feed like this stays worth reading.
  const notifications = useMemo(
    () =>
      buildNotifications(
        { quotations, salesOrders, payments, inspections },
        new Date().toISOString().slice(0, 10)
      ),
    [quotations, salesOrders, payments, inspections]
  );

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-paper-200 bg-white/90 px-3 backdrop-blur sm:gap-3 sm:px-5">
      <button
        onClick={onMenuClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-paper-500 hover:bg-paper-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative w-full min-w-0 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
        <input
          type="text"
          placeholder="Search orders, PI numbers, customers…"
          className="w-full rounded-lg border border-paper-200 bg-paper-50 py-2 pl-9 pr-3 text-sm text-paper-800 placeholder:text-paper-400 focus:border-manifest-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-manifest-100"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => navigate("/quotations/new")}
          className="flex items-center gap-1.5 rounded-lg bg-pine-700 px-2.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pine-600 sm:px-3"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Quick Create</span>
        </button>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-paper-500 hover:bg-paper-100"
            aria-label={
              notifications.length === 0
                ? "Notifications, nothing needs attention"
                : `Notifications, ${notifications.length} needing attention`
            }
          >
            <Bell className="h-[18px] w-[18px]" />
            {/* The dot only appears when there is genuinely something to look at. A permanent
                badge teaches people that the bell means nothing. */}
            {notifications.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-vermillion-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {notifications.length > 9 ? "9+" : notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-80 overflow-y-auto rounded-xl border border-paper-200 bg-white p-2 shadow-[var(--shadow-pop)]">
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-paper-400">
                  Needs attention
                </p>
                {notifications.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-paper-400">
                    Nothing is waiting on you right now.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setNotifOpen(false);
                        navigate(n.href);
                      }}
                      className="flex w-full gap-2 rounded-lg px-2 py-2 text-left hover:bg-paper-50"
                    >
                      <span
                        className={clsx(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          n.tone === "alert" && "bg-vermillion-500",
                          n.tone === "warning" && "bg-amber-500",
                          n.tone === "info" && "bg-manifest-500"
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-snug text-paper-800">{n.title}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-paper-400">{n.detail}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setRoleOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-paper-200 py-1.5 pl-2 pr-2.5 hover:bg-paper-50"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pine-600 font-mono text-[11px] font-semibold text-white">
              {initials(currentUser)}
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-[12.5px] font-semibold text-paper-800">{currentUser}</p>
              <p className="text-[11px] text-paper-400">{activeRole.label}</p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-paper-400" />
          </button>
          {roleOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setRoleOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-72 rounded-xl border border-paper-200 bg-white p-2 shadow-[var(--shadow-pop)]">
                <div className="border-b border-paper-100 px-2 pb-2">
                  <p className="text-[13px] font-semibold text-paper-800">{currentUser}</p>
                  <p className="text-[11.5px] text-paper-400">
                    {activeRole.label} · {signedInUser?.email}
                  </p>
                </div>

                <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-paper-400">
                  What this role can do
                </p>
                <ul className="mb-1 space-y-0.5 px-2">
                  {permissionsFor(role).map((p) => (
                    <li key={p} className="flex gap-1.5 text-[11.5px] leading-snug text-paper-600">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-pine-600" />
                      {PERMISSION_LABELS[p]}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => {
                    setRoleOpen(false);
                    signOut();
                    pushToast({ tone: "info", title: "Signed out" });
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-paper-100 px-2 py-2 text-left text-[13px] font-medium text-paper-700 hover:bg-paper-50"
                >
                  <LogOut className="h-3.5 w-3.5 text-paper-400" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
