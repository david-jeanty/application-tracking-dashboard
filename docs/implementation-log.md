# Implementation log

## 2026-08-22 — MCP `update_job`

### Scope

Added the `update_job` tool. `list_jobs` and `get_job` remain deferred, so the
tool requires an explicit `application_id`; resolving "the RBC job" is their
job, not this one. No UI, schema, migration, or authentication change.

### Architectural mismatch found and resolved

The existing update path is a full-record replace: `toApplicationUpdate` is
literally `toApplicationInsert`, which maps every absent optional to `null`,
and `applicationUpdateSchema` requires every core field plus
`expectedUpdatedAt`. Correct for a web form that posts the whole record back,
but passing a partial patch through it would erase every field Claude did not
mention.

Resolved with read-merge-write instead of a new partial-update repository
function: read the record under the authenticated identity, merge the supplied
keys onto `toApplicationFormValues(record)`, validate with the same
`applicationUpdateSchema`, then call the existing `updateApplication`. No
repository, schema, or SQL change was needed, and the read supplies a real
`updated_at`, so optimistic concurrency is genuinely preserved rather than
dropped. A conflict re-reads and retries once, then reports.

### Implemented

- `updateJobInputSchema` with `application_id` required and every other field
  optional, plus `UPDATE_FIELD_MAP` as the explicit writable allowlist —
  ownership, timestamp, archive, and classification columns are unreachable.
- `lib/mcp/update-job.ts` with injected repository calls, so ownership,
  conflict, not-found, and read-error paths are testable without a database.
- A structured result naming the changed fields, with the internal
  `Not specified` sentinel hidden and long values truncated so a 50,000
  character description is never echoed back.

### Verification

- `npm run lint`, `npm run typecheck`: passed.
- `npm run test`: passed, 123 tests across 10 files (61 new). Covers owner
  update, partial update, field clearing, invalid status, malformed dates,
  another user's application, absence of `user_id`, conflict retry, status
  history flagging, and the existing `save_job` suite unchanged.
- `npm run build`: passed.
- New registration tests instantiate a real `McpServer`, register both tools,
  and assert the generated JSON Schema — a schema that cannot convert now
  fails in CI rather than silently stopping a live connector from listing
  tools.

A test initially failed on `2026-08-32`: the wire schema checks date *shape*
only, and the shared creation schema is what rejects a day the calendar does
not have. The assertion was moved to the layer that actually owns the
guarantee, and an end-to-end case was added proving such a date is rejected
before any write.

### Not verified here

Database-level status-history behaviour is covered by the existing pgTAP suite,
which needs Docker and cannot run in this environment. The unit tests prove
this tool never writes history itself and correctly reports whether the status
moved; they do not re-prove the trigger. No live Claude connector run was
performed for `update_job`.

## 2026-08-22 — OAuth compatibility aliases for Claude

### Problem

The real Claude custom-connector flow reached `/api/mcp` correctly, but on
authorization Claude ignored the `authorization_servers` value in our RFC 9728
metadata and sent the browser to `https://<our-domain>/authorize?…`, which
returned our 404 page. The correct endpoint is
`${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/oauth/authorize`.

### Implemented

- `GET /authorize` — 302 to Supabase's authorize endpoint, query string copied
  verbatim. No parameter is parsed, rewritten, or invented.
- `POST /token` — server-side proxy to Supabase's token endpoint, forwarding
  `content-type`, `authorization`, and `accept` through an allowlist so cookies
  are never relayed. Returns the upstream status, body, and content type with
  `Cache-Control: no-store` and `Pragma: no-cache`. Nothing is logged, and the
  unreachable-upstream path returns an opaque 502 because the caught error can
  quote the request body.
- Both destinations are built from the **origin** of the configured
  `NEXT_PUBLIC_SUPABASE_URL`, so no request value can retarget them.

Authentication design, RLS, and the MCP tool surface are unchanged. No
service-role key or JWT secret was introduced.

### `/token` was added without being able to confirm it is needed

