import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Plus, ChevronDown, Check, Menu } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLES } from "@/lib/mockData";
import { initials } from "@/lib/format";
import type { Role } from "@/lib/types";
import clsx from "clsx";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { role, setRole, currentUser, pushToast } = useStore();
  const [roleOpen, setRoleOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();

  const activeRole = ROLES.find((r) => r.id === role)!;

  const notifications = [
    { title: "Remaining balance overdue — SO-1048", tone: "Finance", time: "2h ago" },
    { title: "Deposit remittance submitted — SO-1046", tone: "Finance", time: "5h ago" },
    { title: "PI-33011 awaiting your approval", tone: "Sales", time: "1d ago" },
  ];

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
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-vermillion-500 ring-2 ring-white" />
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-80 rounded-xl border border-paper-200 bg-white p-2 shadow-[var(--shadow-pop)]">
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-paper-400">
                  Notifications
                </p>
                {notifications.map((n, i) => (
                  <div key={i} className="rounded-lg px-2 py-2 hover:bg-paper-50">
                    <p className="text-sm font-medium text-paper-800">{n.title}</p>
                    <p className="mt-0.5 text-xs text-paper-400">
                      {n.tone} · {n.time}
                    </p>
                  </div>
                ))}
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
                <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-paper-400">
                  Preview interface as…
                </p>
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRole(r.id as Role);
                      setRoleOpen(false);
                      pushToast({
                        tone: "info",
                        title: `Viewing as ${r.label}`,
                        description: "Dashboard and work queue updated for this role.",
                      });
                    }}
                    className={clsx(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-paper-50",
                      r.id === role && "bg-pine-50"
                    )}
                  >
                    <div className="mt-0.5 w-4 shrink-0">
                      {r.id === role && <Check className="h-3.5 w-3.5 text-pine-600" />}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-paper-800">{r.label}</p>
                      <p className="text-[11.5px] text-paper-400">{r.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
