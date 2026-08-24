# Implementation log

## 2026-08-24 — Phase 3B: analytics visualisation and source performance

### Scope

The existing `/analytics` page, made easier to read, plus one genuinely new
analytical section. No metric was redefined, no schema changed, no MCP tool
touched, and no chart library added.

The page answers "how is my search performing?". The dashboard answers "what
should I do next?". Neither borrowed the other's job.

### Audit result

`application_source` turned out to be the whole question, so it was audited
first and not assumed:

- **Free text.** No enum, no normalization anywhere in the write path.
- **`not null`**, with `check (char_length(btrim(application_source)) between 1
  and 100)`. It can never be null and never blank in the database.
- **Sentinel-backed.** A blank form field or omitted MCP argument is written as
  `Not specified` by `toApplicationInsert`, and `displayOptionalText` converts
  that back to nothing for display. So "no source" already has a stored
  representation, and analytics did not need to invent one.
- **Absent from the list projection.** `APPLICATION_SUMMARY_COLUMNS` does not
  select it; only the detail projection does.

No architectural mismatch. Nothing about source performance needed a migration,
a taxonomy, or a second definition of any existing metric.

### Data access

A third projection rather than a widened list one. `APPLICATION_SUMMARY_COLUMNS`
is documented as the single projection every list read shares, and no list
surface renders a source; adding one column there would have handed it to the
applications page, the archive, the dashboard, and `list_jobs` alike. The
repository already sets this precedent — `listStatusHistory` and
`listStatusTimeline` are two reads rather than one widened type, for exactly
this reason.

`listApplicationsForAnalytics` selects five columns —
`id,current_status,normalized_job_category,application_source,archived_at` —
which is *smaller* than the list projection, not larger. The page still makes
two owner-scoped reads in total, and neither grows with the number of sections
on it.

### Source performance

The section answers "where are my submitted applications coming from, and what
happened to them?" and stops there.

**Population.** Only applications whose history shows they were actually
submitted are counted at all. A job saved as Interested and never sent says
nothing about a source and would silently punish whichever source a student
browses most. A source with 20 saved, 12 submitted and 2 interviews therefore
reports 2/12, not 2/20.

**Formulas**, all from status history and all reusing the existing shared status
sets:

- `submitted` — ever reached a `SUBMITTED_STATUSES` status
- `employerResponded` — ever reached an `EMPLOYER_RESPONSE_STATUSES` status
- `interviews` — ever reached an `INTERVIEW_STATUSES` status
- `offers` — ever reached an `OFFER_STATUSES` status
- `interviewRate` — `toPercent(interviews, submitted)`

An application that interviewed and was later rejected still counts as an
interview for its source, because current status is never consulted.

**Grouping** is trim plus lowercase, and nothing else. `LinkedIn`, `linkedin`,
and `LINKEDIN ` are one source because they differ only in typing. `LinkedIn`
and `LinkedIn Easy Apply` stay two, because nothing in the data model says they
are the same and deciding that they are would be inventing a taxonomy this
product does not have. The label shown is the spelling the student uses most,
with ties broken on the value rather than on row order, so the table does not
depend on what order the database returned.

**Small samples** are shown, never hidden, graded, or dressed in a confidence
interval: every rate arrives as `100% · 1 of 1`, never a bare `100%`. Rows are
ordered by submitted count descending — never by rate, which would put one
lucky application at the top and read as a recommendation — and the visible bar
encodes volume rather than rate for the same reason. The `Not specified` bucket
sorts last whatever its size: it is the residue after the real sources, not an
answer to where applications came from.

### The conversion funnel

Same four metrics, same shared denominator, presented so the denominator is
visible. `Submitted` is now a row at 100% with a rule under it, and every stage
below shows a raw count *and* a percentage rather than a percentage alone.

These remain shares of everything submitted. Stage-to-stage conversion —
"of the applications that got a response, how many interviewed" — is a
different and arguably useful metric, and is **deliberately not built here**;
it is recorded in the backlog instead of being slipped in behind the same
labels.

### No chart library

Recharts is permitted from Phase 3 and is still not installed, because after
the audit it would not have improved any of these three visualisations.

