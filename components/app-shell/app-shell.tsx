"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { InterndexLogo } from "@/components/branding/interndex-logo";
import {
  SidebarContent,
  type WorkspaceIdentity,
} from "@/components/app-shell/sidebar-content";

type AppShellProps = {
  children: React.ReactNode;
  /**
   * The signed-in student, or the public demo workspace. Only the sidebar's
   * navigation and its foot differ between the two — the drawer, the skip
   * link, the escape handling and the workspace measure are the same frame.
   */
  identity: WorkspaceIdentity;
};

/**
 * The authenticated frame: a quiet sidebar and the workspace beside it.
 *
 * There is deliberately no desktop page-title bar. The sidebar already says
 * where you are and every page renders its own heading, so a shell header only
 * printed the same word twice. Mobile keeps a slim bar because the drawer
 * still needs somewhere to be opened from.
 */
export function AppShell({ children, identity }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-background">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-[248px] border-r border-border bg-surface-muted lg:block">
        <SidebarContent identity={identity} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-overlay"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside
            aria-label="Mobile navigation"
            className="relative h-full w-[min(86vw,17rem)] border-r border-border bg-surface-muted shadow-menu"
          >
            <button
              aria-label="Close navigation"
              className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-control text-foreground-secondary hover:bg-surface"
              onClick={() => setMobileOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
            <SidebarContent
              identity={identity}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-border bg-background/95 px-2 backdrop-blur lg:hidden">
          <button
            aria-expanded={mobileOpen}
            aria-label="Open navigation"
            className="grid size-11 place-items-center rounded-control text-foreground-secondary hover:bg-surface-muted"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <InterndexLogo size="small" />
        </header>

        <main
          className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:px-10 lg:py-9"
          id="main-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
