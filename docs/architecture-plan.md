# Application Tracker — Architecture Plan

**Status:** Phase 0 planning only  
**Prepared:** July 24, 2026  
**Target timezone for the initial user:** America/Toronto  
**Source of truth:** The supplied product specification and dashboard reference image

### 2026-08-21 pivot addendum

The product pivoted to add an MCP server so Claude can create, read, update,
and search the user's own applications on their behalf, authenticated as that
user. This supersedes the Phase 5 classifier described below: Claude reasons
over job descriptions and titles conversationally, so this repository does not
build a parallel rules engine. Section 19 describes the MCP architecture; the
phase list in Section 14 and the risk list in Section 15 are updated to match.
Everything else in this document — schema, RLS, auth, dates, testing —
is unchanged and still the source of truth for Phases 1–4.

### Approved Phase 1 clarifications

The user approved these decisions before Phase 1:

- Application creation records one initial history event with nullable
  `previous_status` and the selected status in `new_status`.
- Salary is optional plain text and is excluded from analytics.
- Normalized category is manually selected. (Originally deferred to a Phase 5
  deterministic classifier; the 2026-08-21 pivot addendum drops that
  classifier permanently, so manual/Claude-assisted selection is now the
  final answer, not an interim one. `classification_confidence` stays in the
  schema as an unused optional column rather than a migration to remove it.)
- Archiving sets `archived_at`; permanent deletion is a separate, explicitly
  confirmed action.
- The Phase 1 route brief explicitly requires protected Analytics and Archive
  placeholders. They may exist as honest placeholders despite the earlier
  recommendation to omit them.

## 1. Current repository assessment

The repository is initialized with Git on the `main` branch, has no commits, and
contains no application files. The working tree is clean. There is no existing
framework, package manager lockfile, configuration, code convention, test suite,
database migration, or deployment configuration to preserve.

This is a useful greenfield starting point, but it means Phase 1 must establish
every project convention deliberately. The reference image provides a clear
long-term visual direction: a compact left navigation, a top utility bar, white
cards on a light neutral canvas, restrained blue accents, dense but readable
dashboard information, and responsive alternatives for wide tables and pipeline
columns. It is a design target, not the Phase 1 feature list.

Important observations:

- The requested stack is coherent and suitable for this application.
- Supabase is the only backend needed. A separate API server would add cost and
  security surface without solving an MVP problem.
- The full specification describes six substantial implementation phases. It
  should not be compressed into one large change.
- The dashboard mockup includes Calendar, Analytics, Archive, notifications, and
  a pipeline preview. Several are later-phase or out-of-scope features and must
  not appear as working controls before they exist.
- Historical metrics cannot be calculated correctly from only an application's
  current status. Status history must include an initial creation event as well
  as later transitions.

## 2. Recommended system architecture

Use a single Next.js application deployed to Vercel:

```text
Browser
  |
  v
Next.js App Router
  |- Server Components: authenticated reads and initial page rendering
  |- Client Components: forms, filters, charts, and interactive controls
  |- Server Actions / Route Handlers: validated mutations and recovery callbacks
  |- Shared domain modules: statuses, schemas, dates, analytics, classification
  |
  v
Supabase
  |- Auth: sessions, sign-up, sign-in, recovery
  |- PostgreSQL: profiles, applications, status history
  |- Row-level security: final authorization boundary
  |- Database trigger: status-history integrity
```

### Architectural boundaries

- **Presentation:** pages and components render data and collect user intent.
- **Application services:** server-only functions coordinate authentication,
  validation, database calls, and cache invalidation.
- **Domain:** pure TypeScript modules contain status definitions, metrics,
  classification, validation rules that are safe to share, and date logic.
- **Data access:** a small server-only repository layer contains Supabase queries.
  UI components do not construct database queries.
- **Database:** constraints, row-level security, and triggers enforce rules even
  if frontend code is bypassed.

Prefer Server Components for reads and Server Actions for same-origin form
mutations. Use Route Handlers only where an HTTP endpoint is actually needed,
such as an authentication callback. Do not introduce a global state library;
URL search parameters, server-rendered data, and local component state cover the
MVP.

### Major dependencies and their purpose

These are proposed for Phase 1, not installed in Phase 0:

