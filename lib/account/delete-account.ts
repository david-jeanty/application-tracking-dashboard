import "server-only";

import { z } from "zod";

export const deleteAccountRequestSchema = z.object({
  userId: z.uuid(),
  password: z.string().min(1, "Enter your password."),
});

export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export type SessionUser = { id: string; email: string | null };

/**
 * The three privileged calls this action makes, narrowed to exactly what it
 * needs rather than a whole Supabase client — the same shape
 * `runBrowserCapture` takes a narrow repository instead of one. That is what
 * lets the authorization logic below be tested with plain functions, with no
 * real project and no mocked client library standing in for one.
 */
export type DeleteAccountDependencies = {
  /** The caller's own identity, read from their session — never from the request body. */
  getSessionUser: () => Promise<SessionUser | null>;
  /** Re-proves the caller still holds the account's credential. */
  verifyPassword: (email: string, password: string) => Promise<boolean>;
  /** The one admin-API call: permanently deletes the account and cascades. */
  deleteUser: (userId: string) => Promise<{ error: { message: string } | null }>;
  /** Clears the now-dead session's cookies. */
  signOutSession: () => Promise<void>;
};

export type DeleteAccountResult =
  | { outcome: "unauthenticated" }
  | { outcome: "forbidden" }
  | { outcome: "invalid_password" }
  | { outcome: "deleted" }
  | { outcome: "error"; message: string };

/**
 * Permanently deletes the account the caller's own session belongs to.
 *
 * `input.userId` is the account the confirmation form says it means to
 * delete. It is checked against the session's own id and, on any mismatch,
 * the request is refused outright (`forbidden`) — but it is never itself the
 * value that gets deleted. The only account this function can ever delete is
 * whatever `getSessionUser()` reports, so a forged or stale `userId` in the
 * request body can only narrow what happens — to nothing — never widen it to
 * somebody else's account.
 *
 * The password re-check exists for the student, not for this boundary: it is
 * the "are you sure" a session cookie alone cannot express. Losing it would
 * not let a different account be deleted, only remove one layer of
 * confirmation before this one is.
 */
export async function deleteOwnAccount(
  deps: DeleteAccountDependencies,
  input: DeleteAccountRequest,
): Promise<DeleteAccountResult> {
  const user = await deps.getSessionUser();
  if (!user) return { outcome: "unauthenticated" };
  if (user.id !== input.userId) return { outcome: "forbidden" };
  if (!user.email) {
    return { outcome: "error", message: "Account has no email on file." };
  }

  const passwordValid = await deps.verifyPassword(user.email, input.password);
  if (!passwordValid) return { outcome: "invalid_password" };

  const { error } = await deps.deleteUser(user.id);
  if (error) return { outcome: "error", message: error.message };

  await deps.signOutSession();

  return { outcome: "deleted" };
}
