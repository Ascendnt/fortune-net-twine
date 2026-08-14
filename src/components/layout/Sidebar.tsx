import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  MessageSquareText,
  FlaskConical,
  FileSpreadsheet,
  ClipboardList,
  PackageCheck,
  Ship,
  ClipboardCheck,
  Wallet,
  Users,
  BarChart3,
  ShieldCheck,
  History,
  Settings,
  Library,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  X,
} from "lucide-react";
import fntLogo from "@/assets/fnt-logo.png";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  locked?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { to: "/inquiries", label: "Customer Inquiries", icon: MessageSquareText },
      { to: "/technical", label: "Technical Assessments", icon: FlaskConical },
      { to: "/quotations", label: "Quotations / PI", icon: FileSpreadsheet },
      { to: "/orders", label: "Sales Orders", icon: ClipboardList },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/packing", label: "Packing Lists", icon: PackageCheck },
      { to: "/inspection", label: "Inspection Reports", icon: ClipboardCheck },
      { to: "/shipments", label: "Shipments", icon: Ship },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/payments", label: "Payments", icon: Wallet },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Records",
    items: [
      { to: "/customers", label: "Customers", icon: Users },
      { to: "/approvals", label: "Approvals", icon: ShieldCheck },
      { to: "/activity", label: "Activity Logs", icon: History },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/master-data", label: "Master Data", icon: Library },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const showFull = mobileOpen || !collapsed;

  return (
    <>
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-paper-900/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={clsx(
          "no-print fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-pine-800/60 bg-pine-950 text-pine-50 transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[68px]" : "lg:w-64"
        )}
      >
      <div className="mesh-lattice-light flex items-center gap-2.5 border-b border-pine-800/60 px-4 py-4">
        <div className="relative flex shrink-0 items-center justify-center">
          <span
            className="absolute -inset-2.5 rounded-full bg-pine-400/25 blur-md"
            aria-hidden="true"
          />
          <img
            src={fntLogo}
            alt="Fortune Net & Twine"
            className={clsx(
              "relative object-contain drop-shadow-[0_3px_7px_rgba(2,8,20,0.6)]",
              showFull ? "h-9" : "h-[18px]"
            )}
          />
        </div>
        {showFull && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-bold tracking-tight text-white">FORTUNE NET &amp; TWINE</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-pine-300">
              Export Sales ERP · Prototype
            </p>
          </div>
        )}
        <button
          onClick={onMobileClose}
          className="ml-auto shrink-0 rounded-md p-1 text-pine-300 hover:bg-pine-900 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            {showFull && (
              <p className="mb-1.5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-pine-400">
                {g.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    clsx(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-pine-800 text-white"
                        : "text-pine-200 hover:bg-pine-900 hover:text-white"
                    )
                  }
                  title={showFull ? undefined : item.label}
                >
                  <item.icon className="h-[17px] w-[17px] shrink-0" />
                  {showFull && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                  {showFull && item.locked && <Lock className="h-3 w-3 shrink-0 text-pine-500" />}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <button
        onClick={onToggle}
        className="hidden items-center gap-2 border-t border-pine-800/60 px-4 py-3 text-xs font-medium text-pine-300 hover:bg-pine-900 hover:text-white lg:flex"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && "Collapse"}
      </button>
      </aside>
    </>
  );
}
