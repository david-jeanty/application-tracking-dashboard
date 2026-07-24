# Application Tracker — Project Specification

This repository-local specification summarizes the approved product brief. The
detailed architecture and technical decisions are in
[`docs/architecture-plan.md`](docs/architecture-plan.md).

## Product purpose

Build a responsive personal web application that helps a student replace an
internship/co-op application spreadsheet with a clear workflow, deadlines, next
actions, status history, and trustworthy analytics. The MVP does not use
generative AI.

Priorities, in order:

1. secure user-specific access;
2. reliable application workflows;
3. accurate shared business definitions;
4. understandable, maintainable code;
5. accessible responsive presentation;
6. restrained visual polish inspired by the supplied dashboard reference.

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
- a manually selected normalized category until Phase 5;
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

## Deterministic classification

Phase 5 introduces a pure rules module using normalized text, phrase and weighted
keyword matching, negative/exclusion rules, precedence, fallback, and High/Medium/
Low confidence. It returns matched rule IDs and an explanation. It never blocks
creation, and the user can always override the suggestion without changing the
original title.

## MVP phases

1. **Foundation:** framework, auth, protected shell, schema, RLS, tests, docs.
2. **Application management:** CRUD, list/detail, search, filters, status, actions,
   deadlines, complete UI states.
3. **Dashboard:** shared accurate metrics, actions, deadlines, recent activity,
   accessible charts.
4. **Pipeline:** persistent status columns, failure recovery, keyboard alternative,
   responsive behavior.
5. **Classification:** deterministic rules, manual override, 50+ title fixtures,
   evaluation and limitations.
6. **Production readiness:** accessibility, responsive, security, date, accuracy,
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

Browser extensions, arbitrary job-board scraping, resume/cover-letter generation
or scoring, job recommendations, social/collaborative features, inbox parsing,
calendar synchronization, push/SMS notifications, billing, native apps,
institution/employer accounts, public profiles, and elaborate animation/themes.

New ideas go to [`docs/backlog.md`](docs/backlog.md), not directly into a phase.

## Quality gate

Every phase must run lint, strict type checking, meaningful unit tests, relevant
database/integration and Playwright tests, and a production build. A blocked check
is reported, never described as passed. Documentation must distinguish what is
implemented, scaffolded, and deferred.
