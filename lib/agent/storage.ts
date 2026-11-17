/**
 * Removing the owner's stored resume files when the account is deleted.
 *
 * Database rows cascade when an account is deleted; Storage objects do not.
 * The account delete flow calls this first, so built PDFs and HTML never
 * outlive the account (BUILD-LOG 3.6).
 *
 * Only the OWNER_USER_ID account can have files here, so for every other user
 * this returns at once without a storage call: account deletion for students
 * behaves exactly as before.
 */

import { isAgentOwner } from "@/lib/agent/owner";

export const RESUME_FILES_BUCKET = "resumes";

/** The two calls this needs from a Supabase storage bucket client. */
export type ResumeFileStorage = {
  list: (
    folder: string,
    options?: { limit?: number },
  ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
};

export async function removeAgentFiles(
  storage: ResumeFileStorage,
  userId: string,
  environment: Record<string, string | undefined> = process.env,
): Promise<{ error: { message: string } | null }> {
  if (!isAgentOwner(userId, environment)) return { error: null };

  for (;;) {
    const listed = await storage.list(userId, { limit: 1000 });
    if (listed.error) return { error: { message: "Could not list stored resumes." } };
    const paths = (listed.data ?? []).map((file) => `${userId}/${file.name}`);
    if (!paths.length) return { error: null };
    const removed = await storage.remove(paths);
    if (removed.error) return { error: { message: "Could not remove stored resumes." } };
    if (paths.length < 1000) return { error: null };
  }
}