- **Next.js / React / TypeScript:** application and rendering foundation.
- **Tailwind CSS:** consistent responsive styling without a second CSS system.
- **shadcn/ui primitives:** accessible, editable component source rather than an
  opaque runtime UI framework. Add only components that are used.
- **Supabase JS and SSR packages:** authentication-aware database access.
- **React Hook Form + Zod:** ergonomic forms plus reusable runtime validation.
- **Recharts:** dashboard charts in Phase 3; defer installation until then.
- **Vitest + Testing Library:** fast domain and component tests.
- **Playwright:** critical browser journeys.

Each major dependency must be checked for current compatibility and maintenance
at the start of the phase in which it is introduced. Pin versions through the
lockfile and use one package manager (npm is the lowest-friction default).

## 3. Proposed route map

Route groups keep URLs clean while separating public and authenticated layouts.
Bracketed routes are dynamic segments.

```text
/
  Redirect authenticated users to /dashboard; otherwise to /sign-in

/(auth)
  /login
  /signup
  /forgot-password
  /reset-password
  /auth/callback                 Supabase email/OAuth callback handler

/(app)                           Protected layout and app shell
  /dashboard                     Phase 3; simple signed-in landing in Phase 1
  /applications                  Phase 2 list, search, and filters
  /applications/new              Phase 2 create form
  /applications/[applicationId]  Phase 2 detail
  /applications/[applicationId]/edit
  /pipeline                      Phase 4
  /analytics                     Phase 1 placeholder; real data in Phase 3
  /archive                       Phase 1 placeholder; workflow deferred
  /settings                      Profile editing deferred
```

Calendar and notifications should not be routed in Phase 1. The explicitly
requested Analytics and Archive routes must state that their functionality is
unavailable rather than presenting fake data or controls.

Unknown or inaccessible application IDs should resolve to the same not-found
experience. That avoids revealing whether another user's record exists.

## 4. Proposed database schema

All schema changes live in timestamped Supabase migrations. PostgreSQL
`timestamptz` stores instants; PostgreSQL `date` stores date-only user concepts.
UUIDs are generated in the database.

### `profiles`

| Column | Type | Rules |
|---|---|---|
| `user_id` | `uuid` | PK, FK to `auth.users(id)` on delete cascade |
| `full_name` | `text` | required, trimmed, 1–120 chars |
| `school` | `text` | optional, max 160 chars |
| `academic_program` | `text` | optional, max 160 chars |
| `graduation_year` | `smallint` | optional, sensible bounded check |
| `created_at` | `timestamptz` | required, default `now()` |
| `updated_at` | `timestamptz` | required, default `now()` |

A database trigger can create a minimal profile after auth sign-up, using safe
metadata only for the initial full name. The user can complete the profile later.

### `applications`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK, default generated UUID |
| `user_id` | `uuid` | required, FK to profile, derived from session |
| `company_name` | `text` | required, trimmed, 1–160 chars |
| `original_job_title` | `text` | required, trimmed, 1–200 chars |
| `normalized_job_category` | `job_category` | required |
| `classification_confidence` | `classification_confidence` | optional; null for a manually selected category |
| `classification_matches` | `jsonb` | required default `[]`; rule IDs/weights only |
| `location` | `text` | required, trimmed, max 200 chars |
| `work_arrangement` | `work_arrangement` | required default `Unknown` |
| `application_url` | `text` | optional, validated URL, max 2,048 chars |
| `application_source` | `text` | required, trimmed, 1–100 chars |
| `job_description` | `text` | optional, max 50,000 chars |
| `application_deadline` | `date` | optional |
| `date_applied` | `date` | optional; required by service when submitted status is selected |
| `current_status` | `application_status` | required default `Interested` |
| `work_term_season` | `text` | required, trimmed, max 80 chars |
| `work_term_duration` | `text` | optional, max 80 chars |
| `salary` | `text` | optional, max 100 chars; see simplification note |
| `notes` | `text` | optional, max 20,000 chars |
| `next_action` | `text` | optional, max 500 chars |
| `next_action_due_date` | `date` | optional |
| `created_at` | `timestamptz` | required default `now()` |
| `updated_at` | `timestamptz` | required default `now()` |
| `archived_at` | `timestamptz` | optional |

