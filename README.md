# JobTrack

**Persistent career memory that your AI assistant can safely operate.**

JobTrack is an AI-native internship and co-op application tracker for students.
It is the structured, user-owned system of record that a student's AI assistant
reads and writes on their behalf, through the Model Context Protocol (MCP),
under the student's own authenticated identity.

## The problem this solves

The hard part of a job search is no longer understanding a posting. Students
already paste job descriptions into Claude and get a clear read on the role,
the requirements, and whether it is worth applying to.

The friction is what happens next. Every traditional tracker — a spreadsheet, a
Notion board, a dashboard with a form — asks the student to re-enter, by hand,
information their assistant already has in front of it: company, title,
location, work term, deadline, status. So the tracker goes stale, and a
half-remembered job search lives across a browser history and a chat log.

JobTrack removes the re-entry step. The assistant that just read the posting is
the same one that records it, finds it again weeks later, and moves it to
Applied — because JobTrack exposes its own data through MCP tools that operate
strictly as the signed-in student.

## What this looks like in practice

These conversations work today, in production, against a live Claude connector:

| The student says | What happens |
|---|---|
| "Save this job to JobTrack." | `save_job` stores the posting, verbatim description included |
| "What jobs do I currently have at RBC?" | `list_jobs` returns their RBC applications as short records |
| "Show me the full details for the RBC Business Analyst job." | `list_jobs` resolves the name to an id, then `get_job` returns the full record |
| "I applied to the RBC job today." | `update_job` moves the status to Applied and records the date |
| "Set my next action to follow up with the recruiter next Friday." | `update_job` sets the next action and its due date |

The student never sees, types, or is asked for an identifier. Claude lists the
candidate applications, reasons over them, and picks the right one — which is
exactly the division of labour this product is built around.

## Product principle

> **AI does the reasoning; JobTrack stores the truth.**

JobTrack deliberately operates **no LLM backend of its own**. There is no
job-description parser, no title classifier, no resume or cover-letter
generator, and no in-app chatbot. A hand-built classifier was designed, then
dropped permanently rather than deferred: Claude already does that reasoning
conversationally, so building a second, worse copy of it inside the app would
be duplicated effort with a maintenance bill.

What JobTrack owns instead is everything an assistant cannot safely be trusted
to hold in a conversation:

- **Persistence** — durable, structured records that outlive any chat session
- **Validation** — one schema enforced identically for the web form and MCP
- **Workflow** — statuses, deadlines, next actions, and immutable status history
- **Authentication** — Supabase OAuth 2.1, no bespoke API keys
- **Authorization** — row-level security as the final boundary, not a filter

## The MCP surface

V1 ships four tools at `/api/mcp`. Every one operates only on the caller's own
rows, through the same repository layer the website uses.

| Tool | Kind | Purpose |
|---|---|---|
| `save_job` | write | Save a posting, with the full description stored verbatim |
| `list_jobs` | read | List the student's applications, filtered and capped |
| `get_job` | read | Read one application in full, by id |
| `update_job` | write | Change any subset of fields on one application |

`list_jobs` accepts optional `status`, `company`, `work_term`, `archive_state`,
and `limit` filters. It returns short records — id, company, title, status,
work term, location, deadline, applied date, archived — and never job
descriptions or notes, which are absent from the query's projection rather than
stripped afterwards. The default page is 25 records, the ceiling is 50, and a
`has_more` flag tells Claude when to narrow rather than guess.

Filters are literal, not fuzzy. `company: "RBC"` matches stored text containing
`RBC`; it does not match "Royal Bank of Canada" by meaning. Interpreting what
the student meant is Claude's job, over the candidates the tool returns.

`update_job` takes only the fields that changed; anything omitted keeps its
stored value. `delete_job` is deliberately not planned — archiving suits a job
search better than destruction, and an assistant does not need a destructive
tool.

See [docs/mcp.md](docs/mcp.md) for the full argument reference and request flow.

## Architecture

```text
Student → Claude → MCP → Supabase OAuth → JobTrack repository → PostgreSQL/RLS
```

