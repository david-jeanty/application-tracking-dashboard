import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_SUMMARIES,
  JOB_CATEGORIES,
} from "@/lib/applications/constants";
import type { ActiveApplicationFilters } from "@/lib/applications/repository";
import {
  CATEGORY_PARAM,
  hasActiveFilters,
  SEARCH_PARAM,
  STATUS_PARAM,
  WORK_TERM_PARAM,
} from "@/lib/applications/search-params";

/**
 * Sized to sit in a row beside the search field rather than to fill a form
 * column, which is what keeps the controls next to the records they narrow.
 */
const selectClassName =
  "min-h-11 w-full rounded-control border border-border bg-surface px-2.5 text-base text-foreground hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none sm:min-h-9 sm:text-[13px]";

/**
 * Search and filter controls for the applications list.
 *
 * A plain `GET` form, so the filters live in the URL and nothing else: refresh,
 * back, and bookmarking work because the browser is doing what it always does
 * with a form. Pressing Enter in the search field submits it. No client
 * component, no router state, and the page keeps rendering on the server.
 *
 * The work-term options come from the student's own active applications, since
 * `work_term_season` is free text rather than an enum.
 */
export function ApplicationFilters({
  action = "/applications",
  clearHref = action,
  filters,
  workTermOptions,
}: {
  /** Where the GET form submits. The demo narrows its own list at its own route. */
  action?: string;
  /** Where Clear goes. The same route by default, with no query string. */
  clearHref?: string;
  filters: ActiveApplicationFilters;
  workTermOptions: string[];
}) {
  const filtered = hasActiveFilters(filters);
  // A stored term that no longer matches any active application would silently
  // vanish from the list, leaving the control showing "All work terms" while
  // the filter is still applied. Keeping it as an option makes that visible.
  const workTerms =
    filters.workTermSeason && !workTermOptions.includes(filters.workTermSeason)
      ? [...workTermOptions, filters.workTermSeason].sort((first, second) =>
          first.localeCompare(second),
        )
      : workTermOptions;

  return (
    <form
      action={action}
      className="flex flex-col gap-2.5 rounded-surface border border-border bg-surface-muted/45 p-3 sm:flex-row sm:flex-wrap sm:items-center"
      method="get"
    >
      <div className="sm:min-w-56 sm:flex-1">
        <label className="sr-only" htmlFor="applications-search">
          Search applications
        </label>
        <Input
          className="min-h-11 sm:min-h-9"
          defaultValue={filters.search ?? ""}
          id="applications-search"
          maxLength={160}
          name={SEARCH_PARAM}
          placeholder="Search applications..."
          type="search"
        />
      </div>

      {/*
        The three narrow controls share a row of their own on a phone, then
        dissolve into the same flex row as the search field once there is
        width for it.
      */}
      <div className="grid gap-2 sm:contents">
        <div className="sm:w-36">
          <label className="sr-only" htmlFor="applications-status">
            Filter by status
          </label>
          <select
            className={selectClassName}
            defaultValue={
              filters.statusSummary
                ? APPLICATION_STATUS_SUMMARIES.find(
                    (summary) => summary.key === filters.statusSummary,
                  )?.queryValue
                : filters.status ?? ""
            }
            id="applications-status"
            name={STATUS_PARAM}
          >
            <option value="">All statuses</option>
            <optgroup label="Summary groups">
              {APPLICATION_STATUS_SUMMARIES.map((summary) => (
                <option key={summary.key} value={summary.queryValue}>
                  {summary.label} stages
                </option>
              ))}
            </optgroup>
            <optgroup label="Exact statuses">
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
            </optgroup>
          </select>
        </div>

        <div className="sm:w-36">
          <label className="sr-only" htmlFor="applications-work-term">
            Filter by work term
          </label>
          <select
            className={selectClassName}
            defaultValue={filters.workTermSeason ?? ""}
            disabled={workTerms.length === 0}
            id="applications-work-term"
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

        <div className="sm:w-40">
          <label className="sr-only" htmlFor="applications-category">
            Filter by category
          </label>
          <select
            className={selectClassName}
            defaultValue={filters.category ?? ""}
            id="applications-category"
            name={CATEGORY_PARAM}
          >
            <option value="">All categories</option>
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
        {filtered ? (
          <Link
            className="inline-flex min-h-9 items-center justify-center rounded-control px-3 text-sm text-foreground-secondary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href={clearHref}
          >
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