`classification_matches` makes the original deterministic suggestion explainable
without rerunning a potentially newer ruleset. Add `classification_rules_version
text` before Phase 5 if persisted explanations must remain reproducible.

### `application_status_history`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` | PK, default generated UUID |
| `application_id` | `uuid` | required |
| `user_id` | `uuid` | required |
| `previous_status` | `application_status` | nullable only for creation event |
| `new_status` | `application_status` | required |
| `changed_at` | `timestamptz` | required default `now()` |

Use a composite foreign key `(application_id, user_id)` referencing
`applications(id, user_id)`. This enforces same-owner history at the database
level. A database trigger inserts:

1. one creation event with `previous_status = null`; and
2. one transition event only when `current_status` actually changes.

History rows are immutable to browser clients. This is stronger than allowing a
client to manufacture or rewrite audit records.

### Controlled values

PostgreSQL enums are appropriate for values whose spelling is a business rule:

- `application_status`: Interested, Preparing, Applied, Screening, Assessment,
  Interview, Offer, Rejected, Withdrawn, Accepted
- `job_category`: the 16 categories in the specification
- `work_arrangement`: Remote, Hybrid, On-site, Unknown
- `classification_confidence`: High, Medium, Low

Enums require migrations to add values, which is intentional here. TypeScript
must define the same values in one domain module, and generated Supabase types
should detect drift. Application source and work-term season remain constrained
text until real usage shows which controlled vocabulary is useful.

## 5. Relationships, constraints, and indexes

```text
auth.users 1 ── 1 profiles
profiles   1 ── * applications
applications 1 ── * application_status_history
```

Recommended constraints:

- Unique `(id, user_id)` on applications to support the ownership-safe composite
  history foreign key.
- Nonblank checks use `char_length(btrim(value))`.
- Maximum lengths exist in both Zod and PostgreSQL checks.
- `archived_at` is either null or a valid timestamp; archived records remain
  owned and protected like active records.
- The service layer enforces `date_applied` for submitted statuses. A database
  check may be added after deciding how imports and status reversals should work.
- `updated_at` is maintained by a small database trigger.
- Status history prevents `previous_status = new_status`.

Recommended indexes:

```sql
applications (user_id, created_at desc)
applications (user_id, updated_at desc)
applications (user_id, current_status) where archived_at is null
applications (user_id, date_applied desc) where date_applied is not null
applications (user_id, next_action_due_date)
  where next_action_due_date is not null and archived_at is null
applications (user_id, application_deadline)
  where application_deadline is not null and archived_at is null
applications (user_id, normalized_job_category)
  where archived_at is null
application_status_history (user_id, application_id, changed_at)
application_status_history (user_id, new_status, changed_at)
```

Do not add speculative indexes for every column. Search can initially use
case-insensitive matching scoped by `user_id`; if the dataset becomes large,
measure first and then add a `pg_trgm` GIN index over selected searchable fields.

## 6. Proposed Supabase row-level security

Enable and force RLS on every public user-owned table. Revoke broad default
privileges and grant only what authenticated clients require. Policies are a
database authorization boundary, not a replacement for server-side checks.

### Profiles

- **SELECT:** `auth.uid() = user_id`
- **INSERT:** `auth.uid() = user_id`
- **UPDATE:** `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- **DELETE:** `auth.uid() = user_id`

Normal profile creation should occur through the auth trigger. The insert policy
still prevents creation for another identity if direct insert is ever used.

### Applications

- **SELECT:** `auth.uid() = user_id`
- **INSERT:** `WITH CHECK (auth.uid() = user_id)`
- **UPDATE:** `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- **DELETE:** `auth.uid() = user_id`

The mutation layer must never accept `user_id` from a form. It reads the session
and supplies the authenticated ID. RLS independently rejects a mismatch.

### Status history

- **SELECT:** `auth.uid() = user_id`
- **INSERT:** deny direct authenticated inserts
- **UPDATE:** deny authenticated updates
- **DELETE:** deny authenticated deletes

For explicit policy coverage, mutation policies can use
`auth.uid() = user_id AND false`; table privileges should also omit these
operations. An owner-executed, narrowly scoped `SECURITY DEFINER` trigger creates
history rows after verifying the application's owner. Set a fixed `search_path`
inside security-definer functions. Never expose the Supabase service-role key to
the Next.js client or use it for ordinary user requests.

### RLS verification

