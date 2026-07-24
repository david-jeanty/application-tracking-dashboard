"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { navigationItems } from "@/components/app-shell/navigation";

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

export function SidebarContent({
  displayName,
  email,
  onNavigate,
}: SidebarContentProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <Link
        className="mx-3 flex min-h-16 items-center gap-3 border-b border-slate-200 px-3 text-lg font-bold text-slate-950"
        href="/dashboard"
        onClick={onNavigate}
      >
        <span className="grid size-9 place-items-center rounded-lg bg-blue-600 text-white shadow-sm">
          <BriefcaseBusiness aria-hidden="true" className="size-5" />
        </span>
        JobTrack
      </Link>

      <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-5">
        {navigationItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              )}
              href={item.href}
              key={item.href}
              onClick={onNavigate}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
            {initials(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {displayName}
            </p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <form action={signOutAction}>
            <button
              aria-label="Sign out"
              className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
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
