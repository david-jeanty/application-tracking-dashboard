import type { Metadata } from "next";
import { Columns3 } from "lucide-react";
import { PlaceholderPage } from "@/components/app-shell/placeholder-page";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <PlaceholderPage
      description="A status-based pipeline with persistent, accessible updates will be developed only after core application management."
      icon={Columns3}
      plannedFor="Phase 4 pipeline work"
      title="Pipeline"
    />
  );
}