Automated local integration tests must create two users and prove that User A
cannot select, update, delete, infer through detail routes, or aggregate User B's
applications or history. Tests should also attempt direct REST/database calls,
not only exercise filtered UI queries.

## 7. Proposed folder structure

```text
.
├── app/
│   ├── (auth)/
│   │   ├── sign-in/
│   │   ├── sign-up/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── applications/
│   │   ├── pipeline/
│   │   ├── settings/profile/
│   │   └── layout.tsx
│   ├── auth/callback/route.ts
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── loading.tsx
│   └── not-found.tsx
├── components/
│   ├── app-shell/
│   ├── applications/
│   ├── dashboard/
│   ├── forms/
│   └── ui/
├── lib/
│   ├── analytics/
│   ├── classification/
│   ├── dates/
│   ├── domain/
│   ├── repositories/
│   ├── services/
│   ├── supabase/
│   ├── validation/
│   └── env.ts
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
├── tests/
│   ├── e2e/
│   ├── fixtures/
│   ├── integration/
│   └── unit/
├── docs/
│   ├── architecture-plan.md
│   ├── analytics.md
│   ├── classification.md
│   ├── database.md
│   └── implementation-log.md
├── .env.example
├── playwright.config.ts
├── vitest.config.ts
└── README.md
```

Do not create every empty directory in Phase 1. Add directories as working code
requires them. Keep server-only modules marked with `server-only`, and do not
import them into Client Components.

## 8. Analytics architecture

Create one pure analytics domain module and one query/aggregation boundary:

- `lib/analytics/definitions.ts` exports named status sets and metric definitions.
- `lib/analytics/calculate.ts` calculates metrics from typed application/history
  records and handles zero denominators.
- `lib/repositories/analytics-repository.ts` fetches only the authenticated user's
  input data.
- Dashboard components consume a typed `DashboardSummary`; they never redefine
  formulas.

Definitions from the specification:

- **Total:** current status is Applied, Screening, Assessment, Interview, Offer,
  Rejected, Withdrawn, or Accepted.
- **Active:** current status is Applied, Screening, Assessment, or Interview.
- **Employer response:** the application has ever reached Screening, Assessment,
  Interview, Offer, Rejected, or Accepted.
- **Positive response:** ever reached Screening, Assessment, Interview, Offer, or
  Accepted.
- **Interview conversion:** ever reached Interview, Offer, or Accepted.
- **Offer rate:** ever reached Offer or Accepted.
- **Activity:** submitted applications grouped by `date_applied`; exclude
  Interested and Preparing.
- **Category/source:** submitted applications grouped using the same total
  population definition.

Current-state counts use `applications.current_status`. “Ever reached” metrics
use the union of the creation and transition history events, not only current
status. This matters when an interview later becomes Rejected, or an offer becomes
Accepted.

The first implementation can aggregate a single user's modest dataset in
TypeScript after an RLS-protected query. If measured volume warrants it, move
aggregation into stable SQL functions or views that still obey RLS. Do not
prematurely build a reporting database or cache.

Every chart gets a text summary or accessible table equivalent. Metric tests use
small explicit datasets, boundary cases, and status progressions. Percentages use
one shared rounding policy.

## 9. Job-title classification architecture

The classifier is a pure, deterministic module with no UI, database, network, or
framework dependency:

```text
raw title
  -> normalize (Unicode, lowercase, punctuation/whitespace)
  -> match exact phrases and weighted keywords
  -> apply negative/exclusion rules
  -> apply category precedence and tie-break rules
  -> calculate confidence
  -> return category, confidence, matched rule IDs, explanation
```

Suggested files:

```text
lib/classification/
├── classify-job-title.ts
├── normalize-title.ts
├── rules.ts
├── score.ts
├── types.ts
└── README.md
```

Rules are declarative data with stable IDs, category, positive phrases, keywords,
negative terms, weights, and precedence. Phrase matches outrank isolated keyword
matches. Specific compound roles outrank broad nouns; for example:

- `product marketing` → Marketing, not Product Management
- `marketing automation` → Marketing Operations
- `strategy and operations` → Strategy and Operations
- `software developer` → Software Engineering

Confidence is based on score margin and evidence quality, not a misleading
probability. “Low” includes fallback to Other and close ties. The response includes
matched rule IDs and a short generated explanation. Classification never blocks
creation and the manually selected category is stored without altering the
original title.

