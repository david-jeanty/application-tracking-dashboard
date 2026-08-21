import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnvironment } from "@/lib/env";

/**
 * A Supabase client that acts as the holder of a Supabase-issued access token.
 *
 * This is the MCP equivalent of `lib/supabase/server.ts`, which reads the
 * browser session from cookies. An MCP request has no cookies: it carries an
 * OAuth 2.1 access token issued by Supabase Auth for one of our own users.
 *
 * That token is an ordinary Supabase JWT (`sub` = user id, `role` =
 * `authenticated`), so every query made through this client runs under that
 * user's identity. `auth.uid()` resolves correctly and the existing row-level
 * security policies remain the enforcing authorization boundary — exactly as
 * they are for the web application. No service-role key and no JWT signing
 * secret is involved.
 *
 * Sessions are never persisted or refreshed here: the client is created per
 * request and discarded with it.
 */
export function createBearerClient(accessToken: string) {
  const environment = getPublicEnvironment();

  return createSupabaseClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/** The issuer URL of our Supabase project's OAuth 2.1 authorization server. */
export function getAuthorizationServerUrl(): string {
  return `${getPublicEnvironment().NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
}

/** The public origin MCP clients reach this deployment on. */
export function getResourceOrigin(): string {
  return getPublicEnvironment().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

/**
 * The RFC 9728 protected resource identifier: the MCP endpoint itself, not the
 * site origin. Derived from configuration rather than the incoming request so
 * a spoofed forwarding header cannot change the advertised identity.
 */
export function getMcpResourceUrl(): string {
  return `${getResourceOrigin()}/api/mcp`;
}