Whether Claude also synthesizes `/token` on the resource origin could not be
determined from this environment — it needs a live connector. It was added
anyway: it is small, it cannot weaken anything if unused, and the failure it
prevents would strand the flow at the final step and cost another deploy
cycle to diagnose.

### RFC 8414 metadata deliberately not served

Serving `/.well-known/oauth-authorization-server` at our origin was considered
and rejected for now. Every variant has a failure mode: advertising Supabase's
`issuer` contradicts the document's own location, while advertising our origin
as the issuer contradicts the `iss` claim in the tokens Supabase actually
mints. Since Claude is already known to ignore metadata here, introducing a
document it might partially honour could divert it away from the synthesized
paths these aliases now serve — turning a fixable failure into a new one on
the very retry meant to confirm the fix.

If the deployment logs show Claude requesting that path, adding it becomes
worthwhile and would *improve* the security posture, because Claude would then
talk to Supabase directly and our server would stop handling authorization
codes and tokens at all.

### Verification

- `npm run lint`, `npm run typecheck`: passed.
- `npm run test`: passed, 84 tests across 8 files (22 new).
- `npm run build`: passed; `/authorize` and `/token` both register.
- Live checks against a production server:
  - `/authorize` returned `302` with `Cache-Control: no-store` and a `location`
    whose query was byte-identical to the request, including the percent-encoded
    `redirect_uri` and the `+` in `scope`;
  - the auth proxy did not intercept `/authorize`, so it is not redirected to
    `/login`;
  - `/token` returned `502` against an unreachable upstream — proving it
    attempted the proxy rather than 404ing — with an opaque body containing
    neither the code nor the verifier, and no secret appeared in the server log.

## 2026-08-21 — MCP vertical slice: `save_job`

### Scope

Added the MCP endpoint, its OAuth 2.1 authentication, and one tool. The other
tools (`list_jobs`, `get_job`, `update_job`) are deliberately deferred until
this slice is proven end to end against a real Claude connector.

### Authorization decision

An earlier plan called for a `mcp_api_keys` table. It was dropped: Supabase's
OAuth 2.1 server issues ordinary Supabase JWTs (`sub`, `role: authenticated`),
so a token-scoped publishable-key client keeps `auth.uid()` correct and leaves
row-level security as the enforcing boundary on the MCP path. Neither a
service-role key nor a JWT signing secret is used. Rationale and the rejected
alternatives are recorded in [`mcp.md`](mcp.md).

### Implemented

- `[auth.oauth_server]` local configuration and a consent screen at
  `/oauth/consent`, with approve/deny as a Server Action so Next.js origin
  checks apply to the decision.
- RFC 9728 protected-resource metadata, served through a `next.config.ts`
  rewrite because a `.well-known` directory inside `app/` is not reliably
  routed. The resource identifier is derived from configuration rather than
  forwarding headers.
- `/api/mcp` with bearer-token verification and a `save_job` tool that calls
  the existing `createApplication` repository function unchanged.
- A permissive MCP wire schema that is re-validated by the existing
  `applicationCreationSchema`, so MCP and web writes share one contract.
- `safePostAuthPath` now preserves a query string on allowlisted paths, and the
  proxy carries it through login, so consent survives a sign-in round trip.

### Verification

- `npm run lint`, `npm run typecheck`: passed.
- `npm run test`: passed, 62 tests across 7 files (15 new).
- `npm run build`: passed; `/api/mcp`, `/api/oauth-protected-resource`, and
  `/oauth/consent` all register.
- Live HTTP checks against a production server:
  - unauthenticated `tools/list` returned `401` with
    `WWW-Authenticate: Bearer … resource_metadata="…"`;
  - a forged bearer token returned `401`, not `500` — verification fails
    closed even when the auth server is unreachable;
  - both RFC 9728 discovery forms returned the `/api/mcp` resource identifier
    and the Supabase authorization server.
- Playwright: 10 credential-free tests passed, including the unauthenticated
  redirect case covering the modified proxy; 8 credential-dependent cases
  skipped.

