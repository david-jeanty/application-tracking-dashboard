import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_STATUSES,
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

/** Matches the select styling the application form already uses. */
const selectClassName =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-950 shadow-sm hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-100 sm:text-sm";

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
  filters,
  workTermOptions,
}: {
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
    <Card className="p-4">
      <form action="/applications" className="contents" method="get">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
          <div>
            <label className="sr-only" htmlFor="applications-search">
              Search applications
            </label>
            <Input
              defaultValue={filters.search ?? ""}
              id="applications-search"
              maxLength={160}
              name={SEARCH_PARAM}
              placeholder="Search applications..."
              type="search"
            />
          </div>

          <div>
            <label className="sr-only" htmlFor="applications-status">
              Filter by status
            </label>
            <select
              className={selectClassName}
              defaultValue={filters.status ?? ""}
              id="applications-status"
              name={STATUS_PARAM}
            >
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
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

          <div>
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

          <div className="flex gap-2">
            <Button className="flex-1 lg:flex-none" type="submit">
              Apply filters
            </Button>
            {filtered ? (
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                href="/applications"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>
    </Card>
  );
}
