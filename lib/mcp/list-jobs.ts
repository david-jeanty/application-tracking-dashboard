import { displayOptionalText } from "@/lib/applications/mapper";
import type { ApplicationListFilters } from "@/lib/applications/repository";
import type { ApplicationListItem } from "@/lib/applications/types";
import {
  toApplicationListFilters,
  type JobSummary,
  type ListJobsInput,
} from "@/lib/validation/mcp";

export type ListJobsOutcome =
  | { outcome: "listed"; applications: JobSummary[]; hasMore: boolean }
  | { outcome: "error"; code?: string };

/**
 * The one repository call this tool needs, injected so filtering, limits, and
 * ownership are testable without a database. It is bound to the authenticated
 * user before it reaches here.
 */
export type ListJobsDependencies = {
  listApplications: (filters: ApplicationListFilters) => Promise<{
    data: ApplicationListItem[] | null;
    error: { code?: string } | null;
  }>;
};

/**
 * Reduces a stored row to the short record Claude chooses between.
 *
 * The `Not specified` sentinel that the database requires for location and
 * work term becomes a plain `null`, so Claude never repeats an internal
 * placeholder back to the student as if it were a real answer.
 */
export function toJobSummary(application: ApplicationListItem): JobSummary {
  return {
    application_id: application.id,
    company: application.company_name,
    job_title: application.original_job_title,
    status: application.current_status,
    work_term: displayOptionalText(application.work_term_season),
    location: displayOptionalText(application.location),
    deadline: application.application_deadline,
    date_applied: application.date_applied,
    archived: application.archived_at !== null,
  };
}

/**
 * Lists the caller's own applications as short records.
 *
 * One row beyond the requested limit is fetched and then dropped. That extra
 * row is the whole of `has_more`: it tells Claude whether narrowing the
 * filters would reveal more applications, without a second counting query.
 *
 * There is no ownership argument to get wrong. The injected read is already
 * scoped to the authenticated user, and row-level security applies again
 * underneath it, so an empty list means "you have none of these" rather than
 * "none exist".
 */
export async function runListJobs(
  args: ListJobsInput,
  dependencies: ListJobsDependencies,
): Promise<ListJobsOutcome> {
  const filters = toApplicationListFilters(args);
  const { data, error } = await dependencies.listApplications({
    ...filters,
    limit: filters.limit + 1,
  });

  if (error) return { outcome: "error", code: error.code };

  const rows = data ?? [];
  const hasMore = rows.length > filters.limit;

  return {
    outcome: "listed",
    applications: rows.slice(0, filters.limit).map(toJobSummary),
    hasMore,
  };
}
