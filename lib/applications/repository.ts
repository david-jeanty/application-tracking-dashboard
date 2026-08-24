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
  ApplicationAnalyticsRow,
  ApplicationListItem,
  ApplicationRecord,
  ApplicationStatusEvent,
  ApplicationTimelineEvent,
} from "@/lib/applications/types";
import type {
  ApplicationCreationInput,
  ApplicationUpdateInput,
} from "@/lib/validation/application";

const APPLICATION_DETAIL_COLUMNS =
  "id,company_name,company_domain,original_job_title,normalized_job_category,classification_confidence,location,work_arrangement,application_url,application_source,job_description,application_deadline,date_applied,current_status,work_term_season,work_term_duration,salary,notes,next_action,next_action_due_date,created_at,updated_at,archived_at";

/**
 * The one projection every list read uses. Long free-text columns are absent
 * by construction, so no list caller — page, component, or MCP tool — can
 * accidentally ship a 50,000-character job description in a list response.
 */
const APPLICATION_SUMMARY_COLUMNS =
  "id,company_name,company_domain,original_job_title,normalized_job_category,current_status,location,work_arrangement,work_term_season,date_applied,application_deadline,next_action,next_action_due_date,created_at,archived_at";

/**
 * The analytics projection: the five columns the metrics actually read.
 *
 * Deliberately not `APPLICATION_SUMMARY_COLUMNS`. Analytics needs
 * `application_source`, which no list surface renders, and needs none of the
 * dates, titles, or branding every list surface does. Selecting its own
 * columns keeps that widening out of the shared list contract and keeps this
 * read the smaller of the two.
 */
const APPLICATION_ANALYTICS_COLUMNS =
  "id,current_status,normalized_job_category,application_source,archived_at";

/**
 * Every application the user has saved, projected for analytics.
 *
 * No archive filter, by design: analytics describes the whole search, and a
 * rejected role a student tidied away still happened. The applications list
 * takes the opposite view because it is a worklist rather than a record.
 *
 * No ordering either. Every analytics figure is an aggregate over the whole
 * set, and the source grouping breaks its ties on the values themselves rather
 * than on row order, so nothing downstream can depend on the sequence.
 *
 * Owner-scoped like every other read here, with row-level security applying
 * again underneath.
 */
export async function listApplicationsForAnalytics(
  supabase: SupabaseClient,
  authenticatedUserId: string,
) {
  return supabase
    .from("applications")
    .select(APPLICATION_ANALYTICS_COLUMNS)
    .eq("user_id", authenticatedUserId)
    .returns<ApplicationAnalyticsRow[]>();
}

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

/**
 * Every status event belonging to one application the caller owns.
 *
 * The same table, projection and owner scoping as `listStatusHistory`, narrowed
 * by `application_id`. The detail page needs one application's stages, and the
 * existing `(user_id, application_id, changed_at)` index already covers this
 * shape, so reading the student's entire history to draw a single rail would be
 * work for nothing.
 *
 * `select` only, like every history read: the table grants no mutation to
 * authenticated clients, the owner predicate sits on top, and row-level
 * security applies again underneath.
 */
export async function listApplicationStatusHistory(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
) {
  return supabase
    .from("application_status_history")
    .select("application_id,new_status")
    .eq("user_id", authenticatedUserId)
    .eq("application_id", applicationId)
    .returns<ApplicationStatusEvent[]>();
}

/**
 * Every status event belonging to the authenticated user, with its timestamp.
 *
 * A separate read from `listStatusHistory` rather than a wider projection on
 * it. That function's two columns answer a set-membership question — "did this
 * application ever reach Interview" — and its comment records a deliberate
 * decision to keep `changed_at` out so nobody builds a duration metric that
 * mixes a `timestamptz` with the date-only `date_applied`. The dashboard asks
 * a genuinely different question: *when* did things move. Widening the shared
 * type would quietly hand every analytics caller a field that decision
 * excluded.
 *
 * `previous_status` is what separates the single creation event a trigger
 * writes — it alone is null — from a real status change, so recent activity
 * can describe each in its own words instead of showing both for one moment.
 *
 * Newest first, which is the order recent activity renders and the order the
 * `(user_id, application_id, changed_at)` index already supports. The same
 * grants and policies apply as to any history read: `select` only, owner
 * predicate here, and row-level security again underneath.
 */