An initial run reported the resource identifier as the bare origin. That was a
stale server process holding the port, not a code fault; the corrected build
reports `/api/mcp`. The sandbox's Chromium (r1194) does not match the pinned
Playwright 1.61.1 (r1228), so the suite was run against the preinstalled
binary through a throwaway config that was not committed.

### Not verified here

The end-to-end flow through a real Claude connector has **not** been run: it
needs the OAuth server enabled in the hosted Supabase project and a public
HTTPS origin. `npm audit` reports 4 pre-existing high-severity advisories in
`next`'s transitive `postcss`/`sharp`; no new advisory comes from the MCP
dependencies.

## 2026-07-24 — Phase 1 foundation

### Scope

Established the technical and security foundation only. No application CRUD,
analytics, classification, pipeline behavior, archive actions, or notifications
were implemented.

### Implemented

- Pinned Next.js, React, Tailwind, Supabase, Zod, Vitest, and Playwright setup
- Strict TypeScript and flat ESLint configuration
- shadcn/ui-compatible component conventions and restrained light visual system
- Signup, login, logout, recovery request/completion, and PKCE callback
- Cookie session refresh, protected proxy, and protected server layout
- Responsive sidebar/mobile drawer and honest protected placeholders
- Initial migration with three tables, four enums, constraints, indexes, triggers,
  grants, and explicit RLS policies
- Initial and changed-status history automation
- Unit, public/conditional authenticated browser, and two-user pgTAP tests
- Environment, setup, migration, authentication, testing, and backlog docs

### Validation record

Hosted deployment and catalog inspection:

- linked project reference: `jbkrwbofrctithcjevxy`;
- `npx supabase db push --linked`: passed and applied
  `20260724000100_initial_schema.sql`;
- `npx supabase migration list --linked`: local and remote both report
  `20260724000100`, with no pending migration;
- `npx supabase db lint --linked --level error`: passed with no schema errors;
- the read-only hosted catalog query verified all four expected enum types and
  values, all three tables, all expected primary/foreign/check/unique
  constraints, all five application/profile/Auth triggers, RLS enabled on all
  three user-owned tables, all twelve intended policies, CRUD grants for
  authenticated users on `profiles` and `applications`, and SELECT-only access
  on `application_status_history`;
- hosted index inspection verified all fourteen expected primary, unique,
  partial, and lookup indexes;
- hosted table inspection verified the three deployed tables and estimated zero
  rows after disposable-data cleanup.

Hosted live behavior verification:

- `.env.local` URL and publishable-key variables were readable; their values
  were never emitted;
- two confirmed disposable users were created through the Auth admin API without
  sending email, and the Auth-user trigger created matching profiles;
- password login, logout/session clearing, and login after logout passed;
- a recovery link was generated without sending email, consumed with redirects
  disabled, and returned HTTP 303 to
  `/auth/callback?next=/reset-password` with a recovery credential;
- two-user isolation passed for profile reads, application
  reads/updates/deletes, and status-history reads;
- assigning an application to another user was rejected with PostgreSQL code
  `42501`;
- application creation produced exactly one initial history event with a null
  previous status and the selected new status;
- a non-status edit updated `updated_at` without creating history, while a real
  status transition created exactly one correctly populated event;
- direct browser-role history insert/update/delete attempts were each rejected
  with PostgreSQL code `42501`;
- a blank company was rejected by a deployed check constraint (`23514`) and a
  duplicate application ID was rejected by the deployed primary key (`23505`);
- normalized category, classification enum data, and optional plain-text salary
  round-tripped successfully;
- archiving retained the record with `archived_at` populated; permanent deletion
  subsequently removed the application and cascaded its history;
- both disposable Auth users were deleted in the verifier's cleanup path, which
  cascaded their profiles. Hosted table statistics subsequently reported zero
  estimated rows.

