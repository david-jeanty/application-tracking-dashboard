# Launch readiness

A point-in-time audit for a portfolio/public-beta launch of Interndex,
covering cross-user isolation, web auth, MCP, browser capture, OAuth, email,
deployment, and a release-journey walkthrough. It distinguishes **VERIFIED**
(reproduced directly, in this environment, against this codebase) from
**MANUAL VERIFICATION REQUIRED** (cannot be proven from code alone — needs
Supabase Dashboard access, a real inbox, or a real deployment).

This audit found no code-level launch blockers. The application is already
built with the ownership boundary this review was asked to test: identity is
token-derived everywhere, RLS is the enforcing layer under every surface, and
no service-role bypass exists on any normal path. Findings below are Medium
and below, plus a set of manual production checks that cannot be verified
from a repository.

## Scope and method

Two accounts (`User A` / `User B`) were audited at the SQL/RLS level using the
repository's own pgTAP suite (`supabase/tests/001_foundation_rls.test.sql`),
read in full rather than only skimmed, plus a full reading of
`supabase/migrations/20260724000100_initial_schema.sql` and
`20260824000100_add_company_domain.sql`. Application code was read directly
for `lib/applications/repository.ts`, `lib/supabase/{server,bearer,proxy}.ts`,
`lib/auth/*`, `lib/routes.ts`, `lib/oauth/*`, `app/auth/callback/route.ts`,
`app/oauth/consent/page.tsx`, and `components/settings/connected-clients.tsx`.
MCP, browser capture, extension OAuth, email, and deployment/config were each
independently audited by a focused, read-only pass over their code, tests,
and docs. All commands below were actually executed in this session; no
result is asserted without having run it.

## Findings by severity

### Launch blocker

None found in code.

### High

None found in code. See "Manual verification required" — several items there
function as launch blockers if unverified in the live Supabase project, but
none is a defect in this repository.

### Medium

- **Extension config ships template placeholder values**
  (`extension/src/config.ts:19,22,31`, `extension/manifest.json:9`):
  `jobtrackOrigin: "https://jobtrack.example.com"`, `supabaseUrl:
  "https://your-project-ref.supabase.co"`, and `oauthClientId:
  "replace-with-the-extension-oauth-client-id"`. This is the intended pattern
  — the file's own docstring says "To point a local unpacked build at a
  development stack, edit the values below" — and `extension/tests/manifest.test.ts`
  already guards that `config.ts` and `manifest.json` cannot drift apart. It
  is not a code defect, but it is a required manual step: substitute the real
  production origin, Supabase project URL, and registered OAuth client id
  before packaging or distributing a build, and re-run
  `npm run extension:check` afterward as the check.
- **Extension refresh token stored unencrypted in `chrome.storage.local`**
  (`extension/src/tokens.ts`): a documented, explicit tradeoff for UX
  continuity, consistent with how most browser extensions keep long-lived
  credentials. Readable by anything with OS-level access to the browser
  profile directory. Not a code defect; a residual risk to carry forward
  (see below).

### Low

- Internal-only identifiers still say `JobTrack` (`registerJobTrackTools`,
  `JobTrackRepository`, `createSupabaseJobTrackRepository` in
  `lib/mcp/tools.ts` and `lib/mcp/repository.ts`; storage keys
  `"jobtrack.access"` / `"jobtrack.refresh"` in `extension/src/tokens.ts`).
  These are not user-facing (the MCP server advertises itself as
  `"interndex"` in `app/api/mcp/route.ts`) and carry no security effect.
  Renaming them is cosmetic; per the audit's own instructions, internal
  compatibility names are not renamed for aesthetics alone here.
- The extension's own "sign out" clears local storage only; it does not call
  Supabase's revoke endpoint. This is explicit, documented, intentional
  design (`extension/src/auth.ts`) — real server-side revocation exists and
  works, but lives in Interndex Settings, not in the extension. It is a
  UX/security-perception gap (a user could believe "sign out" fully
  disconnects the grant) worth a future UX pass, but extension UX polish is
  out of this audit's scope.
- `readBearerToken`'s regex accepts any non-whitespace credential, not only
  well-formed JWTs; rejected downstream by `supabase.auth.getUser()` either
  way, so this has no practical effect.
