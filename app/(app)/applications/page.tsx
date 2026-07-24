import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PlaceholderPage } from "@/components/app-shell/placeholder-page";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <PlaceholderPage
      description="Application entry, search, filters, status changes, deadlines, and next actions will live here."
      icon={FileText}
      plannedFor="Phase 2 application management"
      title="Applications"
    />
  );
}