Phase 5 must add at least 50 realistic fixture titles, expected categories,
ambiguity notes, false-positive tests, normalization tests, deterministic repeat
tests, and an evaluation summary. “Business Systems Analyst” and “Sales
Operations” should be documented as context-dependent rather than presented as
universally solvable from a title alone.

## 10. Authentication and authorization

Use Supabase email/password authentication with cookie-based SSR sessions:

- Browser and server Supabase clients are separate and use only public project
  URL/key configuration.
- Next.js middleware refreshes expired sessions but does not serve as the sole
  authorization layer.
- The protected app layout checks the user on the server and redirects anonymous
  visitors to sign-in.
- Every server mutation obtains the authenticated user itself, validates input
  with Zod, and writes through the user's Supabase session.
- RLS applies again at the database boundary.
- Recovery emails return through `/auth/callback` to `/reset-password`.
- Sign-out is a server action that clears the session and redirects.

Do not put authorization-critical user IDs in URLs, hidden inputs, or trusted
client state. An application UUID in a URL identifies a candidate record, never
its owner. Avoid open redirects by accepting only a small allowlist of internal
post-auth destinations.

Security-sensitive responses should be deliberately nonspecific where account
enumeration is possible. Configure production redirect URLs and email templates
in Supabase. Add rate limiting only after assessing Supabase Auth's current
controls; do not invent custom auth.

## 11. Testing strategy

### Static checks

- ESLint with Next.js and accessibility-relevant rules
- `tsc --noEmit` with strict mode
- production `next build`

### Unit tests (Vitest)

- classification normalization, precedence, negative rules, confidence, and 50+
  realistic titles
- every analytics definition, zero denominator, current versus historical state
- application Zod schemas and controlled values
- date-only formatting and overdue/due-today logic
- status-transition decision logic, including no-op edits

### Component tests (Testing Library)

- accessible form labels and associated errors
- empty/loading/error/success states
- keyboard status alternative
- responsive navigation behavior at the component level where useful

### Database integration tests

Run a local Supabase stack in CI and locally:

- migration applies from an empty database
- profile creation
- application CRUD
- initial and changed status-history events
- no duplicate history on unrelated edits
- two-user RLS isolation for every operation and aggregate input
- attempts to forge or mutate history fail

### End-to-end tests (Playwright)

Use seeded, disposable local test users:

- sign-up or test-account authentication
- sign-in, sign-out, and recovery UI path
- create, view, edit, filter, status-change, and delete an application
- next action and deadlines
- dashboard metrics after known actions
- User A cannot reach User B's records
- representative desktop and mobile flows

Password-recovery email delivery itself may need Supabase local mail capture rather
than a real external inbox. Keep tests deterministic and never point destructive
tests at production.

### Required phase gate

Before a phase is complete, run lint, type-check, unit tests, relevant integration
tests, relevant Playwright tests, and a production build. A skipped check must be
reported with the exact environmental blocker. CI should run the same commands on
pull requests.

## 12. Date-handling approach

Date-only fields stay as validated ISO calendar strings (`YYYY-MM-DD`) from form
to PostgreSQL `date`. They must not be parsed with `new Date("YYYY-MM-DD")`,
converted to UTC, or serialized through an instant; those patterns can shift the
displayed date.

Timestamps use `timestamptz`, are transmitted as ISO instants, and are formatted
with the user's chosen IANA timezone. Initially, resolve the timezone from the
profile when that field is added; until then use the browser's IANA timezone with
a documented fallback. Do not hardcode America/Toronto into domain logic.

Pure date helpers should:

- validate and format date-only strings using an explicit locale;
- derive “today” in an injected IANA timezone;
- compare date-only values as calendar dates;
- define overdue as due date before today and incomplete action;
- define due today as exact calendar-date equality.

Tests cover missing values, today, past/future, leap days, month/year boundaries,
and timestamps around daylight-saving changes. Inject “now” into testable
functions rather than mocking global time everywhere. A small well-maintained date
library should be considered only if native `Intl` plus focused helpers becomes
error-prone; do not add one automatically.

## 13. Deployment approach

- **Frontend/application:** Vercel project connected to GitHub.
- **Database/auth:** separate Supabase development/staging and production
  projects where budget permits.
