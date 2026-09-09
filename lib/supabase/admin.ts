import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnvironment } from "@/lib/env";

/**
 * The one privileged client Interndex creates: it authenticates with a
 * Supabase Auth admin key rather than a user's own access token, so it can
 * call `auth.admin.*` and bypasses row-level security entirely.
 *
 * Every legacy `service_role` key on this project has been revoked. The
 * replacement is a new-format secret key (`sb_secret_…`), read only from the
 * server-only `SUPABASE_SECRET_KEY` environment variable — never the
 * `NEXT_PUBLIC_*` values `lib/env.ts` validates, and never anything a client
 * bundle could contain. `scripts/*.mjs` already reads this same variable name
 * for the operator tooling that creates and deletes disposable test users;
 * this is the first runtime caller inside `app/`.
 *
 * Throws rather than falling back to anything weaker: a misconfigured
 * deployment must fail the one request that needed this client, not silently
 * run it without authorization.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not configured. Create a new-format secret key in the Supabase dashboard (Project Settings > API Keys) and add it as a server-only environment variable.",
    );
  }

  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnvironment();

  return createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