export async function listStatusTimeline(
  supabase: SupabaseClient,
  authenticatedUserId: string,
) {
  return supabase
    .from("application_status_history")
    .select("application_id,previous_status,new_status,changed_at")
    .eq("user_id", authenticatedUserId)
    .order("changed_at", { ascending: false })
    .returns<ApplicationTimelineEvent[]>();
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

export type QuickUpdateResult =
  | { outcome: "updated" }
  | { outcome: "not_found" }
  | { outcome: "error"; code?: string };

/**
 * One small, owner-scoped write against an active application.
 *
 * Every quick update shares these three predicates, and all three live in the
 * statement rather than in the page that called it:
 *
 * - `id` selects the record,
 * - `user_id` restricts it to the caller, and
 * - `archived_at is null` restricts it to an active one.
 *
 * That last predicate is what makes "quick update is for active applications"
 * a property of the write. A crafted post naming an archived record matches no
 * row and changes nothing, whether or not the page rendered the controls.
 *
 * Optimistic concurrency is deliberately absent, and this is the reason it can
 * be: the caller supplies a patch of one or two named columns, so the write
 * cannot carry a stale copy of anything the student did not just edit. The
 * full edit form still requires an `expectedUpdatedAt` because it replaces the
 * entire record and genuinely could overwrite somebody's in-flight change.
 *
 * Only `id` comes back. The detail page re-reads the record after redirecting,
 * so returning the full row here would be a second projection to keep in step
 * for no benefit.
 *
 * Missing, owned by another student, and archived are the same `not_found`, so
 * a response never confirms that somebody else's application exists.
 */
async function quickUpdate(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
  patch: Record<string, string | null>,
): Promise<QuickUpdateResult> {
  const { data, error } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", applicationId)
    .eq("user_id", authenticatedUserId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { outcome: "error", code: error.code };
  if (!data) return { outcome: "not_found" };
  return { outcome: "updated" };
}

/**
 * Sets the current status of one active application the caller owns.
 *
 * The patch is a single column, which is what guarantees the rest of the
 * record survives untouched: no `date_applied` is inferred, no next action is
 * cleared, no archive state changes. Nothing here enforces an order on the
 * statuses either — a student may move backward from Interview to Applied, or
 * skip straight to Offer, because a real search does both.
 *
 * Status history is the database's job, not this function's. The trigger is
 * declared `after update of current_status ... when (old.current_status is
 * distinct from new.current_status)`, so a genuine change records exactly one
 * event and re-saving the status already stored records none. No application
 * code writes to the history table, and authenticated clients could not: it
 * grants `select` only.
 */
export async function setApplicationStatus(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
  status: ApplicationStatus,
): Promise<QuickUpdateResult> {
  return quickUpdate(supabase, authenticatedUserId, applicationId, {
    current_status: status,
  });
}

/**
 * Sets, or clears, the next action of one active application the caller owns.
 *
 * The patch is exactly the two next-action columns, so saving a follow-up
 * never disturbs the status — and therefore never produces a status-history
 * event, because the trigger only watches `current_status`.
 *
 * The pairing rule is enforced here rather than in a schema: a due date is
 * written only alongside an action, and an empty action clears both columns.
 * Keeping it in the write means the database can never end up holding a due
 * date for an action that does not exist, whatever path the values arrived by.
 * Clearing is the same statement with empty input, not a separate one.
 */
export async function setApplicationNextAction(
  supabase: SupabaseClient,
  authenticatedUserId: string,
  applicationId: string,
  nextAction: { action?: string; dueDate?: string } = {},
): Promise<QuickUpdateResult> {
  const action = nextAction.action?.trim() || null;

  return quickUpdate(supabase, authenticatedUserId, applicationId, {
    next_action: action,
    next_action_due_date: action ? nextAction.dueDate ?? null : null,
  });
}