Every arrow narrows what is possible. Claude reaches a single MCP endpoint; the
endpoint accepts only a Supabase-issued OAuth 2.1 access token; the token binds
every call to one user id; the repository applies that id to each query; and the
database enforces row-level security underneath regardless of what the layers
above it asked for.

Next.js App Router renders the website and handles validated server actions.
Supabase provides authentication and PostgreSQL. Pure TypeScript modules hold
date, route, environment, and validation logic.

The project uses:

- Next.js 16, React 19, strict TypeScript
- Tailwind CSS 4 and editable shadcn/ui-compatible components
- `@supabase/ssr` and `@supabase/supabase-js`
- Zod at every runtime boundary
- Vitest, Testing Library, Playwright, and Supabase pgTAP tests

The Supabase SSR package is currently documented by Supabase as beta. It is
their recommended cookie-based Next.js integration, but upgrades should review
its release notes carefully.

## Security model

Giving an AI assistant write access to your own records is only reasonable if
the assistant cannot exceed you. That is the property this design targets.

- **The OAuth token is the sole source of user identity.** Supabase Auth issues
  it, verifies it, and resolves its subject; nothing else establishes who is
  calling.
- **No MCP tool accepts a `user_id`.** The argument is absent from all four
  advertised schemas, and a test asserts it. A caller cannot request to act as
  somebody else, because there is no field in which to ask.
- **Row-level security is the final authorization boundary.** The token is an
  ordinary Supabase JWT, so every MCP query runs as that user and the same
  policies that protect the website protect the connector.
- **No service-role key exists in this application.** Neither does a JWT signing
  secret or a bespoke API-key table — there is no credential here that could
  bypass RLS if it leaked.
- **Reads and writes are owner-scoped before RLS ever sees them.** The user id
  is applied to each query in the repository layer, so ownership is enforced
  twice, independently.
- **Another student's application is indistinguishable from one that does not
  exist.** `get_job` and `update_job` return the identical message for both, and
  `list_jobs` returns an empty list — no existence, company, or title leaks.
- **`update_job` uses optimistic concurrency.** The write is conditional on the
  record's `updated_at`, so an edit made in a browser tab is never silently
  overwritten by an assistant working from a stale read. One conflict retries
  against the newer state; a second is reported rather than forced.

Underneath the MCP layer, the database holds the same line:

- Application ownership defaults to `auth.uid()` and cannot be reassigned to
  another user through an authenticated request.
- Status history is written only by database triggers, so no client — browser or
  assistant — can forge or rewrite the audit trail, and its composite foreign
  key enforces the same owner as the application it belongs to.
- Security-definer trigger functions run with a fixed empty `search_path`.
- Job descriptions and notes arrive as untrusted text and stay that way. They
  are stored as parameters, rendered as plain text with no raw HTML, and never
  select a table, a user, or a tool.

See [docs/mcp.md](docs/mcp.md) and [docs/database.md](docs/database.md).
Security behavior must be retested after every policy or trigger change.

## The website

The conversational surface does not replace the visual one. Some things are
better seen than described, and the web application remains the student's
workspace for them:

- the full application list, and the detail view for one application
- creating and editing applications directly, with the same validation
- deadlines and next actions, read at a glance rather than asked about
- the pipeline board, dashboard metrics, and analytics
- archived applications and status history over time

Claude and the website read and write the same rows, under the same policies.
Neither is a second-class client.

## Status today

**Working in production:**

- Email/password signup, login, logout, recovery request, and reset completion
- Cookie-based server-rendered sessions and protected route redirects
- Responsive desktop sidebar and mobile navigation drawer
- Application creation, own-application list, detail view, and edit form with
  optimistic-concurrency conflict handling
- The MCP endpoint at `/api/mcp` with all four tools, authenticated by
  Supabase-issued OAuth 2.1 access tokens
- The OAuth consent screen at `/oauth/consent` and RFC 9728 discovery metadata
- Versioned PostgreSQL schema with RLS on every user-owned table and operation
- Database-owned initial and transition status-history events
- Date-only handling that avoids UTC calendar shifts
- Unit, Playwright, and pgTAP test suites