- `npm audit` reports 6 high-severity advisories, all in build-time
  dependencies (`postcss`, `nanoid`, `js-yaml`, `brace-expansion`, and `sharp`
  via a newer `next` patch release) — none reachable at runtime by user
  input. Dependency upgrades are an unrelated refactor and out of this
  audit's scope; tracked as a residual risk below.

### Observation

- RLS is comprehensive and independently layered: table grants
  (`revoke all` then narrow `grant`s), row policies scoped by
  `(select auth.uid()) = user_id`, and status history that is `select`-only
  to authenticated clients with explicit `... and false` deny policies on
  insert/update/delete as a second, redundant denial layer beyond the
  missing grants. Verified by direct reading of the migration and the
  existing pgTAP suite, which already exercises both positive and negative
  two-account cases (read, write, forge-`user_id`, cross-user history
  forgery/rewrite/delete) — see "Two-account isolation results" below.
- The application layer never uses a service-role key or JWT signing secret
  anywhere in `app/`, `components/`, or `lib/` (only in local operator
  scripts under `scripts/*.mjs`, never imported by client or server app
  code) — confirmed by repository-wide search.
- Open-redirect protections are real, not cosmetic: `lib/routes.ts`'s
  `safePostAuthPath`/`safeAuthCallbackPath` allowlist destinations by exact
  match or prefix against `protectedRoutes`, reject `//`-prefixed and
  backslash forms, and are applied on both the post-login redirect and the
  `/auth/callback` `next` parameter. Email redirect URLs
  (`lib/auth/actions.ts`) are built only from the server-side
  `NEXT_PUBLIC_SITE_URL` env var, never from request headers or client
  input.
- MCP dynamic client registration (`supabase/config.toml`'s
  `[auth.oauth_server] allow_dynamic_registration = true`) is the correct,
  expected design for an MCP connected-assistant flow (per the MCP OAuth
  2.1 + DCR model) — registration alone grants no access, and the consent
  screen (`app/oauth/consent/page.tsx`) shows the requesting client's name,
  the signed-in account, and the literal redirect destination before a user
  can approve, which is the standard mitigation for consent-phishing risk
  inherent to any DCR-based OAuth flow. This is an architectural property of
  the MCP OAuth model generally, not a defect in this codebase.
- `revokeGrantAction` (`lib/oauth/actions.ts`) re-authenticates the caller
  from the session and calls `supabase.auth.oauth.revokeGrant` scoped to
  that session — one user cannot revoke another's grant, and the Settings
  page renders live grants from Supabase on every request rather than a
  local cache.

## Two-account isolation results

**Database/RLS (VERIFIED by reading, not executed live — see below):** The
existing `supabase/tests/001_foundation_rls.test.sql` (21 assertions) already
covers, with two real `auth.users` rows and `request.jwt.claims` switched
between them: User A cannot read User B's profile; User A cannot create a
row with User B's `user_id` (RLS policy violation, `42501`); User B cannot
read User A's applications, status history, or profile; User B's UPDATE and
DELETE against User A's application match zero rows and change nothing;
authenticated clients (as either user) cannot INSERT, UPDATE, or DELETE
`application_status_history` rows at all (`42501`, denied by both a missing
grant and an explicit `... and false` policy). This suite could not be
executed in this session — see "Blocked" below — so this line item is
**VERIFIED by code/migration inspection, MANUAL VERIFICATION REQUIRED to
confirm by running `npm run test:db` against a real local Postgres.**

**Web (VERIFIED by code inspection):** Every list/get/update/archive/delete/
history function in `lib/applications/repository.ts` takes
`authenticatedUserId` and applies `.eq("user_id", authenticatedUserId)`
before any RLS check even runs; missing, foreign, and archived-state
mismatches all collapse to the same generic `not_found`, so a crafted
request naming another student's application id cannot distinguish "does
not exist" from "exists but is not yours." The protected layout
(`app/(app)/layout.tsx`) revalidates the session server-side on every
request rather than trusting the proxy alone.

**MCP (VERIFIED by code inspection, confirmed by the Explore agent's
independent read):** identity is derived only from `supabase.auth.getUser()`
on the bearer token (`lib/auth/bearer-identity.ts`), never from tool
arguments; no input schema in `lib/validation/mcp.ts` accepts a `user_id`;
`get_job`/`update_job` against another user's UUID return the same
`NOT_IN_TRACKER` message as a nonexistent id; error messages interpolate
only a Postgres error code, never `error.message` or a stack trace; and
`tests/unit/mcp-tool-registration.test.ts` has an explicit test asserting a
forged `user_id` in a `save_job` call is silently dropped.

