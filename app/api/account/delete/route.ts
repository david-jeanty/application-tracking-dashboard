import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  deleteAccountRequestSchema,
  deleteOwnAccount,
  type DeleteAccountDependencies,
} from "@/lib/account/delete-account";
import { getPublicEnvironment } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STATUS_BY_OUTCOME: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  invalid_password: 401,
  error: 500,
  deleted: 200,
};

/**
 * A same-origin check for a route that a Server Action's automatic CSRF
 * protection does not cover. Requiring `content-type: application/json`
 * below already stops a plain cross-site form post (it cannot be sent
 * without a CORS preflight, which this route does not answer), and this
 * checks the one thing that requirement does not: a same-origin script
 * cannot be spoofed by a page carrying no `Origin` header, so this only
 * rejects a mismatched one and otherwise lets the request continue to the
 * session and password checks that decide everything else.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return origin === new URL(getPublicEnvironment().NEXT_PUBLIC_SITE_URL).origin;
  } catch {
    return false;
  }
}

/**
 * Permanently deletes the signed-in student's own account.
 *
 * This is the one place in the app that uses the new-format Supabase secret
 * key (`SUPABASE_SECRET_KEY`, server-only, never `NEXT_PUBLIC_*`) to call the
 * admin API. Everything about *who* gets deleted is decided by
 * `deleteOwnAccount`, from the session `createClient()` reads off this
 * request's cookies — never from `parsed.data.userId`, which exists only so
 * that value can be checked against the session and the request rejected
 * outright on any mismatch.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ status: "invalid" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const parsed = deleteAccountRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("Account deletion is not configured:", error);
    return NextResponse.json({ status: "not_configured" }, { status: 500 });
  }

  const sessionClient = await createClient();
  const environment = getPublicEnvironment();

  const dependencies: DeleteAccountDependencies = {
    getSessionUser: async () => {
      const {
        data: { user },
      } = await sessionClient.auth.getUser();
      return user ? { id: user.id, email: user.email ?? null } : null;
    },
    verifyPassword: async (email, password) => {
      // A throwaway client, never the request's own cookie-bound session
      // client: re-checking a credential must not refresh or otherwise touch
      // the session that is about to be torn down, on success or failure.
      const throwaway = createSupabaseClient(
        environment.NEXT_PUBLIC_SUPABASE_URL,
        environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
          },
        },
      );
      const { error } = await throwaway.auth.signInWithPassword({
        email,
        password,
      });
      return !error;
    },
    deleteUser: (userId) => admin.auth.admin.deleteUser(userId),
    signOutSession: async () => {
      await sessionClient.auth.signOut();
    },
  };

  const result = await deleteOwnAccount(dependencies, parsed.data);

  return NextResponse.json(
    { status: result.outcome },
    { status: STATUS_BY_OUTCOME[result.outcome] },
  );
}