**Scaffolded, not yet built:** `/pipeline`, `/analytics`, `/archive`, and
`/settings` are protected, polished placeholders. They show no mock records and
expose no controls that pretend to save data.

## Roadmap

In current priority order:

1. **Two-account MCP/OAuth isolation testing** — prove, with two real accounts
   against the live connector, that neither can observe or touch the other's
   applications through any tool
2. **Production email/SMTP setup** — real confirmation and recovery delivery
3. **Infrastructure cleanup** — retire duplicate deployment projects and settle
   on one production target
4. **Broader `save_job` stress testing** — messy, long, and unusual postings
5. **Search and filtering** in the web application
6. **Dashboard metrics** — shared definitions, current-state and reached counts
7. **Pipeline** — persistent status columns with a keyboard alternative
8. **Archive** — archive and restore workflows, distinct from deletion
9. **Analytics** — accessible charts over real authenticated data

See [PROJECT_SPEC.md](PROJECT_SPEC.md) for approved scope and
[docs/backlog.md](docs/backlog.md) for ideas not yet accepted into it.

## Connecting Claude

The MCP endpoint is `https://<your-domain>/api/mcp`. Claude discovers Supabase
as its authorization server, the student approves access on the consent screen,
and Claude then acts as that user. No API key is issued, and no service-role key
exists in this application.

Claude cannot reach `localhost`, so a remote connector needs a deployment or a
tunnel. See [docs/mcp.md](docs/mcp.md) for setup and verification steps.

## Prerequisites

- Node.js 22 or newer (the local development machine uses Node 24)
- npm 11 or newer
- A Supabase project for real authentication
- Docker Desktop or another Docker-compatible runtime for the local Supabase
  stack

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

Never run destructive reset commands against production. Never add a
service-role key to this application.

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

Run `npx supabase status` after startup and place its API URL and
publishable/anon key in `.env.local`. Local auth confirmation is disabled in
`supabase/config.toml` for deterministic development; production confirmation
settings are configured in the Supabase Dashboard.

See [docs/database.md](docs/database.md) for schema and migration details.

## Environment variables

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Project Data API/Auth URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Public project key; RLS still applies |
| `NEXT_PUBLIC_SITE_URL` | Browser-safe | Trusted origin for recovery and OAuth discovery |
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

The MCP tools are covered by unit suites that register all four tools on a real
`McpServer` and call them over an in-memory transport, so schema conversion,
argument validation, and ownership isolation are tested against the same
registration `/api/mcp` serves.

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

## Dates

Deadline, applied, and next-action dates are PostgreSQL `date` values
represented as `YYYY-MM-DD` strings. They are not parsed as UTC instants.
Creation, update, archive, and status-change values are `timestamptz`. Date
tests cover invalid dates, month/year boundaries, timezone midnight, and
daylight-saving transitions.

## Deployment

The application is deployed on Vercel against a production Supabase project.
Because a remote MCP connector needs a public HTTPS origin, the deployment is
also what makes Claude able to reach the tracker at all.

Whenever migrations or auth configuration change:

- apply and inspect migrations in staging first;
- configure exact site, recovery, and OAuth redirect URLs;
- rerun two-user RLS tests;
- confirm the intended email-confirmation policy;
- complete accessibility and responsive smoke tests;
- store environment values in Vercel, never in Git.

## Known limitations

- A configured Supabase project is required for real authentication.
- Production email delivery is not yet configured; see roadmap item 2.
- Docker is required to execute local migration and pgTAP tests.
- Authenticated Playwright coverage requires an isolated account supplied
  through the optional E2E variables.
- MCP filter and limit behavior is covered by unit tests against a stand-in
  store; hosted verification against PostgreSQL is still outstanding.
- Settings editing, search, archive, and analytics workflows are not built yet.
- `@supabase/ssr` is beta and may require careful upgrade changes.

## Further documentation

- [MCP integration](docs/mcp.md)
- [Architecture plan](docs/architecture-plan.md)
- [Database and RLS](docs/database.md)
- [Authentication](docs/authentication.md)
- [Testing](docs/testing.md)
- [Implementation log](docs/implementation-log.md)
- [Backlog](docs/backlog.md)
