import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import { toArchiveNotice } from "@/lib/applications/archive-notice";
import { ApplicationCreatePanel } from "@/components/applications/application-form";
import { ApplicationFilters } from "@/components/applications/application-filters";
import {
  ApplicationList,
  ApplicationsListLoading,
} from "@/components/applications/application-list";
import { listActiveWorkTermSeasons } from "@/lib/applications/repository";
import {
  parseApplicationFilters,
  type RawSearchParams,
} from "@/lib/applications/search-params";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const rawSearchParams = await searchParams;
  // Unrecognized parameters are dropped rather than rejected, so an edited URL
  // falls back to the ordinary list instead of an error.
  const filters = parseApplicationFilters(rawSearchParams);
  const archiveNotice = toArchiveNotice(rawSearchParams.archive);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The work-term options are the student's own; another user's terms are
  // never reachable, because the read is owner-scoped like every other.
  const { data: workTermOptions } = await listActiveWorkTermSeasons(
    supabase,
    user.id,
  );

  // Keying the boundary on the applied filters means each new search shows the
  // loading state rather than the previous results while the query runs.
  const listKey = JSON.stringify(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">Applications</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Your applications
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
            Add applications and keep their current status, important dates, and
            next action in one place.
          </p>
        </div>
        <ApplicationCreatePanel />
      </div>

      {archiveNotice ? (
        <div
          className={
            archiveNotice.tone === "success"
              ? "flex gap-2 rounded-record border border-success/30 bg-success-soft p-4 text-sm text-success"
              : "flex gap-2 rounded-record border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
          }
          role="status"
        >
          {archiveNotice.tone === "success" ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          {archiveNotice.message}
        </div>
      ) : null}

      <ApplicationFilters
        filters={filters}
        workTermOptions={workTermOptions ?? []}
      />

      <Suspense fallback={<ApplicationsListLoading />} key={listKey}>
        <ApplicationList filters={filters} />
      </Suspense>
    </div>
  );
}