Authentication URL configuration was manually confirmed in the Supabase
dashboard for the local Site URL, `/auth/callback`, and `/reset-password`.
Public signup email delivery and `resetPasswordForEmail` were not executed
because email confirmation is enabled and no user-controlled disposable mailbox
was supplied. Generating a non-sent recovery link verified the configured
callback/reset destination without exposing a token or sending mail. The
authenticated OpenAPI root document returned HTTP 401, but direct authenticated
table operations and catalog SQL both succeeded, so this did not block database
verification.

Final quality-gate results:

- clean `npm ci`: passed, 486 packages installed from the lockfile;
- `npm run lint`: passed with no warnings;
- `npm run typecheck`: passed;
- `npm run test`: passed, 31 tests in 4 files;
- `npm run build`: passed with Next.js 16.2.11/Turbopack and 14 generated routes;
- `npm run test:e2e`: passed all 10 runnable desktop/mobile tests; the 2
  authenticated-shell cases were skipped because no isolated E2E mailbox
  credentials were supplied;
- browser visual QA: passed at 1280px and 390px, with no horizontal mobile
  overflow or console warnings;
- local migration/pgTAP execution: blocked because no local PostgreSQL/container
  runtime is installed.

An early lint run revealed ESLint 10 incompatibility with Next.js's bundled React
plugin; the dependency was corrected to the current compatible ESLint 9 release
rather than disabling a rule. An initial production build then caught a plain
state export in a `"use server"` module; the state/type moved to a neutral module
and the corrected build passed. The first mobile E2E locator matched hidden and
visible brand links; it was replaced with a stable mobile-brand contract.
A final callback review separated the protected post-login allowlist from the
single public `/reset-password` callback destination so recovery completes
without permitting an open redirect.
The final Playwright rerun also exposed a test-only focus assumption caused by
the Next.js development toolbar. The keyboard-order test now anchors focus on
the visible application brand link before tabbing to the email field, preserving
the accessibility assertion without depending on framework-injected controls.
An initial final-gate Vitest run hit `ENOSPC`; removing only the disposable
`.next` cache allowed all 31 tests to execute and pass. The sandboxed build could
not bind Turbopack's internal local port, and the identical build passed when
rerun with that local process permission.

### Known infrastructure limitation

This machine has no `docker`, `psql`, Colima, or Podman command. `npx supabase
test db` reached the CLI but returned `LegacyDbConnectError` because no local
PostgreSQL service exists. Migration replay and pgTAP execution therefore require
Docker installation/startup before they can be reported as passed.

## 2026-07-24 — Phase 2, Ticket 2.1

### Scope

Implemented authenticated application creation and the default own-applications
list only. Search, filters, detail, edit, delete, archive actions, status-change
controls, and Kanban behavior remain deferred.

### Implementation

- Added shared enum constants and a Zod creation schema for every Ticket 2.1
  field.
- Normalized blank optional values to `undefined`, preserved date-only strings,
  and mapped missing values to database nulls.
- Kept the existing non-null location/source schema by mapping their blank form
  values to the internal `Not specified` sentinel.
- Added a server action that verifies the authenticated user, inserts without a
  `user_id` property, reports validation/database errors, and revalidates the
  applications route.
- Added a server-only repository. The list uses the server-derived user ID,
  `archived_at IS NULL`, and RLS.
- Added a responsive create panel, accessible field errors and status labels,
  pending feedback, synchronous duplicate-submit locking, empty/loading/error
  states, desktop table, and mobile cards.
- Relied exclusively on the deployed database trigger for the initial history
  event.

### Verification

- Hosted database verifier: passed authenticated creation, exact date strings,
  one initial history event, two-user read isolation, forged-owner rejection
  (`42501`), archived-row exclusion, and disposable-user cleanup.
- Authenticated Playwright: passed empty state, missing-required-field errors,
  valid creation, duplicate rapid-click protection, immediate list refresh, and
  mobile card usability using a no-email disposable user.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 39 tests across 5 files.
- `npm run build`: passed with 14 generated routes.
- Full credential-free Playwright regression: 10 passed and 4 expected
  credential-dependent cases skipped.