**Browser capture (VERIFIED by code inspection):** the bearer-token path,
duplicate-URL lookup, and validation schema are the same
owner-scoped/token-derived path as MCP and web — `findApplicationByExactUrl`
filters by `authenticatedUserId`, so one user's capture cannot observe or
match another user's existing application.

**Not executed live in this session:** no two real Supabase user accounts
were exercised end-to-end through the running application (web UI, MCP
client, or extension) because no Supabase project credentials and no
working local Postgres were available in this environment (see "Blocked").
The conclusions above rest on direct reading of the enforcing SQL and the
call sites that reach it, not on an observed HTTP response.

## MCP OAuth vs. extension OAuth — separate conclusions

Both flows are thin clients of Supabase Auth's own OAuth 2.1 authorization
server; this application never mints, signs, or independently validates a
token.

**MCP / connected-assistant flow:** `app/authorize/route.ts` and
`app/token/route.ts` proxy PKCE/state/redirect-uri handling to Supabase
verbatim by design (`lib/oauth/upstream.ts`) — validated there, not
re-validated here. Consent (`decideConsentAction`) re-checks the session
server-side and only ever forwards a `redirect_url` Supabase itself
constructed. Revocation (`revokeGrantAction`) is session-scoped and real.
No logging of tokens, codes, or verifiers found in `lib/oauth/*`. No
concrete defect found.

**Extension flow:** PKCE is implemented client-side and correctly
(`extension/src/pkce.ts`): 32-byte verifier, S256 only, `plain` explicitly
rejected. State is 32 random bytes, checked before `code`/`error` are read
(`extension/src/auth.ts`), which is the correct order for CSRF resistance.
Redirect URI is Chrome-brokered (`chrome.identity.getRedirectURL()`), not
attacker-influenceable. Credentials are written only after full response
validation, so no partial/inconsistent credential state is reachable.
Refresh is bounded (one retry on 401, then a hard clear). No concrete defect
found; the one residual risk is the unencrypted-on-disk refresh token noted
above.

**The deferred scopes-vs-RLS question**, resolved by this audit: see
`docs/browser-capture.md` → "Trust and authentication boundaries" →
"Least-privilege review (launch hardening, completed)" for the full
threat model. Summary: an extension access token is an ordinary
per-user Supabase JWT: RLS grants it the same privileges as any other
session for that one user, not a "capture-only" subset, because the
`client_id` recorded in `app_metadata` is read but never enforced by any
route or policy today. Cross-user isolation is unaffected (RLS still
authorizes strictly by `auth.uid()`), and no path to service-role/elevated
access exists. **Classification: acceptable with residual risk for the
current unpacked/local-install distribution; not a launch blocker for this
web/MCP launch.** It must be resolved — either with client-id-aware
policies or an explicit, documented risk-acceptance decision — before any
public Chrome Web Store distribution, which remains unchanged, deferred,
and not part of this launch.

## Email findings

`signupAction` and `forgotPasswordAction` (`lib/auth/actions.ts`) build
`emailRedirectTo`/`redirectTo` only from the server-side
`NEXT_PUBLIC_SITE_URL` environment variable — never from request headers or
client-supplied input — so no open-redirect is reachable through either
call. `app/auth/callback/route.ts` allowlists its own `next` destination
through `safeAuthCallbackPath`. `forgotPasswordAction` returns an identical
generic message whether or not the email exists, avoiding application-layer
enumeration. `resetPasswordAction` requires an active session
(`supabase.auth.getUser()`) before it will call `updateUser`, so a bare
knowledge of an email address cannot reset a password.

None of this proves mail is actually delivered in production — that lives
entirely in Supabase project configuration, which this session had no
access to. See "Manual verification required."

## Deployment findings

- `NEXT_PUBLIC_SITE_URL` is the single source of truth for email redirects,
  the MCP resource identity (`getResourceOrigin`/`getMcpResourceUrl` in
  `lib/supabase/bearer.ts`, deliberately derived from config rather than a
  forwarding header), and the OAuth callback surface — no divergent
  hardcoded origin was found.
