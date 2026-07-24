# Implementation log

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
