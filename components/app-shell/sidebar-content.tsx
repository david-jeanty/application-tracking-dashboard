"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import {
  isNavigationItemActive,
  primaryNavigationItems,
  secondaryNavigationItems,
  utilityNavigationItems,
  type NavigationItem,
} from "@/components/app-shell/navigation";

type SidebarContentProps = {
  displayName: string;
  email: string;
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
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"
        />
      ) : null}
      <Link
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-9 items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors",
          active
            ? "bg-accent-soft font-medium text-accent"
            : "text-foreground-secondary hover:bg-surface hover:text-foreground",
        )}
        href={item.href}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {item.label}
      </Link>
    </li>
  );
}

export function SidebarContent({
  displayName,
  email,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();

  const renderItems = (items: readonly NavigationItem[]) =>
    items.map((item) => (
      <NavigationLink
        active={isNavigationItemActive(pathname, item.href)}
        item={item}
        key={item.href}
        onNavigate={onNavigate}
      />
    ));

  return (
    <div className="flex h-full flex-col">
      <Link
        className="flex items-center gap-2 px-4 py-4 text-[15px] font-semibold tracking-tight text-foreground"
        href="/dashboard"
        onClick={onNavigate}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-control bg-accent text-accent-foreground">
          <BriefcaseBusiness aria-hidden="true" className="size-3.5" />
        </span>
        JobTrack
      </Link>

      <nav
        aria-label="Primary navigation"
        className="flex flex-1 flex-col gap-1 px-3 pb-3"
      >
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
      </nav>

      <div className="border-t border-border px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-semibold text-foreground-secondary"
          >
            {initials(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-foreground-muted">{email}</p>
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
    </div>
  );
}
