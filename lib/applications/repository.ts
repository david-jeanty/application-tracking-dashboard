import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMissingConditionalUpdate } from "@/lib/applications/concurrency";
import {
  toApplicationInsert,
  toApplicationUpdate,
} from "@/lib/applications/mapper";
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

export async function listActiveApplications(
  supabase: SupabaseClient,
  authenticatedUserId: string,
) {
  return supabase
    .from("applications")
    .select(
      "id,company_name,original_job_title,normalized_job_category,current_status,location,work_arrangement,date_applied,application_deadline,next_action,next_action_due_date,created_at",
    )
    .eq("user_id", authenticatedUserId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<ApplicationListItem[]>();
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