- **Configuration:** `.env.example` documents public Supabase URL and publishable
  key names. Real values live in local `.env.local` and Vercel environment
  settings, never Git.
- **Migrations:** versioned SQL in `supabase/migrations`; validate locally, apply
  to staging, then production. Do not edit production schema manually.
- **CI:** GitHub Actions runs install from lockfile, lint, types, unit tests,
  database tests, Playwright where supported, and build.
- **Preview deployments:** use a non-production Supabase project or clearly
  isolated preview strategy. Never let preview tests mutate production data.
- **Observability:** begin with Vercel/Supabase platform logs and user-safe error
  messages. Add third-party monitoring only when there is a concrete need and a
  privacy decision.

Production launch requires configured site/auth URLs, recovery redirect testing,
RLS verification against the production migration state, backup/recovery review,
and a manual accessibility/responsive smoke test.

## 14. Phased implementation plan

### Phase 1 — Foundation

Initialize the compatible stable stack; strict TypeScript; linting; unit and
browser test harnesses; environment validation; responsive authenticated shell;
email/password auth and recovery; protected route; initial migrations; RLS;
profile/application/history foundations; RLS and auth tests; basic documentation.
The dashboard is only a useful signed-in landing/empty state—no fake analytics.

### Phase 2 — Core application management

Implement validated application CRUD, detail/list views, search/filtering, status
changes, next actions, deadlines, source and work-term data, history trigger,
responsive table/cards, and complete UI states. At this point the product replaces
a basic spreadsheet.

### Phase 3 — Dashboard

Implement the shared analytics module and authenticated queries, then summary
cards, overdue actions, deadlines, recent applications, category/source/activity
charts, and accessible empty/chart alternatives. Verify all formulas using
fixtures and status history.

### Phase 4 — Pipeline

Implement status columns, persistence, optimistic/failure behavior, filtering,
mobile layout, and a keyboard-accessible status menu. Evaluate a drag-and-drop
dependency only at this phase.

### Phase 5 — MCP server (superseded original: Classification)

Add `/api/mcp` using the official MCP TypeScript SDK, exposing
`create_application`, `get_application`, `list_applications`,
`update_application`, and `add_application_note`. Each tool handler calls the
same `lib/applications/repository.ts` functions the web app already uses, so
RLS and validation are not reimplemented. V1 authenticates the MCP connection
with a single manually issued personal API key stored hashed server-side (not
OAuth yet); the tool handler resolves the key to a `user_id` the same way a
session resolves to one, and every query still filters by that ID. Manually
verify end-to-end against a real Claude connector before calling this phase
done: paste a JD to Claude, have it call `create_application`, and confirm the
row appears on the dashboard.

### Phase 6 — MCP OAuth

Replace the manual API key with Supabase acting as an OAuth 2.1 provider for
MCP (dynamic client registration, PKCE, token issuance/refresh), per
Supabase's MCP Authentication guide. Add a Settings page "Connect Claude" /
"Revoke" control backed by Supabase's own token records — no new token table
in this app's schema. The same Supabase user identity powers both the website
session and the Claude connection.

### Phase 7 — Production readiness

Perform accessibility, responsive, security, RLS, analytics, date, performance,
and error-state reviews; finish documentation and deployment configuration;
validate a clean migration; run the full automated suite; visually refine against
the reference. Include an MCP-specific security pass: confirm a revoked/expired
token cannot call any tool, and that no tool handler ever accepts a `user_id`
argument from the MCP client.

Each phase starts by checking Git status and existing checks, identifies its
expected files, produces one logical change set, runs the complete relevant gate,
updates the implementation log, and recommends a commit message.

## 15. Ten most important risks

1. **Historical analytics can be false.** Current status alone loses prior
   milestones. Mitigation: creation/transition history and tests for progression.
2. **RLS can look correct while leaking through one operation or aggregate.**
   Mitigation: force RLS, ownership-safe foreign keys, two-user direct database
   tests, and no service-role access in app requests.
3. **Status history can be forged or duplicated.** Mitigation: immutable
   client-facing history and a database trigger that checks actual status changes.
4. **Date-only values can shift a day.** Mitigation: preserve `YYYY-MM-DD` as a
   calendar value and test timezone/DST boundaries.
