import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOB_CATEGORIES } from "@/lib/applications/constants";
import type { ActiveApplicationFilters } from "@/lib/applications/repository";
import {
  CATEGORY_PARAM,
  hasActiveFilters,
  SEARCH_PARAM,
  WORK_TERM_PARAM,
} from "@/lib/applications/search-params";

const selectClassName =
  "min-h-9 w-full rounded-control border border-border bg-surface px-2.5 text-base text-foreground hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none sm:text-[13px]";

/**
 * Search and work-term controls for the pipeline board.
 *
 * A plain `GET` form, like the applications list's: the filters live in the URL
 * and nothing else, so refresh, back, and bookmarking work because the browser
 * is doing what it always does with a form. No client component, and the board
 * keeps rendering on the server.
 *
 * Three controls rather than the list's four. Status is the one the board does
 * not offer, because the columns are the statuses — see `parsePipelineFilters`.
 *
 * The work-term options come from the student's own active applications, since
 * `work_term_season` is free text rather than an enum.
 */
export function PipelineFilters({
  filters,
  workTermOptions,
}: {
  filters: ActiveApplicationFilters;
  workTermOptions: string[];
}) {
  // A stored term that no longer matches any active application would silently
  // vanish from the control, leaving it showing "All work terms" while the
  // filter is still applied. Keeping it as an option makes that visible.
  const workTerms =
    filters.workTermSeason && !workTermOptions.includes(filters.workTermSeason)
      ? [...workTermOptions, filters.workTermSeason].sort((first, second) =>
          first.localeCompare(second),
        )
      : workTermOptions;

  return (
    <form
      action="/pipeline"
      className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center"
      method="get"
    >
      <div className="sm:min-w-56 sm:flex-1">
        <label className="sr-only" htmlFor="pipeline-search">
          Search applications
        </label>
        <Input
          defaultValue={filters.search ?? ""}
          id="pipeline-search"
          maxLength={160}
          name={SEARCH_PARAM}
          placeholder="Search applications..."
          type="search"
        />
      </div>

      {/*
        The two narrow controls share a row of their own on a phone, then
        dissolve into the same flex row as the search field once there is width
        for it.
      */}
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <div className="sm:w-40">
          <label className="sr-only" htmlFor="pipeline-work-term">
            Filter by work term
          </label>
          <select
            className={selectClassName}
            defaultValue={filters.workTermSeason ?? ""}
            disabled={workTerms.length === 0}
            id="pipeline-work-term"
            name={WORK_TERM_PARAM}
          >
            <option value="">All work terms</option>
            {workTerms.map((season) => (
              <option key={season} value={season}>
                {season}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-44">
          <label className="sr-only" htmlFor="pipeline-category">
            Filter by role type
          </label>
          <select
            className={selectClassName}
            defaultValue={filters.category ?? ""}
            id="pipeline-category"
            name={CATEGORY_PARAM}
          >
            <option value="">All role types</option>
            {JOB_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 sm:flex-none" type="submit" variant="secondary">
          Apply
        </Button>
        {hasActiveFilters(filters) ? (
          <Link
            className="inline-flex min-h-9 items-center justify-center rounded-control px-3 text-sm text-foreground-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href="/pipeline"
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
