import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PlaceholderPage } from "@/components/app-shell/placeholder-page";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PlaceholderPage
      description="Profile and account preferences will appear here after their editing workflow is implemented and tested."
      icon={Settings}
      plannedFor="profile settings work"
      title="Settings"
    />
  );
}
