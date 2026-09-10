import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationStatus } from "@/lib/applications/constants";
import type { ApplicationRecord } from "@/lib/applications/types";

/** The exportable columns of one student's `profiles` row. */
export type ProfileExportRecord = {
  full_name: string;
  school: string | null;
  academic_program: string | null;
  graduation_year: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * One full `application_status_history` row, before any join to the
 * application it belongs to. `previous_status` is null only for the single
 * creation event a database trigger writes — see
 * `lib/applications/types.ts`'s `ApplicationTimelineEvent` for the same
 * contract on the narrower projection other surfaces read.
 */
export type StatusHistoryExportRecord = {
  application_id: string;
  previous_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changed_at: string;
};

export type AccountExportData = {
  exported_at: string;
  account: { id: string; email: string | null };
  profile: ProfileExportRecord | null;
  applications: ApplicationRecord[];
  application_status_history: StatusHistoryExportRecord[];
};

export type AccountExportResult =
  | { outcome: "exported"; data: AccountExportData }
  | { outcome: "error"; message: string };

/**
 * Everything Interndex stores about one student: their profile, every
 * application, and its status history.
 *
 * `supabase` is always the ordinary session-bound client, never an admin
 * client — this reads exactly what the student's own web session already
 * reads elsewhere, through the same row-level security policies. The
 * `user_id` filters below are a second, belt-and-suspenders predicate on top
 * of RLS rather than a substitute for it, matching every read in
 * `lib/applications/repository.ts`.
 */
export async function buildAccountExport(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<AccountExportResult> {
  const [profileResult, applicationsResult, historyResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("applications").select("*").eq("user_id", userId),
    supabase
      .from("application_status_history")
      .select("*")
      .eq("user_id", userId),
  ]);

  if (profileResult.error) {
    return { outcome: "error", message: profileResult.error.message };
  }
  if (applicationsResult.error) {
    return { outcome: "error", message: applicationsResult.error.message };
  }
  if (historyResult.error) {
    return { outcome: "error", message: historyResult.error.message };
  }

  return {
    outcome: "exported",
    data: {
      exported_at: new Date().toISOString(),
      account: { id: userId, email },
      profile: profileResult.data,
      applications: applicationsResult.data ?? [],
      application_status_history: historyResult.data ?? [],
    },
  };
}
