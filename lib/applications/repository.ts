import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { toApplicationInsert } from "@/lib/applications/mapper";
import type { ApplicationListItem } from "@/lib/applications/types";
import type { ApplicationCreationInput } from "@/lib/validation/application";

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
