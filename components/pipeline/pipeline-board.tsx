import { AlertCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { PipelineCard } from "@/components/pipeline/pipeline-card";
import { ButtonLink } from "@/components/ui/button";
import {
  listActiveApplications,
  type ActiveApplicationFilters,
} from "@/lib/applications/repository";
import { hasActiveFilters } from "@/lib/applications/search-params";
import { buildPipelineBoard, type PipelineColumn } from "@/lib/pipeline/board";
import { createClient } from "@/lib/supabase/server";

/** One status column, with everything currently sitting at it. */
function Column({
  column,
  filters,
}: {
  column: PipelineColumn;
  filters: ActiveApplicationFilters;
}) {
  const headingId = `pipeline-${column.status.toLowerCase()}`;

  return (
    <section
      aria-labelledby={headingId}
      /*
        Empty columns are shown on the board, where a gap in the sequence would
        be harder to read than an honest zero and the column is still somewhere
        to move an application to. Stacked on a phone, that same column is a
        heading with nothing under it, repeated for every status the student is
        not using, so there it is left out — nothing is hidden but a zero the
        board above already reports.
      */
      className={
        column.count
          ? "md:w-64 md:shrink-0"
          : "hidden md:block md:w-64 md:shrink-0"
      }
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2
          className="text-[13px] font-medium text-foreground"
          id={headingId}
        >
          {column.status}
        </h2>
        <span className="text-[12px] tabular-nums text-foreground-muted">
          {column.count}
        </span>
      </div>

      {column.count ? (
        <ul aria-label={`${column.status} applications`} className="mt-3 space-y-2">
          {column.applications.map((application) => (
            <PipelineCard
              application={application}
              filters={filters}
              key={application.id}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-foreground-muted">None</p>
      )}
    </section>
  );
}

export function PipelineBoardLoading() {
  return (
    <div aria-label="Loading pipeline" className="flex flex-col gap-8 md:flex-row md:gap-4" role="status">
      {[0, 1, 2, 3].map((column) => (
        <div className="md:w-64 md:shrink-0" key={column}>
          <div className="h-6 animate-pulse border-b border-border bg-surface-muted" />
          <div className="mt-3 space-y-2">
            <div className="h-24 animate-pulse bg-surface-muted" />
            <div className="h-24 animate-pulse bg-surface-muted" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading pipeline…</span>
    </div>
  );
}

/**
 * The board: every active application, under the status it is at.
 *
 * One owner-scoped read for the whole page, grouped in memory. No history read
 * and no rails — the columns are the progress here — so this is the cheaper of
 * the two working surfaces despite showing the same records as the list.
 *
 * Archive state is applied inside the read rather than passed in, so a filter
 * built from the URL cannot reach archived records, and a status filter cannot
 * be described at all: `parsePipelineFilters` does not produce one.
 */
export async function PipelineBoard({
  filters = {},
}: {
  filters?: ActiveApplicationFilters;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const applications = await listActiveApplications(supabase, user.id, filters);

  if (applications.error) {
    return (
      <div
        className="flex gap-3 border border-danger/30 bg-danger-soft p-5 text-danger"
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <h2 className="font-medium">The pipeline could not be loaded</h2>
          <p className="mt-1 text-sm">
            Refresh the page to try again. If the problem continues, check the
            database connection.
          </p>
        </div>
      </div>
    );
  }

  const board = buildPipelineBoard(applications.data ?? []);

  if (!board.total) {
    // A student with no matches has a different problem from a student with no
    // applications, so they get different words and a way out.
    return hasActiveFilters(filters) ? (
      <div className="border-t border-border py-16 text-center">
        <h2 className="text-[16px] text-foreground">
          No applications match these filters
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
          Try changing or clearing your search.
        </p>
        <div className="mt-5">
          <ButtonLink href="/pipeline" variant="secondary">
            Clear filters
          </ButtonLink>
        </div>
      </div>
    ) : (
      <div className="border-t border-border py-16 text-center">
        <h2 className="text-[16px] text-foreground">Nothing in the pipeline</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
          Add your first application and it will appear in the column for the
          status you gave it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-foreground-muted">
        {board.total} application{board.total === 1 ? "" : "s"}
      </p>

      {/*
        One composition for every width. The columns sit side by side and scroll
        horizontally when there is room for a board, and stack into the phone's
        reading order when there is not — rather than two markups where a screen
        reader would meet every application twice.

        The horizontal padding is there so a focus ring on a card at the edge of
        a column is not clipped by the scroll container.
      */}
      <div className="mt-5 flex flex-col gap-8 md:-mx-1 md:flex-row md:items-start md:gap-4 md:overflow-x-auto md:px-1 md:pb-3">
        {board.columns.map((column) => (
          <Column column={column} filters={filters} key={column.status} />
        ))}
      </div>
    </div>
  );
}
