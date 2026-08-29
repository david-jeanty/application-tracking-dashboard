import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { ApplicationRecords } from "@/components/applications/application-records";
import { ButtonLink } from "@/components/ui/button";
import {
  listActiveApplications,
  listActiveApplicationSummaryStatuses,
  listApplicationPreviewContent,
  listStatusHistory,
  type ActiveApplicationFilters,
} from "@/lib/applications/repository";
import { hasActiveFilters } from "@/lib/applications/search-params";
import { applicationsPath } from "@/lib/demo/paths";
import { createClient } from "@/lib/supabase/server";
export { ApplicationRecords } from "@/components/applications/application-records";

export function ApplicationsListLoading() {
  return (
    <div
      aria-label="Loading applications"
      role="status"
    >
      <div className="h-16 animate-pulse rounded-surface bg-surface-muted/70" />
      <div className="mt-4 overflow-hidden rounded-surface border border-border/70 bg-surface">
        <div className="hidden h-9 bg-surface-muted/45 md:block" />
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            className="grid min-h-[96px] animate-pulse items-center gap-7 border-t border-border/60 px-5 py-4 md:grid-cols-[minmax(0,42fr)_minmax(18rem,58fr)]"
            key={item}
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-control bg-surface-muted" />
              <div className="space-y-2">
                <div className="h-3.5 w-40 rounded-control bg-surface-muted" />
                <div className="h-3 w-24 rounded-control bg-surface-muted" />
              </div>
            </div>
            <div className="hidden h-7 rounded-control bg-surface-muted md:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading applications…</span>
    </div>
  );
}


/**
 * What the list says when it has nothing to show.
 *
 * Two different problems get two different sets of words: a student with no
 * matches has filters to clear, and a student with no applications has one to
 * add. `clearHref` is where "clear filters" goes, which is the workspace's own
 * applications route.
 */
export function ApplicationsEmptyState({
  clearHref,
  filtered,
}: {
  clearHref: string;
  filtered: boolean;
}) {
  return filtered ? (
    <div className="border-t border-border py-16 text-center">
      <h2 className="text-[16px] text-foreground">
        No applications match these filters
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
        Try changing or clearing your search.
      </p>
      <div className="mt-5">
        <ButtonLink href={clearHref} variant="secondary">
          Clear filters
        </ButtonLink>
      </div>
    </div>
  ) : (
    <div className="border-t border-border py-16 text-center">
      <h2 className="text-[16px] text-foreground">No applications yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
        Add your first application to keep its status, dates, and next action
        together.
      </p>
    </div>
  );
}

export async function ApplicationList({
  filters = {},
}: {
  filters?: ActiveApplicationFilters;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The list, status summary and history remain one owner-scoped read each,
  // however many applications come back. Optional preview content is fetched
  // once more, in a bounded batch, only for the filtered ids an explicitly
  // opened preview can reveal.
  //
  // Archive state is applied inside the list read, not passed in, so a filter
  // built from the URL cannot reach archived records.
  const [applications, history, summaryStatuses] = await Promise.all([
    listActiveApplications(supabase, user.id, filters),
    listStatusHistory(supabase, user.id),
    listActiveApplicationSummaryStatuses(supabase, user.id, filters),
  ]);

  if (applications.error) {
    return (
      <div
        className="flex gap-3 border border-danger/30 bg-danger-soft p-5 text-danger"
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-medium">Applications could not be loaded</h2>
          <p className="mt-1 text-sm">
            Refresh the page to try again. If the problem continues, check the
            database connection.
          </p>
        </div>
      </div>
    );
  }

  const data = applications.data ?? [];

  if (!data.length) {
    return (
      <ApplicationsEmptyState
        clearHref={applicationsPath()}
        filtered={hasActiveFilters(filters)}
      />
    );
  }

  const previewContent = await listApplicationPreviewContent(
    supabase,
    user.id,
    data.map((application) => application.id),
  );

  // A failed history read leaves every rail off rather than taking the list
  // down: the exact status still says where each application stands.
  return (
    <ApplicationRecords
      applications={data}
      filters={filters}
      history={history.error ? null : history.data}
      previewContent={previewContent.error ? [] : previewContent.data ?? []}
      summaryStatuses={
        summaryStatuses.error
          ? data.map((application) => application.current_status)
          : (summaryStatuses.data ?? []).map((row) => row.current_status)
      }
    />
  );
}