5. **The classifier can sound more certain than it is.** Mitigation: explainable
   rules, score-margin confidence, manual override, and candid ambiguity notes.
6. **The scope is large for a first portfolio project.** Mitigation: phase gates,
   no placeholder navigation, and a usable spreadsheet replacement before charts
   or drag-and-drop.
7. **The reference dashboard encourages premature fake data.** Mitigation: empty
   states and real authenticated data only; fixtures remain local/test-only.
8. **Supabase SSR auth can be implemented with stale or insecure patterns.**
   Mitigation: use current official guidance during Phase 1 and test cookies,
   redirects, recovery, and server-side guards.
9. **Search and dashboard queries may become inefficient.** Mitigation: scoped
   indexes, query limits, measurement, then trigram/SQL aggregation only as needed.
10. **A greenfield dependency set may drift or conflict.** Mitigation: verify
    stable compatibility at install time, commit a lockfile, minimize packages,
    and keep framework-specific code outside the domain modules.
11. **An MCP API key or OAuth token could become a second, weaker
    authorization path around RLS.** Mitigation: the MCP route resolves
    `user_id` from the key/token exactly once, passes it into the same
    repository functions the web app uses, and RLS independently re-checks
    ownership on every query — never trust a client-supplied ID from either
    surface.

## 16. Requirements to simplify, change, or defer

- **Do not build the entire mockup in Phase 1.** Calendar, Analytics, Archive,
  notification badges, charts, and pipeline previews should be absent until real.
- **Defer Recharts to Phase 3** and any drag-and-drop library to Phase 4. They do
  not solve a Phase 1 need.
- **Treat archive as a filter first, not a separate product area.** A dedicated
  archive page is unnecessary until usage proves otherwise.
- **Store salary as text for the first personal-use version**, because a correct
  structured model needs currency, amount/range, and pay period. Before public
  use, replace it with explicit numeric fields rather than trying to analyze text.
- **Keep source and season as validated text initially.** Premature enums would
  make normal additions require migrations. Curated suggestions can improve entry
  without restricting it.
- **Add an initial history event.** The specification mentions transitions but
  “ever reached” metrics require a record of the starting status too.
- **Clarify deletion before Phase 2.** Hard delete is requested, while archive also
  exists. Recommend a clear Archive action plus an explicit permanent-delete
  confirmation; do not silently substitute one for the other.
- **Do not promise fully automated password-recovery delivery in E2E** without a
  deterministic local email capture system. Test the UI/callback locally and
  smoke-test actual production delivery manually.
- **Profile timezone is missing from the schema despite timezone-aware
  requirements.** Add optional `timezone` (validated IANA identifier) before
  multi-device/public use. Browser timezone is an acceptable personal-use
  fallback.
- **Classification sequencing conflicts slightly with MVP expectations.** Phase 2
  needs a category before the full classifier arrives in Phase 5. Use manual
  category selection initially; add suggestions in Phase 5.

## 17. Phase 1 acceptance criteria

Phase 1 is complete only when all of the following are demonstrably true:

- A fresh clone installs reproducibly from a committed lockfile.
- Next.js App Router, strict TypeScript, Tailwind, ESLint, Vitest, and Playwright
  are configured without disabled checks or broad type escapes.
- `.env.example` documents every required variable and contains no secret.
- Missing/invalid environment configuration fails with a clear developer message.
- Public sign-in, sign-up, forgot-password, and reset-password interfaces have
  accessible labels, validation, useful loading, success, and error states.
- A user can sign up, sign in, sign out, and complete the locally testable recovery
  flow.
- Anonymous requests to protected routes redirect safely to sign-in.
- The authenticated layout renders a responsive, keyboard-accessible sidebar/top
  navigation inspired by the reference; mobile navigation does not merely shrink.
- The dashboard landing state uses no production mock metrics or nonfunctional
  controls.
- Migrations create profiles, applications, controlled values, history,
  constraints, indexes, update/history triggers, and explicit RLS policies.
- Application ownership is derived from the authenticated session, never trusted
  from client input.
- Status creation/change creates exactly one correct history record; unrelated
  edits create none.
- Direct authenticated clients cannot insert, update, or delete history rows.
- Two-user tests prove isolation for profile, applications, history, and the data
  inputs that future analytics will use.
