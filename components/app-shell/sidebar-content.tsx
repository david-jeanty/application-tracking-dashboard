"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import {
  demoNavigationItems,
  isNavigationItemActive,
  primaryNavigationItems,
  secondaryNavigationItems,
  utilityNavigationItems,
  type NavigationItem,
} from "@/components/app-shell/navigation";

/**
 * Whose workspace this is.
 *
 * `account` is the signed-in student's, and nothing about it has changed. `demo`
 * is the public sample workspace: four surfaces, no archive, no settings, and
 * no sign-out, because there is no session to end. The union is what keeps the
 * two from being one component with six optional props.
 */
export type WorkspaceIdentity =
  | { kind: "account"; displayName: string; email: string }
  | { kind: "demo" };

type SidebarContentProps = {
  identity: WorkspaceIdentity;
  onNavigate?: () => void;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * One navigation row.
 *
 * The active state is an accent-soft fill plus a short accent indicator rather
 * than a filled pill, so location reads clearly without the sidebar becoming
 * the loudest thing on the screen.
 */
function NavigationLink({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <li className="relative">
      {active ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-accent"
        />
      ) : null}
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-9 items-center gap-3 rounded-control px-3 py-2 text-[15px] transition-colors",
          active
            ? "bg-accent-soft text-accent"
            : "text-foreground-secondary hover:bg-surface hover:text-foreground",
        )}
        href={item.href}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.5} />
        {item.label}
      </Link>
    </li>
  );
}

/**
 * The foot of the demo sidebar, where the account row sits in the real one.
 *
 * It says what this workspace is in words rather than with a badge, and offers
 * the one thing a visitor might want next. `Create account` is a quiet link
 * rather than a filled button: the sidebar is not where the product should be
 * selling itself.
 */
function DemoIdentity({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="border-t border-border px-5 py-4">
      <p className="text-[13px] font-medium text-foreground">Demo workspace</p>
      <p className="mt-0.5 text-[11px] text-foreground-muted">Sample data</p>
      <Link
        className="mt-2.5 inline-flex rounded-sm text-[13px] text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href="/signup"
        onClick={onNavigate}
      >
        Create account
      </Link>
    </div>
  );
}

export function SidebarContent({
  identity,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();

  const renderItems = (items: readonly NavigationItem[]) =>
    items.map((item) => (
      <NavigationLink
        active={isNavigationItemActive(pathname, item)}
        item={item}
        key={item.href}
        onNavigate={onNavigate}
      />
    ));

  return (
    <div className="flex h-full flex-col">
      <Link
        className="font-wordmark px-5 py-6 text-[26px] leading-none text-foreground"
        href={identity.kind === "demo" ? "/demo" : "/dashboard"}
        onClick={onNavigate}
      >
        JobTrack
      </Link>

      <nav
        aria-label="Primary navigation"
        className="flex flex-1 flex-col gap-1 px-3 pb-3"
      >
        {identity.kind === "demo" ? (
          <ul className="flex flex-col gap-0.5">
            {renderItems(demoNavigationItems)}
          </ul>
        ) : (
          <>
            <ul className="flex flex-col gap-0.5">
              {renderItems(primaryNavigationItems)}
            </ul>

            {/* Archive is finished work, so it sits apart from the live workflow. */}
            <ul className="mt-6 flex flex-col gap-0.5">
              {renderItems(secondaryNavigationItems)}
            </ul>

            <ul className="mt-auto flex flex-col gap-0.5 pt-6">
              {renderItems(utilityNavigationItems)}
            </ul>
          </>
        )}
      </nav>

      {identity.kind === "demo" ? (
        <DemoIdentity onNavigate={onNavigate} />
      ) : (
      <div className="border-t border-border px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-semibold text-foreground-secondary"
          >
            {initials(identity.displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">
              {identity.displayName}
            </p>
            <p className="truncate text-[11px] text-foreground-muted">
              {identity.email}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-control text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
              title="Sign out"
              type="submit"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </div>
      )}
    </div>
  );
}