All three — funnel, current status, categories — are single-series magnitude
comparisons over ten, sixteen, and five ordered rows. That is the case where a
table is the recommended form rather than a compromise, and the page already
renders it as a real table: row headers, values in cells, a decorative bar
layered over numbers that are already readable. The bar occupies a real column
and so carries a real column header, visible only to assistive technology —
the same treatment the archive table gives its actions column. A body row with
more cells than the header row describes is how a table stops being navigable,
whatever those extra cells contain. The accessibility requirement
(and the architecture plan's own rule that every chart gets a table equivalent)
means a chart here would be rendered *in addition to* that table, so the same
numbers would exist twice in two components that can drift.

Recharts is also client-side; this page is a server component with no client
JavaScript at all. Adding it would move values into hover tooltips, which is
precisely what the accessibility rules forbid relying on.

The bars were corrected while they were open: square at the baseline, 4px
rounded at the data end, so each one reads as growing from a shared origin. One
hue throughout, doing magnitude and nothing else — no value-ramp, which would
have spent the only free channel restating the length the bar already shows.

### Low-data states

The existing zero-application empty state is unchanged. Two new ones sit inside
the page rather than replacing it: with nothing submitted, the funnel and the
source table each say so in one flat sentence instead of rendering an empty
chart. Submitted applications with no responses yet produce real zeros, not
blanks.

The copy is deliberately unencouraging. A student with nothing submitted is not
behind and not failing; this page's job is to say what the data shows and stop.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Credential-free `npm run test:e2e`: public and protection tests passed;
  authenticated tests were correctly skipped for want of `E2E_USER_EMAIL` and
  `E2E_USER_PASSWORD`.
- Desktop (1280), tablet (834), and mobile (390) were rendered and inspected
  from the real component with the production stylesheet. No horizontal
  document overflow at any width; the source table becomes stacked cards below
  `md` rather than a horizontal scroller.
- `npm run test:db` was **not** run: it needs Docker, unavailable here. This
  ticket adds no database behaviour and no migration, so no pgTAP suite was
  added and the existing suites remain as previously described — unexecuted in
  this environment.


## 2026-08-24 — Logos appear automatically for jobs saved through Claude

### Scope

A behaviour correction to the company-logo feature, not a schema change. Two
things: what `save_job` and `update_job` tell Claude about `company_domain`, and
one real bug in the `CompanyLogo` fallback. No new tool, no new column, no
authorization change.

`applications.company_domain` stays nullable, deliberately.

### The problem

The field shipped with guidance that read "supply it when you already know it;
never guess". That is the wording of a field a caller opts into, and the result
was what the wording asked for: a student who said "save this KPMG internship"
got an application with no domain and no logo, and had to ask a second time for
something they had never thought to ask for once.

The domain is not a separate feature a student requests. It is employer
metadata, like the location or the source, and the assistant that just read the
posting is the thing best placed to know it.

### What changed

`save_job` now asks Claude to fill `company_domain` in whenever the employer can
be reasonably identified — from the posting, the employer name, a supplied URL,
or ordinary knowledge. The guidance names the hosts that are not the employer
(Workday, Greenhouse, Lever, LinkedIn, Indeed) and carries worked examples:
Shopify → `shopify.com`, KPMG → `kpmg.com`, RBC → `rbc.com`, BMO → `bmo.com`,
Microsoft → `microsoft.com`. `update_job` gets the same guidance, plus an
invitation to fill in a domain an existing application is missing, so older
records pick up a logo the next time they move.

Both descriptions share one constant, so the two tools cannot drift into saying
different things about the same field.

The tool descriptions themselves changed too, not only the argument
descriptions: a client reads the tool description before it reads any argument,
so guidance buried in a field is guidance that may never be reached.

### What deliberately did not change

The expectation lives entirely in prose that Claude reads. JobTrack still infers
nothing — no employer-to-domain map in application code, no model called from
the server, no Logo.dev Search or Brand API. The examples are guidance to a
model, not a lookup table this product consults, which is the distinction that
keeps the list from rotting into wrong answers.

The column stays nullable and the argument stays optional, and that is the
safety net rather than an oversight: an employer that cannot be identified
confidently produces a save with no domain and a local lettermark, never a
failed save. A student can correct or clear the value on the edit form, which
matters more now that a value can arrive without anyone typing it.

### The fallback bug

The previous entry claimed the lettermark was "the layer underneath, so a
blocked, failed, or slow Logo.dev request leaves a readable initial". It did
not. The `img` carried `bg-white`, and a background is painted whether or not
any image data ever arrives — so the letter sat under an opaque white square for
the whole of a slow load, and permanently on a failed one. The documented
fallback existed in the comment and not on the screen.

The background is gone from the `img`. Covering the letter once the logo has
actually arrived is now the image format's job instead: the URL helper requests
`format=jpg`, and JPEG has no alpha channel, so opacity is a property of the
bytes rather than something the component paints over an empty box. The
container keeps its own background, which is what the letter is drawn on.

This is why the earlier PNG choice was wrong in the first place. It was made for
transparency — a logo "needs transparency to sit on the card background" — and
transparency is precisely what forced the `bg-white` that broke the fallback.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Credential-free `npm run test:e2e`: public and protection tests passed;
  authenticated tests were correctly skipped for want of `E2E_USER_EMAIL` and
  `E2E_USER_PASSWORD`.
- `npm run test:db` was **not** run: it needs Docker, unavailable here. No
  migration accompanies this change, so nothing new is unapplied.
- Not verifiable here: whether Logo.dev's JPEG response is opaque in practice.
  `www.logo.dev` is blocked by this environment's egress proxy, so no image was
  ever fetched. The reasoning rests on JPEG having no alpha channel, which is a
  property of the format, and on `jpg` being the API's documented default.


## 2026-08-24 — Company logos, powered by Logo.dev

### Scope

One additive nullable column, `applications.company_domain`, and the branding it
enables. Product polish, not a phase: no new MCP tool, no new table, no
authorization change, no AI call inside JobTrack, and nothing about enrichment,
scraping, caching, or uploaded logos.

The division of labour it rests on:

> Claude can reason about the company and its domain. JobTrack stores the
> structured truth. Logo.dev renders the brand asset.

### Audit result

A read-only audit ran first, over the schema, the creation and update schemas,
the mapper, both repository projections, the record and list types, all four MCP
tools, the applications list, the detail page, the archive, both dashboard
sections, the (placeholder) pipeline page, image conventions, `next.config.ts`,
environment-variable conventions, `.env.example`, the migrations and RLS
policies, and the existing tests around creation, update, and MCP.

No architectural mismatch. The column is cleanly supported because the shapes
that had to carry it already exist in exactly one place each: two projection
constants in the repository, one insert mapper, one form-values mapper, one
creation schema that every write path funnels through, and one in-memory join in
the dashboard. Nothing needed a second read, a new access path, or a policy
change.

### Data model

`supabase/migrations/20260824000100_add_company_domain.sql` adds a nullable
`text` column with a 253-character DNS length check and a column comment. No
default, no backfill, no attempt to infer a domain for existing rows: they hold
null and render a lettermark until somebody sets one.

No RLS change was needed, and that is structural rather than a judgement call.
The `applications` policies are owner predicates on `user_id` that apply to the
whole row whatever its columns, and the grants are table-wide.

### Normalization

`lib/branding/domain.ts` holds one deterministic function, called from the
shared creation schema — so the web form, `save_job`, and `update_job` all
normalize identically, and nothing downstream ever re-parses. It trims, accepts
a bare hostname, tolerates a pasted `http(s)` URL, lowercases, drops a leading
`www.`, discards path/query/fragment, returns `undefined` for blank, and rejects
anything that is not a plausible registrable domain — a single word, an IP
address, an email address, a URL carrying credentials, a port, or a non-web
scheme.

Both the bare and pasted cases run through the platform's `URL` parser rather
than string surgery, so lowercasing, IDNA/punycode conversion, and delimiter
handling cannot drift from what a browser does. A blank field is absent; a
mistyped one is a validation error the student sees, not a value silently
dropped.

It is deliberately not a discovery engine. No hard-coded `RBC -> rbc.com` map
exists anywhere — that rots — and JobTrack never guesses a domain from a company
name.

### Logo.dev integration

`lib/branding/logo.ts` is the only place a Logo.dev URL is built. The host
`img.logo.dev` is a fixed constant; only the path varies, and only with an
already-normalized domain that is re-normalized and percent-encoded on the way
in. The URL is assembled with `URL`/`URLSearchParams`, never by concatenation,
so no stored value can add a host, a path segment, or a parameter. The field can
therefore never become a general remote-image URL, and no proxy exists.

The publishable key is read from `NEXT_PUBLIC_LOGO_DEV_TOKEN`. It is
deliberately absent from `lib/env.ts`: that module validates configuration the
application cannot start without and throws when it is missing, and logos are an
enhancement that must never break a deployment that has no key. Only the Logo
API is used — no Search API, no Brand API, no secret key.

### `<img>` over Next `<Image>`

The audit found no bitmap image anywhere in the product: every existing graphic
is a Lucide SVG, and `next.config.ts` has no `images` configuration at all.
Adding `remotePatterns` and the optimizer pipeline for one 32-pixel mark that
Logo.dev already serves resized and CDN-cached would be infrastructure bought
for nothing. A plain `<img>` with explicit `width`/`height`, `loading="lazy"`,
and `object-contain` was chosen instead. `next.config.ts` is unchanged.

### Fallback

`CompanyLogo` renders a rounded, bordered box containing the company's first
letter or digit, with the Logo.dev image layered on top when there is both a
domain and a token. The lettermark is not an error branch — it is the layer
underneath, so a blocked, failed, or slow request leaves a readable initial in a
correctly sized box rather than a hole. With no stored domain there is no `img`
element at all, so an application without one causes no Logo.dev traffic.

The mark is `aria-hidden`. Every caller renders the company name as adjacent
text, so announcing the logo too would name the same employer twice.

### Where logos render

Applications list (desktop table and mobile card), application detail header at
the larger size, archive list, dashboard Needs attention, and dashboard Recent
activity. Nowhere else: not on stat tiles, analytics metrics, the pipeline
summary, buttons, or navigation.

Recent activity was included rather than deferred because the data shape already
supported it. `recentActivity` joins events to applications in memory, over rows
the dashboard has already read; widening that lookup from a name to the record
adds the domain with no extra query and no per-row read.

### MCP

Still exactly four tools. `save_job` and `update_job` gained an optional
`company_domain` argument, `get_job` returns it, and `update_job` reports it in
`changed_fields`. `list_jobs` did not: its summary exists so Claude can tell one
saved application from another, and a brand domain is not something anyone
chooses between applications by.

Clearing follows the existing partial-update semantics — an omitted field keeps
its value, an empty string clears it. No `user_id`, authentication, OAuth, RLS,
or tool-count change.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed.
- `npm run build`: passed.
- Credential-free `npm run test:e2e`: public and protection tests passed;
  authenticated tests were correctly skipped for want of `E2E_USER_EMAIL` and
  `E2E_USER_PASSWORD`.
- `npm run test:db` was **not** run: it needs Docker, which is unavailable in
  this environment. The migration is therefore unapplied and unverified against
  a real Postgres. No new pgTAP suite was added — the existing suites cover
  rules only a database can answer (triggers, policies, statement predicates),
  and a plain nullable column with no default, trigger, or policy introduces
  none.


## 2026-08-25 — Needs attention: only what a student can act on

### Scope

A corrective follow-up to Phase 3A. The Needs attention rules only. Pipeline
snapshot, This week, Recent activity, analytics definitions, MCP, and the schema
are untouched.

### The product principle

> Needs Attention surfaces commitments the student recorded and opportunities
> they may miss. Employer silence alone is not treated as a task.

Phase 3A shipped a fourth category — an application flagged after 14 days
without a status event. It read as advice, and the advice was unfounded: an
application sitting at Applied is not a task. Nothing about it is for the
student to do, and the honest reading is usually that the employer has not
replied yet. Telling somebody to "review" it manufactures work out of silence.

The deadline rule had a related flaw. A deadline's action is "finish and submit
this application", so once the application is submitted the deadline has served
its purpose. Showing it afterwards told a student about work they had already
done.

### The rules now

Three concepts, five priority tiers. Active applications only, one entry per
application, capped at six.

1. **Overdue next action** — an action exists and its due date is past.
2. **Unsubmitted deadline, today or tomorrow** — status `Interested` or
   `Preparing`, deadline not passed. Shown however recently the application was
   saved.
3. **Next action due today or tomorrow.**
4. **Unsubmitted deadline 2–7 days out** — same status rule, and the
   application must have been saved at least 2 calendar days ago.
5. **Next action due 2–7 days out.**

Five tiers rather than three, because urgency has to be able to outrank
category: a posting closing tomorrow matters more than a follow-up due Friday,
even though a recorded commitment generally outranks a deadline. The tier order
*is* the `ATTENTION_REASONS` array order, so ranking stays a property of the
vocabulary. The five tiers collapse to three labels in the UI — Overdue,
Deadline, Next action — because tiers rank the list and labels name the kind of
thing an entry is.

The unsubmitted status set is the analytics `PRE_SUBMISSION_STATUSES`, reused
rather than restated. Everything from Applied onward is excluded, terminal
statuses included.

The two-day minimum is what keeps the card quiet. A student who saved a posting
this morning knows it is there and knows when it closes; repeating it the same
day is noise, and noise is what makes somebody stop reading the section.
Deadlines today or tomorrow bypass it entirely.

Nothing is inferred. If the student did not write an action down, there is no
action.

### Saved age

`created_at` was already on the list projection and on `ApplicationListItem`, so
**no schema, query, or projection changed**. `buildDashboard` converts it to a
calendar day through `dateOnlyFromTimestamp` in the same zone it already uses
for history timestamps, and `AttentionApplication` carries `createdOn` as a
date-only string. No timestamp is ever compared to a date-only deadline.

### Removed

`STALE_AFTER_DAYS`, `STALE_CANDIDATE_STATUSES`, the `"stale"` reason, the stale
classifier branch, `lastMovementByApplication` and `LastMovementByApplication`
(which existed only to feed it), the "No movement" UI label, the "No status
movement for N days" copy, and the empty state's reference to applications
sitting quiet.

`listStatusTimeline` and every history read stay: This week and Recent activity
still use them. What was removed is the interpretation of silence, not the
ability to read history.

`needsAttention` no longer takes a movement map — its signature is now
`(applications, today, limit?)`.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 481 tests across 27 files.
- `npm run build`: passed.
- Playwright: 10 credential-free tests passed, 8 authenticated tests correctly
  skipped for want of credentials.

### Not verified here

No live run against a real database; the authenticated Playwright specs need
credentials and stayed skipped.

No pgTAP suite was added: this correction changes pure classification logic and
introduces no database behaviour. `supabase/tests/003`, `004`, and `005` remain
written but not executed, Docker being unreachable, and must not be described as
passing.

## 2026-08-24 — Phase 3A: dashboard command centre

### Scope

`/dashboard` rewritten from a static welcome card into an operational page
answering "what needs my attention?" — search summary, needs attention, pipeline
snapshot, this week, recent activity, and a handoff to analytics. No MCP change,
no schema change, no new dependency, and no change to what analytics means.

### Audit findings

No architectural or schema mismatch, and **no migration was needed**.

Every field the dashboard reasons about already exists and is already indexed:
`next_action`, `next_action_due_date`, `application_deadline`, `archived_at`,
`current_status`, and `application_status_history.changed_at` /
`previous_status`. `authenticated` holds a table-level `select` on the history
table, so no grant changed either.

Two findings shaped the design.

`listStatusHistory` projects two columns and its comment records a deliberate
decision to keep `changed_at` out, so nobody builds a duration metric mixing a
`timestamptz` with the date-only `date_applied`. The dashboard needs *when*
things moved, so it got a separate `listStatusTimeline` read rather than a
widened shared projection that would hand every analytics caller a field that
decision excluded.

`lib/applications/dashboard.ts` — `summarizeTrackedApplications` — was
superseded outright. Two Phase 2 suites asserted through it that "the dashboard
count follows the active list", which stopped being true of the dashboard. The
module and its suite were removed and those assertions re-pointed at
`pipelineSnapshot`, which is what now carries that behaviour.

### Architecture

Repository functions fetch, pure functions interpret, components render. No
business logic in `page.tsx` and none in a component.

- `lib/dashboard/definitions.ts` — every threshold and status set, named once.
  The status sets are imported from `lib/analytics/definitions`, never restated.
- `lib/dashboard/attention.ts` — classification and urgency ordering.
- `lib/dashboard/calculate.ts` — pipeline, week, activity, day grouping.
- `lib/dashboard/summary.ts` — composes the above from two whole reads.
- `components/dashboard/dashboard-sections.tsx` — presentation only.

Every calculator is pure and takes `today` as a parameter. Nothing reads a
clock, a database, or a request, which is what makes the rules testable.

### Metric definitions

The search summary reads the canonical `summarizeApplications` result rather
than recounting: submitted and the interview/offer figures come from status
history, active from current status. No competing definition was created.

Two populations, both borrowed rather than redefined. Historical sections —
search summary, recent activity — include archived applications, matching
analytics. Working-set sections — needs attention, pipeline snapshot — are
active-only, matching the applications list.

### Needs attention

> Superseded on 2026-08-25. This entry originally shipped a fourth category —
> stale submitted applications, flagged after 14 days without a status event —
> and a deadline rule that applied at any status. Both were removed; see the
> 2026-08-25 entry for the rules that hold now. The description below is kept
> only as a record of what was built.

Active applications only, one entry per application, capped at six.

1. **Overdue next action** — an action exists and its due date is past.
2. **Deadline soon** — a deadline today or within 7 days, never one that passed.
3. **Next action soon** — an action due today or within 7 days.
4. **Stale** — status in the shared `ACTIVE_STATUSES` and no status event for
   14 days.

An application matching several reasons appears once, under the highest, so one
company cannot push five others off the card. A due date with no action is
ignored, because a date alone describes nothing to do.

### This week

Monday through today. Three metrics, all exactly derivable: applications first
submitted, real status changes (the creation event is not a change), and
interviews first reached. "Follow-ups completed" is deliberately absent —
nothing records when an action was carried out, and neither faking it nor adding
a column belonged in this ticket. No streaks, targets, or comparisons.

### Recent activity

One entry per real history event, newest first, capped at six. The creation
event — the single row with a null `previous_status`, unique per application by
partial index — renders as "Saved as Applied". No synthetic entry is derived
from `created_at`, so a creation cannot appear twice.

### Dates

`today` is resolved once on the server, and timestamps become calendar days
once, both through `DEFAULT_TIME_ZONE`. Everything downstream compares
`YYYY-MM-DD` strings, so no rule can shift a day. Three new pure helpers —
`differenceInCalendarDays`, `startOfWeek`, `dateOnlyFromTimestamp` — build both
sides at UTC midnight rather than parsing through local time.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 469 tests across 27 files (100 new).
- `npm run build`: passed.
- Playwright: 10 credential-free tests passed, 8 authenticated tests correctly
  skipped for want of credentials.
- Rendered the composed sections to static HTML with the production stylesheet
  and screenshotted them at 1280px and 390px to check layout and density.

### Not verified here

No live run against a real database: the authenticated Playwright specs need
credentials and stayed skipped.

No pgTAP suite was added. This ticket adds no new database behaviour — one new
read over existing tables under existing policies — and a suite written only to
raise a test count would be noise. `supabase/tests/003`, `004`, and `005` remain
written but not executed, Docker being unreachable; they must not be described
as passing.

Phase 2 was marked complete in `PROJECT_SPEC.md` on the ticket author's
statement that it is complete, not on a smoke test run here.

## 2026-08-23 — Phase 2: quick status and next-action updates

### Scope

A compact Quick update section on the application detail page, for active
applications only. No inline editing in the applications table, no MCP change,
no schema change, and no new dependency. The full edit form is untouched.

### Audit findings

No architectural or schema mismatch, and **no migration was needed**.

`APPLICATION_STATUSES` already holds all ten statuses and is already the single
source both the full form and the MCP tools use. `next_action` and
`next_action_due_date` already have validation helpers in
`lib/validation/application.ts` — `optionalText(500)` and `optionalDateOnly` —
which the quick schemas reuse rather than restate, so the limits and the
calendar-date rule cannot drift between the two forms.

The status-history trigger already does exactly what this ticket needs. It is
declared `after update of current_status ... when (old.current_status is
distinct from new.current_status)`, so a genuine change records one event and
re-saving the status already stored records none. No application code writes to
that table, and could not: `authenticated` holds `select` on it only.

One finding worth recording. `applications_update_own` permits an owner to
update any of their own rows, archived ones included — as it must, because
archive and restore are themselves updates. "Quick update is for active
applications" therefore cannot come from row-level security; it comes solely
from the `archived_at is null` predicate in the quick mutations. That predicate
is not redundant with RLS and must not be removed. A pgTAP assertion pins it.

### Mutation design

Two narrow repository mutations over one shared owner-scoped helper, following
the philosophy of `setApplicationArchiveState` rather than routing through
`updateApplication`. The full-record path would read, merge, and rewrite every
column to change one, which is both wasteful and a way to overwrite fields the
student never touched.

- `setApplicationStatus` writes only `current_status`.
- `setApplicationNextAction` writes only `next_action` and
  `next_action_due_date`.

Both constrain on `id`, `user_id`, and `archived_at is null`, all in the
statement. Identity is derived from the authenticated server session; no
`user_id` is ever accepted from a request. Missing, not-owned, and archived all
return the same `not_found`, so no response confirms another student's record
exists. RLS applies again underneath. No service-role client is involved.

Optimistic concurrency is deliberately omitted, and the reason it can be is
structural: each mutation carries a patch of one or two named columns, so it
cannot write back a stale copy of anything the student did not just edit. The
full edit form still requires `expectedUpdatedAt`, because it replaces the
whole record and genuinely can clobber a concurrent change.

The pairing rule — a due date is kept only alongside an action, and an empty
action clears both columns — lives in the mutation rather than in a schema, so
the database cannot hold an orphaned due date whatever path the values took.
Clearing is the same statement with empty input, not a second one.

### Implemented

- `lib/validation/application.ts`: `quickStatusSchema` and
  `quickNextActionSchema`, reusing the existing helpers and the shared status
  enum. Neither can describe any other application field, so a crafted post
  cannot smuggle a company name or archive state into a status change.
- `lib/applications/repository.ts`: `quickUpdate`, `setApplicationStatus`,
  `setApplicationNextAction`, and `QuickUpdateResult`.
- `lib/applications/actions.ts`: `updateApplicationStatusAction`,
  `updateNextActionAction`, `clearNextActionAction`, over a shared
  `applyQuickUpdate` tail. Redirect targets are built from the validated
  identifier, never from request input.
- `lib/applications/state.ts` and `lib/applications/quick-update-notice.ts`:
  `QuickUpdateOutcome` and the pure `toQuickUpdateNotice` mapper, following the
  existing query-parameter notice convention. No toast library.
- `components/applications/quick-update.tsx`: two independent server-rendered
  forms. It returns null for an archived application, so the rule travels with
  the component instead of living in one caller.
- `app/(app)/applications/[id]/page.tsx`: renders the section and the notice.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 359 tests across 24 files (39 new).
- `npm run build`: passed.
- Playwright: 10 credential-free tests passed, 8 authenticated tests correctly
  skipped.

### Not verified here

`supabase/tests/005_application_quick_update.test.sql` is **written but not
executed**: the Docker daemon is unreachable in this environment and the ticket
excluded troubleshooting it. It is the only coverage for the trigger firing
exactly once on a real change and not at all on a repeat, for a next-action
update producing no history event, for RLS rejecting a cross-user quick update,
and for the archived predicate. It must not be described as passing.

`supabase/tests/003` and `004` remain queued for the same reason.

No live browser run of the quick-update flow: the authenticated Playwright
specs need credentials and stayed skipped.

Phase 2 is **not** marked complete here. That was made conditional on review
and a production smoke test, neither of which has happened yet.

## 2026-08-23 — Analytics

### Scope

A server-rendered `/analytics` page replacing the placeholder. No dashboard,
pipeline, archive, or MCP change, and no new dependency.

### Audit findings

The data model already supported this and **no migration was needed**. The
initial history event a trigger writes on creation is what makes an application
saved directly as `Applied` — what `save_job` does when a student says they
already applied — count correctly; a unique partial index guarantees exactly one
such event per application. `authenticated` already holds `select` on
`application_status_history` with an owner-scoped policy.

One real correctness hazard: the architecture plan defines "Total" from
*current* status while the response metrics are defined from *history*. An
application moved back to `Interested` after a rejection would leave the
denominator while its rejection stayed in a numerator, letting a rate exceed
100%. Approved resolution: **ever-submitted** — taken from history — is the
shared denominator for every rate, which makes each numerator a subset of the
denominator by construction. Current-status counts stay separate, as headline
figures rather than ratio inputs.

Also decided: archived applications are **included**, because a role a student
tidied away still happened and excluding it would inflate every rate. The
applications list deliberately does the opposite, being a worklist.

Deferred: time-to-response, which would mix `changed_at` (`timestamptz`) with
`date_applied` (`date`) against this project's date-only discipline.

### Implemented

- `lib/analytics/definitions.ts` — the status sets and one rounding policy, so
  no page or component can restate a formula. A zero denominator is zero.
- `lib/analytics/calculate.ts` — a pure `summarizeApplications`, given every
  input: no clock, no database, no request.
- One new repository read, `listStatusHistory`, projecting only
  `application_id,new_status`. `changed_at` is deliberately absent so a duration
  metric cannot be built on it by accident. The applications side reuses the
  existing `listApplications` with `archiveState: "all"` — no second read.
- Ten statuses is well past the point where colour can carry identity, so the
  breakdowns are tables with single-hue magnitude bars, values present as text
  in their own cells rather than only on hover. Recharts stays uninstalled.

Note: the architecture plan proposed `lib/repositories/analytics-repository.ts`;
this repository settled on `lib/applications/repository.ts`, and the existing
convention was followed instead.

### Verification

- `npm run lint`, `npm run typecheck`: passed, no warnings.
- `npm run test`: passed, 244 tests across 16 files (22 new). The metric tests
  use explicit status paths and cover the boundary cases the audit raised:
  created-directly-as-Applied, a stage skipped over, an interview that became a
  rejection, a submitted application moved back to Interested, an archived
  application, a zero denominator, and history referencing a row that is gone.
- `npm run test:e2e`: 10 passed, 8 skipped (the authenticated journeys need an
  isolated account).
- `npm run build`: passed; `/analytics` builds as a dynamic route.

### Not verified here

No pgTAP was added for analytics: the metrics are pure functions over rows, and
the trigger behaviour they assume is already covered by
`001_foundation_rls.test.sql`. The page has no browser-test coverage, for the
same credential reason as the rest of the authenticated interface.

## 2026-08-23 — Applications search and filtering

### Scope

A search box and three filters above the applications list. No archive, delete,
sorting, pagination, analytics, pipeline, or MCP change.

### Audit of the existing read paths, before any change

- The enums, the design system, and the `searchParams`-as-Promise convention
  were all already in place, so nothing parallel had to be invented.
- Every field needed is already a column, so **no migration was required**.
- `listApplications` filtered `company` against one column. Searching company
  *or* title *or* location is a different query shape, not a parameter tweak —
  the one substantive gap.
- `ApplicationList` took no props and `page.tsx` never read `searchParams`.
- `ApplicationListFilters` had no `category`; `list_jobs` never needed one.
- `work_term_season` is free text with a `Not specified` sentinel, so there is
  no enum to build a work-term dropdown from.

### Resolved

- Extended the shared `listApplications` with `search` and `category` rather
  than adding a website-only fetch-and-filter path. `list_jobs` keeps its
  single-column `company` filter and is otherwise untouched.
- `listActiveApplications` now takes filters typed as `ActiveApplicationFilters`
  — `archiveState` is `Omit`ted from the type and applied inside the function,
  so no URL parameter can widen the page to archived records.
- Added `listActiveWorkTermSeasons`, the smallest owner-scoped read that can
  populate the work-term select from the student's own data. Deduplication,
  sentinel removal, and sorting happen in TypeScript: PostgREST has no
  `distinct`, and a view for a few dozen short strings would be more machinery
  than the problem deserves.
- Search runs SQL-side through PostgREST `or(...)`. Raw input is never
  interpolated: `toSearchFilter` builds a literal `LIKE` pattern and then quotes
  it, so a comma in "Toronto, ON" or a period in "Inc." is searched for rather
  than parsed as filter syntax.

### Implemented

- `q`, `status`, `work_term`, and `category` URL parameters, matching the MCP
  wire vocabulary. Unrecognized, over-long, or repeated values are dropped
  rather than rejected, so an edited URL falls back to the ordinary list.
- A plain `<form method="get">` with an explicit **Apply filters** button and a
  **Clear** link shown only when filters are active. No client component, no
  router state; refresh, back, and bookmarking work because the browser is
  doing what it always does with a form.
- A filtered empty state distinct from the new-user one, with its own way out.

### Verification

- `npm run lint`, `npm run typecheck`: passed, no warnings.
- `npm run test`: passed, 222 tests across 15 files (45 new). Covers URL
  parsing and invalid input, the `or` expression and its escaping layers, and
  the query the repository builds — owner scoping, archive exclusion, each
  filter, and every combination.
- `npm run test:e2e`: 10 passed, 8 skipped. The skipped ones are the
  authenticated journeys, which need an isolated test account; they are also
  the only Playwright coverage that would exercise this feature.
- `npm run build`: passed.

### Written but NOT executed

`supabase/tests/002_application_search.test.sql` covers what only a real
database can answer: that `ilike` is case-insensitive, that an escaped `%` or
`_` matches literally, that search spans exactly the three intended columns,
and that neither another user's rows nor archived applications are reachable.
**It has not been run.** The Docker client is installed in this environment but
no daemon is available, so `npm run test:db` cannot start the local stack. The
suite is unverified until someone runs it locally.

## 2026-08-22 — MCP `list_jobs` and `get_job`

### Scope

Added the two read tools, so Claude no longer needs a student to know a UUID:
it lists, reads the short records, and picks the application itself. No UI,
schema, migration, service-role key, or authentication change.

### Audit of the existing read paths, before any change

- `getApplicationById` was already exactly what `get_job` needs: owner-scoped,
  full detail projection, `maybeSingle`, and a null result for both missing and
  not-owned. No change was required for it.
- `listActiveApplications` was **not** what `list_jobs` needs. It hard-coded
  `archived_at is null`, took no filters, applied no limit, and did not select
  `work_term_season`, which is one of the fields a student uses to tell two
  applications apart. Serving the tool from it would have meant either a second
  parallel query or shipping every application on every call.
- The tool registration lived inline in `app/api/mcp/route.ts`, and the
  registration test re-declared its own copies of the tools. That test could
  stay green while the route was broken, and "all four tools register" could
  not honestly be asserted of the thing actually served.

### Resolved

- Generalized the list read into `listApplications(supabase, userId, filters)`
  with optional status, company, work-term, archive-state, and limit filters.
  `listActiveApplications` is now a thin wrapper over it, so the page and the
  tool share one query and one projection. The filters land on the existing
  indexes — `(user_id, created_at desc)` orders, and
  `(user_id, current_status) where archived_at is null` covers the common
  case — so no migration, index, or SQL function was added.
- Moved the projection into `APPLICATION_SUMMARY_COLUMNS`, which excludes
  `job_description` and `notes` by construction. A list response cannot carry a
  50,000-character description because the query never selects one.
- Extracted `registerJobTrackTools(server, repositoryFor)` into
  `lib/mcp/tools.ts`. The route supplies the real RLS-bound repository; tests
  supply a two-user stand-in. What the tests exercise is now what the route
  serves. `readUserId` moved to `lib/mcp/user.ts` so the registration stays
  free of `server-only` imports.

### Implemented

- `list_jobs`: optional `status`, `company`, `work_term`, `archive_state`, and
  `limit` (default 25, ceiling 50, enforced by the advertised schema rather
  than by silent trimming). Records carry only `application_id`, `company`,
  `job_title`, `status`, `work_term`, `location`, `deadline`, `date_applied`,
  and `archived`. One row past the limit is fetched and dropped to report
  `has_more` without a second counting query.
- `get_job`: `application_id` and nothing else. Returns the full record —
  description, notes, next action, dates, work-term details, links, salary —
  with the `Not specified` sentinel presented as empty and no `user_id`, no
  classifier column, and no version token.
- Company and work-term filters are literal case-insensitive substring
  matches. The `LIKE` pattern is built by `toContainsPattern`, a pure helper
  with its own tests, so the claim that `100%_Inc` searches for that text
  rather than matching most of the table is verified rather than asserted. No
  fuzzy or natural-language matching lives in the tools: choosing which
  application the student meant is Claude's reasoning, and a tracker that
  guesses is worse than one that returns the candidates.

### Verification

- `npm run lint`, `npm run typecheck`: passed, no warnings.
- `npm run test`: passed, 177 tests across 12 files (54 new). Covers
  owner-only listing, a second student seeing only their own rows, a
  non-owned record answering identically to a nonexistent one, each filter,
  empty lists, limits and `has_more`, summary conciseness, the complete
  `get_job` record, absence of `user_id` on all four tools, and the unchanged
  `save_job` and `update_job` suites.
- The registration suite now drives a real `McpServer` over an in-memory
  transport: it initializes, lists tools, and calls all four with a verified
  identity. Schema conversion, argument validation, output-schema validation,
  and the unauthenticated path are all exercised through the real dispatch.
- `npm run build`: passed.

### Not verified here

The filter and limit SQL is exercised against a stand-in store, not Postgres;
the escaping and index assumptions are argued in code, not measured. A hosted
verification script in the style of `scripts/verify-hosted-ticket-2-2.mjs`
would close that gap and needs a live project. No live Claude connector run
was performed for these two tools.

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