- Every env var read by app code is either `NEXT_PUBLIC_*` (intentionally
  public: Supabase URL, publishable key, site URL, an optional Logo.dev
  publishable token) or absent from client/server app code entirely.
  `SUPABASE_SERVICE_ROLE_KEY` exists only in `scripts/*.mjs` operator
  scripts, never imported by `app/`, `components/`, or `lib/`.
- No committed secrets: `.env.example` contains only placeholders, and no
  `.env`/`.env.local` is committed to the repository.
- `extension/src/config.ts` and `extension/manifest.json` still carry
  template placeholder values (see Medium finding above) — a required manual
  substitution before packaging a real build, not a code defect.
- `supabase/config.toml` is local-CLI-only configuration (`site_url =
  "http://localhost:3000"`, `enable_confirmations = false`, a 1-minute email
  rate limit) and does not describe the hosted project; every value in it
  must be independently confirmed against the actual Supabase Dashboard
  settings for production (see below).

## Tests and commands run

All commands below were executed in this session against a fresh checkout of
`origin/main`. Results are exactly as observed; nothing here is asserted
without having been run.

| Command | Result |
| --- | --- |
| `npm run lint` | **PASS** — 0 errors, 1 pre-existing warning (`extension/src/linkedin-frames.ts:189`, unused var, unrelated to this audit) |
| `npm run typecheck` | **PASS** — clean |
| `npm run test` (vitest) | **PASS** — 68 files, 1307 tests |
| `npm run build` | **PASS** — production build succeeds |
| `npm run extension:typecheck` | **PASS** |
| `npm run extension:test` | **PASS** — 11 files, 399 tests |
| `npm run extension:build` | **PASS** |
| `npm run test:e2e` (Playwright, chromium + mobile-chromium) | **PASS** on 64 credential-free specs (public homepage, demo, auth pages, appearance, responsive layout); **SKIPPED** on 8 specs in `tests/e2e/applications.spec.ts` and `tests/e2e/authenticated-shell.spec.ts` that require `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` (and, for the two-account cases, `E2E_USER_B_EMAIL`/`E2E_USER_B_PASSWORD`) — no such credentials exist in this environment, and the specs' own guard skips them rather than failing |
| `npm run test:db` (`supabase test db`, pgTAP) | **BLOCKED** — requires a local Postgres via `supabase start`, which requires a running Docker daemon; the sandbox's Docker daemon was not reachable (`dial unix /var/run/docker.sock: connect: no such file or directory`), and starting one was not possible in this environment. The RLS assertions this would run are documented as VERIFIED by direct code/migration reading above, not by execution. |

`npm audit` also ran (not one of the required commands, run as due diligence):
6 high-severity advisories, all build-time tooling, listed as a Low finding
and residual risk above.

**Non-security testability note:** the pre-installed Chromium build in this
sandbox did not match the version Playwright 1.61.1 expected
(`chromium_headless_shell-1228` was requested; `chromium-1194` was present),
so `playwright.config.ts` was given an optional
`launchOptions.executablePath` sourced from a new `PLAYWRIGHT_CHROMIUM_PATH`
env var (unset by default — a no-op everywhere this variable isn't set,
including CI). This is a testability fix only, mirroring the file's existing
`PLAYWRIGHT_PORT`/`PLAYWRIGHT_HOST`/`PLAYWRIGHT_SERVER_COMMAND` override
pattern; it carries no security implication and made it possible to
actually execute the 64 credential-free E2E specs above rather than report
them as blocked.

## Manual verification required

None of the following can be proven from this repository. Each is an exact,
actionable check against the live Supabase project and production
deployment.

1. **SMTP**: Supabase Dashboard → Auth → Settings → SMTP Settings — confirm a
   production SMTP provider is configured (not Supabase's shared/rate-limited
   default), with a correct sender address and verified SPF/DKIM for that
   domain.
2. **Email templates**: Auth → Templates — confirm "Confirm signup" and
   "Reset password" use `{{ .ConfirmationURL }}` and current Interndex
   branding/copy (dashboard templates are edited separately from this repo
   and were not inspected).
