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

## Job description parser evaluation

The parser is measured against a fixture corpus that needs no database, no
browser, and no credentials. Ground truth lives in
`tests/fixtures/job-descriptions/corpus.ts`; the postings themselves are
synthetic, with invented employers and figures.

This corpus is a regression suite, not a real-world generalization benchmark.
The architecture limits, private real-posting benchmark protocol, and hybrid
prototype decision process are documented in
`docs/parser-architecture-evaluation.md`.

```bash
npm run test -- tests/unit/parser-evaluation.test.ts
WRITE_PARSER_REPORT=1 npm run test   # regenerates docs/parser-evaluation.md
```

Every field on every fixture lands in exactly one of five outcomes:

| Outcome | Meaning |
| --- | --- |
| correct | Stated in the posting and extracted correctly. |
| incorrect | Stated in the posting, but a different value came back. |
| missing | Stated in the posting, and nothing came back. |
| expected absence | Not stated, and the parser correctly stayed blank. |
| fabricated | Not stated, but the parser produced a value anyway. |

A field counts as blank when its confidence is `null`. `normalizedJobCategory`
and `workArrangement` fall back to `Other` and `Unknown` with null confidence, so
those placeholders score as blanks rather than as extracted values.

Fabrication is the worst class, because it is the only failure the user cannot
catch by proofreading the form against the posting. Fixtures are graded on the
same reasoning:

- **Fully correct** — every field is correct or a correct blank.
- **Usable with minor edits** — some fields are blank or wrong, but every wrong
  value stayed below the prefill threshold, so the user only ever adds
  information rather than having to notice and undo a silent mistake.
- **Unusable result** — at least one wrong or fabricated value was confident
  enough to populate the form.

Because High and Medium prefill and Low does not, confidence is scored against
that boundary: a wrong value held at Low is a safe hedge, while the same value at
Medium is overconfident. `tests/unit/parser-evaluation.test.ts` fails the build
on any fabricated value, any High-confidence wrong value, or any wrong value
reaching the form, and holds each field to a recall floor.

Fixture expectations are ground truth, not a snapshot. A failing gate is fixed in
the parser; an expectation changes only when the posting text justifies it.

Fixtures tagged `real-format:*` were added after manual testing against real
pasted postings exposed failures the self-authored corpus did not contain. They
reproduce the structural pattern that caused each failure — a structured pay
block, an inline location, metadata labels with no title, a cross-year term —
with invented employers and wording. No employer-specific rule was added for
any of them, and no complete real posting is reproduced.

A further gate asserts that the prefill summary and the form values agree on
every fixture: every field the summary reports as filled has a form value, and
every field it reports as unread has none. `tests/unit/application-form-values.test.tsx`
covers the same contract in the rendered form, including that realistic example
text stays a placeholder and is never submitted.

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
