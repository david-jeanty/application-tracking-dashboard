/**
 * Public configuration for the Interndex Capture extension.
 *
 * Everything here is public by definition: an unpacked extension ships its own
 * source, so no value that must stay secret can live in this package. A
 * Supabase project URL, an Interndex origin, and a public OAuth client id are
 * configuration, not credentials — the extension uses Authorization Code with
 * PKCE precisely so that no client secret is needed.
 *
 * `extension/manifest.json` must grant host access to exactly the origins named
 * here. `tests/manifest.test.ts` asserts that agreement so the two cannot
 * drift; change one and the test tells you to change the other.
 *
 * To point a local unpacked build at a development stack, edit the values below
 * and the matching `host_permissions` entries, then reload the extension.
 */
export const EXTENSION_CONFIG = {
  /** The Interndex deployment whose capture endpoint receives the record. */
  jobtrackOrigin: "https://application-tracking-dashboard-wfgh.vercel.app",

  /** The Supabase project that issues and refreshes access tokens. */
  supabaseUrl: "https://jbkrwbofrctithcjevxy.supabase.co",

  /**
   * The dedicated PUBLIC OAuth client registered for this extension.
   *
   * It is deliberately not the client an MCP assistant registers: the two are
   * different products with different consent copy, and a student must be able
   * to disconnect one without disconnecting the other.
   */
  oauthClientId: "461d1918-6343-447b-80f8-73f22e75b34d",
} as const;

/** Where the extension sends a confirmed capture. Never a Supabase table. */
export function captureEndpoint(): string {
  return `${EXTENSION_CONFIG.jobtrackOrigin.replace(/\/$/, "")}/api/browser-capture`;
}

/** The Interndex page for one saved application, built from a relative href. */
export function jobtrackUrl(path: string): string {
  return new URL(path, `${EXTENSION_CONFIG.jobtrackOrigin.replace(/\/$/, "")}/`)
    .toString();
}

/** Supabase's OAuth 2.1 authorization endpoint. */
export function authorizationEndpoint(): string {
  return `${EXTENSION_CONFIG.supabaseUrl.replace(/\/$/, "")}/auth/v1/oauth/authorize`;
}

/** Supabase's OAuth 2.1 token endpoint, used for exchange and refresh. */
export function tokenEndpoint(): string {
  return `${EXTENSION_CONFIG.supabaseUrl.replace(/\/$/, "")}/auth/v1/oauth/token`;
}

/** The two origins the extension is allowed to reach, in manifest form. */
export function requiredHostPermissions(): string[] {
  return [EXTENSION_CONFIG.jobtrackOrigin, EXTENSION_CONFIG.supabaseUrl].map(
    (value) => `${new URL(value).origin}/*`,
  );
}
