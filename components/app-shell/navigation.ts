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
  { href: "/demo", label: "Dashboard", icon: LayoutDashboard },
  { href: "/demo/applications", label: "Applications", icon: FileText },
  { href: "/demo/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/demo/analytics", label: "Analytics", icon: BarChart3 },
];

export const navigationItems: readonly NavigationItem[] = [
  ...primaryNavigationItems,
  ...secondaryNavigationItems,
  ...utilityNavigationItems,
];

export function isNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
