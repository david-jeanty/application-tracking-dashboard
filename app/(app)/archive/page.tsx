import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import {
  ArchivedApplicationsEmptyState,
  ArchivedApplicationsList,
} from "@/components/applications/archived-list";
import { Card } from "@/components/ui/card";
import { listApplications } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Archive" };

export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The same owner-scoped list read every other surface uses, asking for the
  // other side of the archive line. No second data-access path exists.
  const { data, error } = await listApplications(supabase, user.id, {
    archiveState: "archived",
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-blue-700">Archive</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          Archived applications
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Archiving is not deletion. These applications keep their status and
          history, and restoring one puts it back in your list.
        </p>
      </header>

      {error ? (
        <Card className="flex gap-3 border-red-200 bg-red-50 p-5 text-red-900">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">
              Archived applications could not be loaded
            </h2>
            <p className="mt-1 text-sm">
              Nothing has been lost. Refresh the page to try again.
            </p>
          </div>
        </Card>
      ) : data?.length ? (
        <ArchivedApplicationsList applications={data} />
      ) : (
        <ArchivedApplicationsEmptyState />
      )}
    </div>
  );
}
