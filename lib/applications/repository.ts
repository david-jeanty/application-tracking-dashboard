import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMissingConditionalUpdate } from "@/lib/applications/concurrency";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import type {
  ApplicationStatus,
  JobCategory,
} from "@/lib/applications/constants";
import {
  toApplicationInsert,
  toApplicationUpdate,
} from "@/lib/applications/mapper";
import {
  toContainsPattern,
  toSearchFilter,
} from "@/lib/applications/search";
import type {
  ApplicationListItem,
  ApplicationRecord,
  ApplicationStatusEvent,
} from "@/lib/applications/types";
import type {
  ApplicationCreationInput,
  ApplicationUpdateInput,
} from "@/lib/validation/application";

const APPLICATION_DETAIL_COLUMNS =
  "id,company_name,original_job_title,normalized_job_category,classification_confidence,location,work_arrangement,application_url,application_source,job_description,application_deadline,date_applied,current_status,work_term_season,work_term_duration,salary,notes,next_action,next_action_due_date,created_at,updated_at,archived_at";

/**
 * The one projection every list read uses. Long free-text columns are absent
 * by construction, so no list caller — page, component, or MCP tool — can
 * accidentally ship a 50,000-character job description in a list response.
 */
const APPLICATION_SUMMARY_COLUMNS =
  "id,company_name,original_job_title,normalized_job_category,current_status,location,work_arrangement,work_term_season,date_applied,application_deadline,next_action,next_action_due_date,created_at,archived_at";

export async function createApplication(
  supabase: SupabaseClient,
  input: ApplicationCreationInput,
) {
  return supabase
    .from("applications")
    .insert(toApplicationInsert(input))
    .select("id")
    .single();
}

/** Which side of the archive line a list read covers. */
export type ArchiveState = "active" | "archived" | "all";

export type ApplicationListFilters = {
  status?: ApplicationStatus;
  category?: JobCategory;
  /**
   * Case-insensitive substring matched against any searchable column —
   * employer, job title, or location. This is what the website's search box
   * sends; `company` stays a single-column filter for callers that mean only
   * the employer.
   */
  search?: string;
  /** Case-insensitive substring of the employer name. */
  company?: string;
  /** Case-insensitive substring of the work-term season. */
  workTermSeason?: string;
  /** Defaults to `active`, matching what the dashboard shows. */
  archiveState?: ArchiveState;
  /** Omitted means unlimited, which only the first-party list page uses. */
  limit?: number;
};

/**
 * The filters a caller may apply to the active list.
 *
 * `archiveState` is absent by construction rather than by convention: the
 * applications page builds its filters from URL parameters, and this type is
 * what stops a crafted query string from ever asking for archived rows.
 */
export type ActiveApplicationFilters = Omit<
  ApplicationListFilters,
  "archiveState"
>;

/**
 * Lists the authenticated user's applications, newest first.
 *
 * Every filter is optional and additive, and the owner predicate is applied
 * first and never from caller input. The supported filters map onto the
 * existing indexes: `(user_id, created_at desc)` orders the result, and
 * `(user_id, current_status) where archived_at is null` covers the common
 * status filter on active applications.
 */
export async function listApplications(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  filters: ApplicationListFilters = {},
) {
  let query = supabase
    .from("applications")
    .select(APPLICATION_SUMMARY_COLUMNS)
    .eq("user_id", authenticatedUserId);

  const archiveState = filters.archiveState ?? "active";
  if (archiveState === "active") query = query.is("archived_at", null);
  if (archiveState === "archived") query = query.not("archived_at", "is", null);

  if (filters.status) query = query.eq("current_status", filters.status);
  if (filters.category) {
    query = query.eq("normalized_job_category", filters.category);
  }
  if (filters.search) query = query.or(toSearchFilter(filters.search));
  if (filters.company) {
    query = query.ilike("company_name", toContainsPattern(filters.company));
  }
  if (filters.workTermSeason) {
    query = query.ilike(
      "work_term_season",
      toContainsPattern(filters.workTermSeason),
    );
  }

  query = query.order("created_at", { ascending: false });
  if (filters.limit !== undefined) query = query.limit(filters.limit);

  return query.returns<ApplicationListItem[]>();
}

/**
 * Lists the authenticated user's active applications.
 *
 * `archiveState` is applied here and cannot be supplied by the caller, so the
 * applications page cannot be talked into showing archived records by a URL
 * parameter however its filters were built.
 */
export async function listActiveApplications(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  filters: ActiveApplicationFilters = {},
) {
  return listApplications(supabase, authenticatedUserId, {
    ...filters,
    archiveState: "active",
  });
}

/**
 * The distinct work terms the user's own active applications actually use.
 *
 * `work_term_season` is free text by design — a student's terms are theirs to
 * name — so the filter's options come from their own data rather than from a
 * global enum. The internal `Not specified` sentinel is left out: it is a
 * database requirement, not a term anyone would choose to filter by.
 *
 * Deduplication and sorting happen here rather than in SQL. PostgREST has no
 * `distinct`, and adding a view or function for a per-student list of a few
 * dozen short strings would be more machinery than the problem deserves.
 */
export async function listActiveWorkTermSeasons(
  supabase: SupabaseClient,
  authenticatedUserId: string,
): Promise<{ data: string[] | null; error: { code?: string } | null }> {
  const { data, error } = await supabase
    .from("applications")
    .select("work_term_season")
    .eq("user_id", authenticatedUserId)
    .is("archived_at", null)
    .returns<{ work_term_season: string }[]>();

  if (error) return { data: null, error };

  const seasons = new Set(
    (data ?? [])
      .map((row) => row.work_term_season?.trim())
      .filter(
        (season): season is string =>
          Boolean(season) && season !== UNSPECIFIED_DATABASE_VALUE,
      ),
  );

  return {
    data: [...seasons].sort((first, second) => first.localeCompare(second)),
    error: null,
  };
}

