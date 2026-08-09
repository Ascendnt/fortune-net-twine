import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ToastStack } from "@/components/ui/Feedback";
import { useStore } from "@/lib/store";
import { SignIn } from "@/pages/SignIn";

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { signedInUser } = useStore();

  // Nothing renders until somebody has said who they are. Every approval and activity entry names
  // a person, so there is no sensible way to use the system anonymously.
  if (!signedInUser) return <SignIn />;

  return (
    <div className="flex min-h-screen bg-paper-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 print:p-0">
          <Outlet />
        </main>
      </div>
      <ToastStack />
    </div>
  );
}
