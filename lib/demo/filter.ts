import type { ActiveApplicationFilters } from "@/lib/applications/repository";
import { APPLICATION_STATUS_SUMMARIES } from "@/lib/applications/constants";
import { SEARCHABLE_COLUMNS } from "@/lib/applications/search";
import type { ApplicationListItem } from "@/lib/applications/types";

/**
 * The list filters, applied in memory.
 *
 * The demo has no database, so the narrowing production does in SQL has to
 * happen here — but it has to mean the same thing, or a visitor would learn a
 * filter behaviour the real product does not have. Each clause mirrors exactly
 * one clause of `listApplications`:
 *
 * - exact `status` and `category` are equality matches, as `eq` is; a status
 *   summary is membership in the same explicit group production sends to `in`.
 * - `search` is a case-insensitive substring across the searchable columns,
 *   read from `SEARCHABLE_COLUMNS` rather than restated, so the two cannot
 *   drift about which fields a search looks at.
 * - `workTermSeason` is a case-insensitive substring, as `ilike` is — not an
 *   equality match, even though the demo's terms happen to be exact values.
 *
 * The `%` and `_` escaping production needs has no equivalent here: this
 * compares strings rather than building a `LIKE` pattern, so a search for
 * `100%` is already a search for that text.
 *
 * Order is preserved, so a filtered demo list stays newest-first like the
 * unfiltered one.
 */
export function filterDemoApplications(
  applications: readonly ApplicationListItem[],
  filters: ActiveApplicationFilters,
): ApplicationListItem[] {
  const search = filters.search?.toLowerCase();
  const workTerm = filters.workTermSeason?.toLowerCase();

  return applications.filter((application) => {
    if (filters.status && application.current_status !== filters.status) {
      return false;
    }
    if (filters.statusSummary) {
      const summary = APPLICATION_STATUS_SUMMARIES.find(
        (candidate) => candidate.key === filters.statusSummary,
      );
      if (
        summary &&
        !(summary.statuses as readonly string[]).includes(
          application.current_status,
        )
      ) {
        return false;
      }
    }
    if (
      filters.category &&
      application.normalized_job_category !== filters.category
    ) {
      return false;
    }
    if (
      workTerm &&
      !application.work_term_season.toLowerCase().includes(workTerm)
    ) {
      return false;
    }
    if (
      search &&
      !SEARCHABLE_COLUMNS.some((column) =>
        String(application[column]).toLowerCase().includes(search),
      )
    ) {
      return false;
    }
    return true;
  });
}

/**
 * The work terms the demo's own applications use, for the filter control.
 *
 * The same shape `listActiveWorkTermSeasons` returns: distinct, sorted, and
 * without the `Not specified` sentinel, which is a database requirement rather
 * than a term anybody would filter by.
 */
export function demoWorkTermOptions(
  applications: readonly ApplicationListItem[],
): string[] {
  return [...new Set(applications.map((a) => a.work_term_season))]
    .filter((season) => season && season !== "Not specified")
    .sort((first, second) => first.localeCompare(second));
}