- Final hosted cleanup query: zero profiles, applications, history records, and
  disposable Ticket 2.1 Auth users remained.

The browser test initially revealed a real rapid-click race that created two
records before React’s pending state rendered. A synchronous submit lock now
blocks the second event, while the pending button state remains visible for
normal submissions.

## 2026-07-24 — Phase 2, Ticket 2.2

### Scope

Implemented owner-only application detail and edit routes. Delete, archive
actions, search, filters, history timelines, automatic classification, and
other Phase 2 work remain deferred.

### Implementation

- Added protected `/applications/[id]` and `/applications/[id]/edit` routes.
  Both validate the UUID, derive the owner from the authenticated session, and
  use the same not-found response for missing and inaccessible records.
- Added a complete detail view with safe HTTP(S)-only external links,
  timezone-safe date-only rendering, plain-text descriptions/notes, timestamps,
  and archived state.
- Centralized conversion of the legacy `Not specified` location/source sentinel
  so it is blank in forms and absent in display UI, then restored only at the
  database boundary. A future migration should make these columns nullable.
- Extracted shared application fields so create and edit use the same field
  structure and validation contract.
- Added a Zod update schema that extends the creation schema and requires the
  record version. Ownership fields are ignored and never included in the
  database update payload.
- Added optimistic concurrency using `updated_at`: the update is conditional on
  the application ID, server-derived owner ID, and expected timestamp. If no row
  changes, an owner-scoped follow-up read returns either a clear stale-data
  conflict or the same safe unavailable result used for missing/non-owner data.
- Revalidated the list, detail, and edit routes after a successful update, then
  redirected to the detail view with a success confirmation.
- Kept the database status-transition trigger as the only status-history writer;
  application code does not insert history rows.
- Allowed owners to view and edit archived records, consistent with the
  approved architecture that treats archiving as retained data rather than
  deletion. No archive-state control was added.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 47 tests across 6 files.
- `npm run build`: passed with both new dynamic routes. The sandboxed attempt
  could not bind Turbopack's internal port; the identical build passed with
  local process permission.
- Credential-free `npm run test:e2e`: 10 public/protection tests passed and 8
  authenticated tests were correctly skipped.
- Hosted verification passed owner retrieval and conditional updates,
  non-owner empty reads/direct-update denial, missing/non-owner equivalence,
  forged-owner rejection (`42501`), archived owner access, and stale-write
  rejection without overwriting the newer row.
- Hosted history verification passed: initial creation produced one event,
  non-status and unchanged-status updates produced none, and one multi-field
  status update produced exactly one `Applied` to `Interview` event.
- Authenticated Ticket 2.2 Playwright passed all 4 targeted desktop/mobile
  journeys. It covered complete detail rendering, prefilled edit values,
  validation feedback, immediate non-status and status updates, a visible stale
  conflict with the newer value preserved, and identical safe not-found UI for
  missing/non-owner detail and edit routes.
- The serial full runnable Playwright regression passed all 18 desktop/mobile
  tests.
- Hosted verifier cleanup deleted both users (`2/2`), transactionally cascading
  their 2 profiles, 2 applications, and 3 verified history events. The browser
  runner removed all owned records, deleted both users (`2/2`), and confirmed
  zero residual applications, history rows, or Auth users.
- The service credential was entered through hidden terminal input, existed
  only in the disposable-user runner process, was stripped before Playwright
  and the app server were spawned, and was never printed or persisted.

Verification exposed and corrected only harness issues: an existing server was
initially reused on port 3000, `127.0.0.1` did not satisfy the repository's
localhost-only site URL rule, streamed not-found pages correctly rendered safe
UI with a 200 navigation response, and an auxiliary API client's global
sign-out invalidated the browser session. The final runner uses isolated
`localhost:32122`, semantic safe-not-found assertions, locally scoped helper
sign-outs, exact stale-version evidence, serialized tests, and preflight/final
disposable-user cleanup.
