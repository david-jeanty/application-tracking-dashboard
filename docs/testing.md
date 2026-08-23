# Testing

## Credential-free checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Unit tests cover environment validation, safe routes, auth/application schemas,
optional application normalization, enum validation, ownership-free insert
mapping, and date-only behavior. Public Playwright tests cover
login/signup/recovery presentation, unauthenticated route protection, and a
mobile viewport.

When Supabase variables are absent, the application deliberately keeps public
auth pages available and redirects protected routes to login. Auth actions return
a clear configuration message.

## Local database tests

Prerequisites:

1. Docker Desktop or another Docker-compatible runtime is running.
2. Project dependencies are installed.

Then run:

```bash
npm run db:start
npm run db:reset
npm run test:db
```

The pgTAP suite uses two identities in a transaction and checks RLS, ownership,
history automation, and immutable history. A missing Docker runtime means these
tests are blocked, not passed.

## Authenticated browser test

Use an isolated local or development Supabase project. Add to `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100
E2E_USER_EMAIL=disposable-test-user@example.com
E2E_USER_PASSWORD=replace-with-test-password
```

Ensure the account already exists and is confirmed, then run:

```bash
npm run test:e2e -- --project=chromium
```

The authenticated shell and Ticket 2.1/2.2 application tests are explicitly skipped
when any required value is missing. The application test deletes only records
whose company matches the Ticket E2E test prefix. Use a dedicated account; do
not use a production account.

## Hosted Ticket 2.1 verification

The hosted verifier creates confirmed disposable users without sending email.
It reads the cleanup credential only from an ephemeral
`SUPABASE_SERVICE_ROLE_KEY` process environment variable. Enter or inject that
value through a trusted terminal/secret manager; never add it to `.env.local`,
another file, shell history, or source control:

```bash
node --env-file=.env.local scripts/verify-hosted-ticket-2-1.mjs
```

The verifier checks authenticated creation, server-compatible date strings,
initial history, two-user isolation, forged ownership rejection, active-list
archive filtering, and cleanup.

The authenticated browser runner uses the same ephemeral environment variable
to create one no-email disposable account, passes only that user’s temporary
credentials to Playwright in memory, and deletes the account afterward:

```bash
node --env-file=.env.local scripts/run-hosted-ticket-2-1-e2e.mjs
```

## Hosted Ticket 2.2 verification

Ticket 2.2 uses the same ephemeral credential rule. The database verifier
creates two disposable confirmed users, exercises owner/non-owner retrieval and
updates, verifies non-status/status/unchanged-status history behavior, checks a
forged owner and stale version, verifies retained archived data, and deletes the
users and their cascading records:

```bash
node --env-file=.env.local scripts/verify-hosted-ticket-2-2.mjs
```

The authenticated browser runner creates two disposable confirmed users in
memory, runs the targeted Ticket 2.2 journeys and then the full desktop/mobile
regression serially, and removes all owned records and users afterward:

```bash
node --env-file=.env.local scripts/run-hosted-ticket-2-2-e2e.mjs
```

Neither script reads the service credential from source, a fixture, or
`.env.local`; `SUPABASE_SERVICE_ROLE_KEY` must be injected into the process
environment by a trusted terminal or secret manager. The runner removes that
variable before spawning Playwright or the application server.

## Manual accessibility/responsive check

1. Navigate every auth form using only Tab and Shift+Tab.
2. Submit invalid values and confirm the error is announced and linked to its
   field.
3. At 360px width, confirm fields and buttons remain readable without horizontal
   scrolling.
4. Authenticated, test the desktop sidebar at 1280px and mobile drawer at 390px.
5. Open the drawer, press Escape, and confirm it closes.
6. Use the skip link and verify focus reaches main content.
7. Confirm the active navigation link exposes `aria-current="page"`.

Automated tests reduce regressions but do not replace this keyboard and visual
review.

## Hosted MCP verification

```bash
node --env-file=.env.local scripts/verify-hosted-mcp.mjs
```

Creates two disposable users, drives the deployed `/api/mcp` over HTTP with
real access tokens, and asserts protocol, all four tools, database agreement,
and two-user isolation before deleting both users. Reads
`SUPABASE_SERVICE_ROLE_KEY` only from the process environment, and prints no
token or key.

OAuth grant revocation is not covered here: these tokens come from a password
sign-in rather than the authorization-code flow an MCP client uses, so revoking
a client grant would not be expected to affect them. See `docs/mcp.md` for the
manual acceptance test that does cover it.
