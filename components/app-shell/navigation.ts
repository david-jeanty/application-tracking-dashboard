import {
  Archive,
  BarChart3,
  Columns3,
  FileText,
  LayoutDashboard,
  Settings,
} from "lucide-react";

export const navigationItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
