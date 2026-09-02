/**
 * Single source of truth for the Terms of Service and Privacy Policy's
 * "effective date," shared by the public pages that display it and the
 * signup flow that records which version a user accepted — the same
 * single-source pattern `lib/mcp/capabilities.ts` uses so a promise made in
 * one place can't drift from what another place asserts.
 *
 * Bump the relevant constant (and the page's own prose, if the change is
 * substantive) whenever a revision is material enough that existing users
 * should be asked to re-accept. A wording or formatting fix does not need a
 * bump.
 */
export const TERMS_VERSION = "2026-09-02";
export const PRIVACY_VERSION = "2026-09-02";

/** Renders a `YYYY-MM-DD` version string as the long-form date shown on the page. */
export function formatDocumentVersion(version: string): string {
  const [year, month, day] = version.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