3. **Redirect URL allowlist**: Auth → URL Configuration → Redirect URLs —
   confirm the production `https://<production-site-url>/auth/callback`
   is present and matches `NEXT_PUBLIC_SITE_URL` exactly (scheme and host),
   and that stale/dev entries are removed.
4. **Site URL**: Auth → URL Configuration → Site URL — must match the
   production `NEXT_PUBLIC_SITE_URL` used at build/deploy time.
5. **Confirm-email is enabled for production.** `supabase/config.toml`'s
   `enable_confirmations = false` is local-dev-only; verify the hosted
   project has email confirmation enabled.
6. **Auth rate limits**: Auth → Rate Limits — confirm the email-send limit
   is sufficient for expected signup volume (shared-SMTP defaults are very
   low).
7. **Send one real signup and one real password-reset** to a real inbox
   from the deployed production URL, end to end, and confirm both links land
   on the correct production domain and complete.
8. **Run `npm run test:db`** against a real local Postgres (`supabase
   start`, which needs a working Docker daemon) to execute
   `supabase/tests/001_foundation_rls.test.sql` and the other four pgTAP
   suites under `supabase/tests/`, which this session could only verify by
   reading.
9. **Run the credentialed two-account E2E specs** in
   `tests/e2e/applications.spec.ts` and `tests/e2e/authenticated-shell.spec.ts`
   with `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`/`E2E_USER_B_EMAIL`/
   `E2E_USER_B_PASSWORD` set to disposable, non-production Supabase test
   accounts, to exercise real two-account isolation over HTTP rather than by
   code inspection alone.
10. **Extension production config**: before packaging or distributing a
    build, substitute real values for `extension/src/config.ts`'s
    `jobtrackOrigin`, `supabaseUrl`, and `oauthClientId` and the matching
    `host_permissions` in `extension/manifest.json`, then re-run `npm run
    extension:check`.
11. **Full release journey**: signed-out homepage/demo → account signup with
    a real inbox → confirm → sign in → create/edit an application, change
    its status, set a next action → walk Dashboard/Applications/Pipeline/
    Analytics → archive → restore → connect an MCP client and exercise
    `save_job`/`list_jobs`/`get_job`/`update_job` → load the extension and
    capture a real posting → disconnect it from Settings → request and
    complete a password reset. None of this was exercised end-to-end in
    this session (see "Blocked" above); it requires a deployed environment
    and real credentials.

## Residual risks

- Extension refresh tokens live unencrypted in `chrome.storage.local`
  (Medium finding above) — accepted tradeoff, not remediated here.
- The extension OAuth grant is not privilege-limited below "everything this
  one user's session can do" (the deferred least-privilege question,
  resolved-as-acceptable-with-residual-risk above) — acceptable for the
  current unpacked/local-install distribution; must be revisited before
  Chrome Web Store submission.
- `npm audit`'s 6 high-severity build-tooling advisories are unaddressed
  (out of this audit's scope; none is reachable by user input at runtime).
- OAuth dynamic client registration for the MCP flow inherits the standard
  DCR consent-phishing exposure common to all MCP OAuth 2.1 + DCR
  implementations (a malicious registered client can request consent under
  a self-chosen display name); the consent screen's display of the exact
  redirect destination and the per-user, revocable, RLS-bounded blast
  radius are the mitigations, consistent with the model MCP itself expects.

## Deferred / out-of-scope findings

Per the audit's explicit scope: status-transition warnings, MCP analytics,
category/provenance design, extension UX polish (including the "sign out
doesn't revoke server-side" gap noted above), extraction expansion/new
job-site adapters, homepage/dashboard/analytics redesign, new AI features,
auto-apply, monitoring, notifications, microservices/queues, and unrelated
refactors (including the `npm audit` dependency bumps and the cosmetic
`JobTrack` internal identifiers) were not investigated further or changed.

## Launch recommendation

**CONDITIONAL GO** — no known code-level launch blockers remain, but these
manual production checks must pass first: SMTP/email template/redirect-URL/
site-URL/confirm-email/rate-limit configuration in the live Supabase project
(items 1–6 above), one real end-to-end signup and password-reset test against
the production domain (item 7), execution of the pgTAP RLS suite against a
real Postgres (item 8), execution of the credentialed two-account E2E specs
already checked into this repository (item 9), and — only if the browser
extension ships as part of this launch — substitution of its real production
config values (item 10).
