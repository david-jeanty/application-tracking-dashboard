import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMissingConditionalUpdate } from "@/lib/applications/concurrency";
import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  toApplicationInsert,
  toApplicationUpdate,
} from "@/lib/applications/mapper";
import { toContainsPattern } from "@/lib/applications/search";
import type {
  ApplicationListItem,
  ApplicationRecord,
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

export async function listActiveApplications(
  supabase: SupabaseClient,
  authenticatedUserId: string,
) {
  return listApplications(supabase, authenticatedUserId, {
    archiveState: "active",
  });
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
