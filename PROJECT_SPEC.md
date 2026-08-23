# Application Tracker — Project Specification

This repository-local specification summarizes the approved product brief. The
detailed architecture and technical decisions are in
[`docs/architecture-plan.md`](docs/architecture-plan.md).

## Product purpose

Build a responsive personal web application that helps a student replace an
internship/co-op application spreadsheet with a clear workflow, deadlines, next
actions, status history, and trustworthy analytics — and let Claude, connected
as an MCP client, create, retrieve, update, and search those same records on
the user's behalf so applying no longer requires manually filling out a form.
The product does not build its own generative-AI features (parsing, resume
tailoring, cover letters, chat); it exposes the user's own structured data to
Claude and lets Claude do that reasoning.

Priorities, in order:

1. secure user-specific access;
2. reliable application workflows;
3. accurate shared business definitions;
4. a correct, minimal MCP surface backed by the same RLS-protected data;
5. understandable, maintainable code;
6. accessible responsive presentation;
7. restrained visual polish inspired by the supplied dashboard reference.

## Approved stack

- Next.js App Router with strict TypeScript
- Tailwind CSS and shadcn/ui-compatible component conventions
- Supabase Auth and PostgreSQL with row-level security
- Zod at runtime boundaries
- React Hook Form when Phase 2 form complexity justifies it
- Recharts beginning in Phase 3
- Vitest and Playwright
- Vercel and GitHub

Do not add global state management, microservices, a custom backend, duplicate UI
systems, experimental packages, or dependencies without a current need.

## Core data

The application stores:

- one profile per authenticated Supabase user;
- user-owned applications with the original job title preserved;
- a normalized category, manually selected (or set by Claude via MCP) rather
  than machine-classified;
- controlled application status and work arrangement values;
- date-only deadlines, application dates, and next-action dates;
- timezone-aware creation, update, archive, and status-change timestamps;
- immutable status-history events owned by the same user as the application.

An initial status event is created with `previous_status = null`. Later events
occur only when status actually changes. Salary is optional plain text and is
never used for analytics. Archiving sets `archived_at`; explicit permanent
deletion is separate.

## Security rules

- Every user-owned table has row-level security and explicit operation policies.
- A user can access only their own profile, applications, history, and analytics.
- Ownership comes from the authenticated session, never a form or URL.
- Status history cannot be forged or rewritten by browser clients.
- No service-role key, database password, or private key is exposed or committed.
- Input is validated at appropriate server and database boundaries.
- Two-account tests must verify negative access cases.

## Application statuses

Interested, Preparing, Applied, Screening, Assessment, Interview, Offer,
Rejected, Withdrawn, Accepted.

## Normalized categories

Marketing, Marketing Operations, Sales, Revenue Operations, Business Analysis,
Strategy and Operations, Project Management, Product Management, Data and
Analytics, Finance, Accounting, Human Resources, Consulting, Information
Technology, Software Engineering, Other.

## Analytics principles

Metrics are defined once in a shared module. Current-state counts use the current
application status. “Reached” metrics use status history. Interested and Preparing
are not submitted applications. A zero denominator displays zero.

Salary is excluded from analytics. Dashboard data must be real authenticated
user data; production mock metrics are prohibited.

## Deterministic classification (dropped)

An earlier plan for Phase 5 was a hand-built rules engine to guess a normalized
category from a raw job title. This is dropped as of the MCP pivot: Claude
already does this reasoning conversationally when the user asks, so building
and maintaining a parallel rules engine duplicates something the MCP
integration already covers better. `normalized_job_category` stays a
user/Claude-set field with manual selection in the UI; no classifier ships.

## MCP automation

Claude connects to this app as a remote MCP client, authenticated as the same
Supabase user as the web session (see Authentication below). V1 ships four
tools, all operating only on the caller's own rows through the existing
RLS-protected repository layer — the MCP transport is a new caller of the
same data-access boundary, not a new authorization path:

- `save_job`
- `update_job`
- `list_jobs`
- `get_job`

Notes are a field on `save_job` and `update_job` rather than a separate tool.

Claude decides what data goes where (company, title, status, etc.) after
reasoning over a pasted job description or a user's instruction; this app
never parses free text itself. `delete_job` may follow later.

## MVP phases

1. **Foundation:** framework, auth, protected shell, schema, RLS, tests, docs.
   *(complete)*
2. **Application management:** CRUD, list/detail, search, filters, status, actions,
   deadlines, complete UI states. *(create/detail/edit and list search/filters
   complete; delete/archive actions remain)*
3. **Dashboard:** shared accurate metrics, actions, deadlines, recent activity,
   accessible charts.
4. **Pipeline:** persistent status columns, failure recovery, keyboard alternative,
   responsive behavior.
5. **MCP integration:** `/api/mcp` route, the four tools above, tool-input
   validation, and a manual API-key-authenticated MCP client test against the
   user's own account.
6. **MCP OAuth:** Supabase as OAuth 2.1 provider for MCP (dynamic client
   registration, PKCE, token issuance/refresh) so "Connect Claude" replaces
   manual API keys, plus a Settings UI for connecting/revoking access.
7. **Production readiness:** accessibility, responsive, security, date, accuracy,
   performance, deployment, and full-suite reviews.

## Phase 1 boundaries

Phase 1 includes real authentication, protected routes, a responsive application
shell, migrations, RLS, and foundational tests. Applications, Pipeline, Analytics,
Archive, and Settings may be protected placeholders but cannot pretend their
later workflows work.

Phase 1 explicitly excludes application CRUD, real application lists, analytics,
charts, classification, Kanban behavior, archive actions, notifications,
scraping, generative AI, and calendar integration.

## Out of MVP scope

Browser extensions, arbitrary job-board scraping, automatic job discovery,
resume tailoring/cover-letter generation or scoring, a deterministic JD/title
classifier, an in-app chatbot, job recommendations, social/collaborative
features, inbox parsing, calendar synchronization, push/SMS notifications,
billing, native apps, institution/employer accounts, public profiles, and
elaborate animation/themes. The rule for all of these: if Claude, connected via
MCP, already does it well in conversation, this app does not rebuild it —
this app's job is the persistent, structured, RLS-protected data store Claude
reads and writes, not a second AI surface.

New ideas go to [`docs/backlog.md`](docs/backlog.md), not directly into a phase.

## Quality gate

Every phase must run lint, strict type checking, meaningful unit tests, relevant
database/integration and Playwright tests, and a production build. A blocked check
is reported, never described as passed. Documentation must distinguish what is
implemented, scaffolded, and deferred.
