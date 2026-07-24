"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navigationItems } from "@/components/app-shell/navigation";
import { SidebarContent } from "@/components/app-shell/sidebar-content";

type AppShellProps = {
  children: React.ReactNode;
  displayName: string;
  email: string;
};

export function AppShell({
  children,
  displayName,
  email,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const pageTitle =
    navigationItems.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "JobTrack";

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarContent displayName={displayName} email={email} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside
            aria-label="Mobile navigation"
            className="relative h-full w-[min(86vw,20rem)] bg-white shadow-2xl"
          >
            <button
              aria-label="Close navigation"
              className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
            <SidebarContent
              displayName={displayName}
              email={email}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            aria-expanded={mobileOpen}
            aria-label="Open navigation"
            className="grid size-11 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <div>
            <p className="text-sm font-semibold text-slate-950">{pageTitle}</p>
            <p className="hidden text-xs text-slate-500 sm:block">
              Secure foundation · Phase 1
            </p>
          </div>
          <span className="ml-auto rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Personal workspace
          </span>
        </header>

        <main className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
