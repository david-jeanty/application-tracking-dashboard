import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArchivedApplicationsEmptyState,
  ArchivedApplicationsList,
} from "@/components/applications/archived-list";
import { Notice } from "@/components/ui/notice";
import { toDeleteNotice } from "@/lib/applications/archive-notice";
import { listApplications } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Archive" };

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ delete?: string | string[] }>;
}) {
  const deleteNotice = toDeleteNotice((await searchParams).delete);

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
    <div className="space-y-8">
      {/*
        One page title, at the scale every other page uses, and a sentence
        saying what the page is for. The accent eyebrow that used to sit above
        it printed the word "Archive" a second time.
      */}
      <div>
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Archive
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-foreground-secondary">
          What you have put away. Archiving is not deletion — these
          applications keep their status and history, and restoring one puts it
          back in your list.
        </p>
      </div>

      {deleteNotice ? (
        <Notice role="status" tone={deleteNotice.tone}>
          {deleteNotice.message}
        </Notice>
      ) : null}

      {error ? (
        <Notice heading="Archived applications could not be loaded" tone="error">
          Nothing has been lost. Refresh the page to try again.
        </Notice>
      ) : data?.length ? (
        <ArchivedApplicationsList applications={data} />
      ) : (
        <ArchivedApplicationsEmptyState />
      )}
    </div>
  );
}
