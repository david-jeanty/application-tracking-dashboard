import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountExportData = {
  exported_at: string;
  account: { id: string; email: string | null };
  profile: Record<string, unknown> | null;
  applications: Record<string, unknown>[];
  application_status_history: Record<string, unknown>[];
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
