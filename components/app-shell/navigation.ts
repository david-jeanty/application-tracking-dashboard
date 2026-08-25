import {
  Archive,
  BarChart3,
  Columns3,
  FileText,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * How `href` decides whether this row is the current one.
   *
   * `prefix` is the default and the ordinary case: `/applications` owns
   * `/applications/abc` and everything else beneath it, so opening a record
   * keeps its section lit.
   *
   * `exact` is for a row whose href is an ancestor of its siblings'. The demo
   * dashboard lives at `/demo` while the other demo surfaces are `/demo/…`, so
   * under prefix matching it would be active on every one of them and the
   * sidebar would announce two current pages at once.
   */
  match?: "prefix" | "exact";
};

/** The day-to-day workflow, in the order a student moves through it. */
export const primaryNavigationItems: readonly NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

/** Finished work. Kept slightly apart so it does not compete with the above. */
export const secondaryNavigationItems: readonly NavigationItem[] = [
  { href: "/archive", label: "Archive", icon: Archive },
];

/** Sits at the foot of the sidebar rather than in the workflow list. */
export const utilityNavigationItems: readonly NavigationItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The demo workspace's navigation: the four surfaces that explain JobTrack.
 *
 * Archive and Settings are absent rather than disabled. Both are about a
 * workspace somebody owns — filing your own records away, connecting your own
 * assistant — and neither has anything to show a visitor exploring sample data.
 */
export const demoNavigationItems: readonly NavigationItem[] = [
  // Exact, because `/demo` is the parent of every other row's href.
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard, match: "exact" },
  { href: "/demo/applications", label: "Applications", icon: FileText },
  { href: "/demo/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/demo/analytics", label: "Analytics", icon: BarChart3 },
];

export const navigationItems: readonly NavigationItem[] = [
  ...primaryNavigationItems,
  ...secondaryNavigationItems,
  ...utilityNavigationItems,
];

/**
 * Whether a navigation row is the page currently open.
 *
 * The rule is the item's own, declared beside its href rather than inferred
 * from the shape of the path — so the one row that needs exact matching says
 * so, and no component has to know which pathname is special.
 */
export function isNavigationItemActive(
  pathname: string,
  item: NavigationItem | string,
): boolean {
  const { href, match = "prefix" } =
    typeof item === "string" ? { href: item, match: "prefix" as const } : item;

  if (pathname === href) return true;
  return match === "prefix" && pathname.startsWith(`${href}/`);
}
