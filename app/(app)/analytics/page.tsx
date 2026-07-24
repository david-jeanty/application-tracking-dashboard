import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/app-shell/placeholder-page";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <PlaceholderPage
      description="Accurate metrics will be calculated from authenticated application and status-history data—never static demo values."
      icon={BarChart3}
      plannedFor="Phase 3 analytics"
      title="Analytics"
    />
  );
}
