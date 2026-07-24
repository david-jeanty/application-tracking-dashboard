# Testing

## Credential-free checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Unit tests cover environment validation, safe routes, auth schemas, and date-only
behavior. Public Playwright tests cover login/signup/recovery presentation,
unauthenticated route protection, and a mobile viewport.

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

The authenticated shell test is explicitly skipped when any required value is
missing. Do not use a production account or point destructive future E2E tests at
production.

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
