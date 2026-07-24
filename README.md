# JobTrack

JobTrack is a student internship and co-op application tracker. The repository is
currently at **Phase 2, Ticket 2.1: create and list applications**.

## What works now

- Email/password signup, login, logout, recovery request, and reset completion
  using Supabase Auth
- Cookie-based server-rendered sessions and protected route redirects
- Responsive desktop sidebar and mobile navigation drawer
- Accessible public auth forms with validation, pending, success, and error states
- Authenticated application creation with shared server-side validation
- Responsive own-application list that excludes archived records
- Versioned PostgreSQL schema for profiles, applications, and status history
- Row-level security policies for every user-owned table and operation
- Database-owned initial/transition history events
- Date-only utilities that avoid UTC calendar shifts
- Unit, Playwright, and pgTAP database-test configuration

## What is only scaffolded

`/pipeline`, `/analytics`, `/archive`, and `/settings` remain protected, polished
placeholders. They show no mock records and expose no controls that pretend to
save data.

## Deliberately deferred

- Application detail/edit/delete and archive workflows: later Phase 2 tickets
- Search, filters, status-change controls, and expanded workflows: later Phase 2
- Dashboard metrics and charts: Phase 3
- Kanban pipeline: Phase 4
- Deterministic title classification: Phase 5
- Production-readiness review and deployment: Phase 6

See [PROJECT_SPEC.md](PROJECT_SPEC.md) and
[docs/architecture-plan.md](docs/architecture-plan.md) for the approved scope and
architecture.

## Architecture

Next.js App Router renders pages and handles validated server actions. Supabase
provides authentication and PostgreSQL. RLS is the final authorization boundary:
frontend filtering is never treated as security. Pure TypeScript modules hold
date, route, environment, and validation logic.

The project uses:

- Next.js 16, React 19, strict TypeScript
- Tailwind CSS 4 and editable shadcn/ui-compatible components
- `@supabase/ssr` and `@supabase/supabase-js`
- Zod
- Vitest, Testing Library, Playwright, and Supabase pgTAP tests

The Supabase SSR package is currently documented by Supabase as beta. It is their
recommended cookie-based Next.js integration, but upgrades should review its
release notes carefully.

## Prerequisites

- Node.js 22 or newer (the local development machine uses Node 24)
- npm 11 or newer
- A Supabase project for real authentication
- Docker Desktop or another Docker-compatible runtime for the local Supabase stack

## Local setup

1. Install the pinned dependency graph:

   ```bash
   npm ci
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in the project URL and publishable key from Supabase Dashboard's
   **Connect** dialog. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

4. In Supabase Auth URL configuration, use
   `http://localhost:3000/auth/callback` as an allowed redirect URL.

5. Apply the migration to a linked development project:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   ```

6. Start the application:

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

Never run destructive reset commands against production. Never add a service-role
key to this application.

## Local Supabase

The local stack is the reproducible way to validate migrations and RLS:

```bash
npm run db:start
npm run db:reset
npm run test:db
```

`db:reset` destroys and recreates only the selected local database by default.
Confirm the target before adding any `--linked` flag. The local stack requires a
running Docker-compatible runtime.

Run `npx supabase status` after startup and place its API URL and publishable/anon
key in `.env.local`. Local auth confirmation is disabled in `supabase/config.toml`
for deterministic development; production confirmation settings are configured
in the Supabase Dashboard.

See [docs/database.md](docs/database.md) for schema and migration details.

## Environment variables

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Project Data API/Auth URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Public project key; RLS still applies |
| `NEXT_PUBLIC_SITE_URL` | Browser-safe | Trusted origin for recovery callback links |
| `E2E_USER_EMAIL` | Test runner only | Optional isolated test account |
| `E2E_USER_PASSWORD` | Test runner only | Optional isolated test password |

The application validates its public configuration before creating a Supabase
client and provides a clear setup error. Do not commit `.env.local`.

## Commands

```bash
npm run dev        # local Next.js development
npm run lint       # ESLint
npm run typecheck  # strict TypeScript
npm run test       # credential-free unit tests
npm run test:e2e   # Playwright public tests; auth test is conditional
npm run test:db    # pgTAP migration/RLS tests; requires local Supabase
npm run build      # production Next.js build
npm run check      # lint, types, unit tests, and build
```

Read [docs/testing.md](docs/testing.md) before running credentialed or database
tests.

## Authentication behavior

- Anonymous visits to protected routes redirect to `/login`.
- Successful login returns only to an allowlisted protected internal path.
- Signup stores the submitted full name as auth metadata; a database trigger
  creates the matching profile.
- Recovery requests return the same success message whether an account exists,
  reducing account enumeration.
- Recovery callbacks exchange the one-time code and open `/reset-password`.
- Server actions derive identity from the authenticated Supabase session.

See [docs/authentication.md](docs/authentication.md).

## Security notes

- RLS is enabled on profiles, applications, and status history.
- Application ownership defaults to `auth.uid()` and cannot be reassigned to
  another user through an authenticated request.
- The status-history composite foreign key enforces the same application owner.
- Browser clients can read only their own history and have no mutation privileges
  on history.
- Security-definer trigger functions use a fixed empty `search_path`.
- Notes are plain text; no raw HTML rendering is used.

Security behavior must be retested after every policy or trigger change.

## Dates

Deadline, applied, and next-action dates are PostgreSQL `date` values represented
as `YYYY-MM-DD` strings. They are not parsed as UTC instants. Creation, update,
archive, and status-change values are `timestamptz`. Date tests cover invalid
dates, month/year boundaries, timezone midnight, and daylight-saving transitions.

## Deployment direction

The intended deployment is Vercel plus a production Supabase project. Phase 6
will add and verify deployment configuration. Before any production deployment:

- apply and inspect migrations in staging;
- configure exact site/recovery URLs;
- rerun two-user RLS tests;
- enable the intended email-confirmation policy;
- complete accessibility and responsive smoke tests;
- store environment values in Vercel, never Git.

## Known Phase 1 limitations

- A configured Supabase project is required for real auth.
- Docker is required to execute local migration and pgTAP tests.
- Authenticated Playwright coverage requires an isolated account through the
  optional E2E variables.
- The responsive app shell cannot be reached without authentication by design.
- Settings editing and every application-data workflow are deferred.
- `@supabase/ssr` is beta and may require careful upgrade changes.

## Further documentation

- [Architecture plan](docs/architecture-plan.md)
- [Database and RLS](docs/database.md)
- [Authentication](docs/authentication.md)
- [Testing](docs/testing.md)
- [Implementation log](docs/implementation-log.md)
- [Backlog](docs/backlog.md)
