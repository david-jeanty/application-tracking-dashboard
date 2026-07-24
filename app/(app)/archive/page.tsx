import type { Metadata } from "next";
import { Archive } from "lucide-react";
import { PlaceholderPage } from "@/components/app-shell/placeholder-page";

export const metadata: Metadata = { title: "Archive" };

export default function ArchivePage() {
  return (
    <PlaceholderPage
      description="Archived applications will remain separate from permanent deletion and will retain their history."
      icon={Archive}
      plannedFor="a later archive workflow"
      title="Archive"
    />
  );
}