/**
 * Every status event belonging to the authenticated user.
 *
 * The projection is deliberately two columns: "has this application ever been
 * at this status" is all the conversion metrics need, and `changed_at` would
 * only invite a duration metric that mixes a `timestamptz` with the date-only
 * `date_applied`. Ordering is irrelevant to a set membership question, so none
 * is requested.
 *
 * History is readable but never writable by a client: the table grants
 * `select` only, and its policies deny every mutation. The owner predicate here
 * sits on top of that, and row-level security applies again underneath.
 */
export async function listStatusHistory(
  supabase: SupabaseClient,
  authenticatedUserId: string,
) {
  return supabase
    .from("application_status_history")
    .select("application_id,new_status")
    .eq("user_id", authenticatedUserId)
    .returns<ApplicationStatusEvent[]>();
}

export async function getApplicationById(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
) {
  return supabase
    .from("applications")
    .select(APPLICATION_DETAIL_COLUMNS)
    .eq("id", applicationId)
    .eq("user_id", authenticatedUserId)
    .maybeSingle<ApplicationRecord>();
}

export type ArchiveStateResult =
  | { outcome: "updated"; application: ApplicationRecord }
  | { outcome: "not_found" }
  | { outcome: "error"; code?: string };

/**
 * Moves one application across the archive line, and changes nothing else.
 *
 * Archiving is a state transition, not a field edit, so this deliberately does
 * not go through `updateApplication`: that path writes the whole record from a
 * validated form and requires an `expectedUpdatedAt`. Here the update payload
 * is a single column, which is what guarantees the rest of the record — status
 * above all — survives untouched.
 *
 * No status-history event is produced, and that is structural rather than a
 * convention this function follows: the history trigger is declared
 * `after update of current_status ... when (old.current_status is distinct
 * from new.current_status)`, and this statement never mentions that column.
 *
 * Optimistic concurrency is intentionally absent. Setting one column cannot
 * clobber somebody's in-flight field edit, and requiring a version would force
 * a read first for no protection gained.
 *
 * A row that does not exist and a row owned by another student are the same
 * `not_found` here: the owner predicate is applied before the write, and
 * row-level security applies again underneath.
 */
export async function setApplicationArchiveState(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
  archivedAt: string | null,
): Promise<ArchiveStateResult> {
  const { data, error } = await supabase
    .from("applications")
    .update({ archived_at: archivedAt })
    .eq("id", applicationId)
    .eq("user_id", authenticatedUserId)
    .select(APPLICATION_DETAIL_COLUMNS)
    .maybeSingle<ApplicationRecord>();

  if (error) return { outcome: "error", code: error.code };
  if (!data) return { outcome: "not_found" };
  return { outcome: "updated", application: data };
}

export type ApplicationDeleteResult =
  | { outcome: "deleted" }
  | { outcome: "not_found" }
  | { outcome: "error"; code?: string };

/**
 * Permanently removes one archived application the caller owns.
 *
 * Three predicates have to hold, and all three live in the statement rather
 * than in the page that called it:
 *
 * - `id` selects the record,
 * - `user_id` restricts it to the caller, and
 * - `archived_at is not null` restricts it to something already archived.
 *
 * That last one is what makes "only an archived application may be deleted" a
 * property of the write rather than of the UI. A crafted request naming an
 * active application matches no row, so it deletes nothing — there is no code
 * path that reaches an active record.
 *
 * Status history is not deleted here. The history table's foreign key is
 * `(application_id, user_id) references applications (id, user_id) on delete
 * cascade`, so Postgres removes those rows as part of this statement. Doing it
 * by hand would be a second, drifting implementation of a rule the schema
 * already enforces — and authenticated clients are granted `select` only on
 * that table, so they could not do it anyway.
 *
 * Every rejected case returns the same `not_found`: missing, owned by another
 * student, and not archived are indistinguishable to the caller, so a response
 * never confirms that somebody else's application exists.
 */
export async function deleteArchivedApplication(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
): Promise<ApplicationDeleteResult> {
  const { data, error } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("user_id", authenticatedUserId)
    .not("archived_at", "is", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { outcome: "error", code: error.code };
  if (!data) return { outcome: "not_found" };
  return { outcome: "deleted" };
}

export type ApplicationUpdateResult =
  | { outcome: "updated"; application: ApplicationRecord }
  | { outcome: "conflict" }
  | { outcome: "not_found" }
  | { outcome: "error"; code?: string };

export async function updateApplication(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
  input: ApplicationUpdateInput,
): Promise<ApplicationUpdateResult> {
  const { data, error } = await supabase
    .from("applications")
    .update(toApplicationUpdate(input))
    .eq("id", applicationId)
    .eq("user_id", authenticatedUserId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(APPLICATION_DETAIL_COLUMNS)
    .maybeSingle<ApplicationRecord>();

  if (error) return { outcome: "error", code: error.code };
  if (data) return { outcome: "updated", application: data };

  const current = await getApplicationById(
    supabase,
    authenticatedUserId,
    applicationId,
  );
  if (current.error) return { outcome: "error", code: current.error.code };
  return { outcome: classifyMissingConditionalUpdate(Boolean(current.data)) };
}