- Date-only utilities pass today, overdue, missing, boundary, and DST-related
  tests without UTC date shifts.
- The shell and auth screens have been manually checked at representative desktop
  and mobile widths with keyboard navigation.
- README documents architecture basics, setup, local Supabase, migrations, tests,
  environment variables, and known Phase 1 limitations.
- The implementation log records what was actually built.
- Lint, type-check, unit tests, database integration tests, relevant Playwright
  tests, and production build all pass. Any environmental exception blocks phase
  completion rather than being silently skipped.

## 18. First Git commit recommendation after Phase 1

Keep the planning document as a small Phase 0 commit first if the user chooses to
commit it:

```text
docs: add application tracker architecture plan
```

After Phase 1 passes every acceptance criterion, use:

```text
feat: establish secure application tracker foundation
```

That Phase 1 commit should include the reproducible project scaffold, auth and app
shell, database migrations and RLS, foundational tests, environment example, and
documentation. It should not include dashboard analytics, full CRUD, pipeline, or
the classification engine.

## 19. MCP architecture (added 2026-08-21)

### Transport and tools

A single Route Handler, `app/api/mcp/route.ts`, hosts the MCP server using the
official MCP TypeScript SDK. It registers exactly five tools for V1:

```text
create_application(company, job_title, location?, status?, date_applied?,
                    deadline?, job_url?, job_description?, resume_name?)
get_application(id)
list_applications(status?, company?, search?, limit?, cursor?)
update_application(id, <any subset of application fields>)
add_application_note(application_id, note)
```

Tool input schemas are Zod, reusing `lib/validation/application.ts` where the
fields overlap with the web form. `status` accepts the full existing
`application_status` enum (10 values), not the smaller 7-value set from early
drafts of this pivot — Claude and the web UI must never disagree about what
states exist. `add_application_note` appends to `applications.notes` and lets
the status-history/event trail record it, rather than inventing a separate
free-text notes table.

### Authorization boundary

The MCP route is a new *caller* of the existing repository layer
(`lib/applications/repository.ts`), not a new authorization path:

- V1 (Phase 5): the request carries a personal API key in an `Authorization`
  header. The route hashes it, looks up the owning `user_id` in a new
  `mcp_api_keys` table (`id`, `user_id`, `key_hash`, `created_at`,
  `last_used_at`, `revoked_at`), and rejects the call if missing/revoked. It
  then calls the repository exactly as a server action would, passing that
  resolved `user_id` — never a value the client supplied.
- Phase 6: the same resolution instead comes from validating a Supabase-issued
  OAuth access token. `mcp_api_keys` can be dropped once OAuth ships, or kept
  as a fallback for non-interactive/dev use (e.g. Claude Code) — decide with
  evidence of real demand, per the project's existing bias against
  unnecessary flexibility.
- RLS still applies in both cases: the repository queries run through the
  same Supabase client construction as the web app, scoped by the resolved
  user. A bug in the MCP route's key/token lookup cannot leak another user's
  rows, because RLS is the second, independent boundary — exactly the
  layered-authorization posture already used for the web app (Section 6).

### What does not change

No new database tables are needed for `applications` or
`application_status_history` — the MCP tools read and write the exact same
tables the web app uses, through the exact same repository functions. This
keeps the two surfaces (human UI, Claude) permanently consistent instead of
risking drift between a "web" data path and an "agent" data path.

### Testing

- Unit-test each tool's Zod schema (valid/invalid inputs) the same way
  existing application schemas are tested.
- Integration-test each tool handler against a local Supabase stack with two
  users, proving the same two-user isolation guarantees as Section 6's RLS
  tests — a stolen/guessed key for User A must never return or mutate User
  B's rows.
- One manual end-to-end check against a real Claude connector is the actual
  acceptance criterion for Phase 5 (Milestone 3 in the product plan): paste a
  job description, have Claude call `create_application`, refresh the
  dashboard, see the row.

---

## Phase 0 decision

Proceed to Phase 1 only after reviewing these four decisions:

1. accept an initial status-history event with nullable `previous_status`;
2. use salary text temporarily and avoid salary analytics;
3. use manual category selection until the Phase 5 classifier;
4. use archive plus explicit permanent deletion rather than ambiguous deletion.

No application code or packages were created during Phase 0.
