# Database, migrations, and row-level security

## Source of truth

The `supabase/migrations/` directory is the schema source of truth, applied in
filename order, starting with `20260724000100_initial_schema.sql`. Do not
reproduce the schema manually in the Supabase Dashboard.

## Tables

- `profiles`: one row per `auth.users` identity.
- `applications`: user-owned internship/co-op application data, ready for Phase 2.
- `application_status_history`: immutable creation and transition events.

The application/history relationship uses the composite key
`(application_id, user_id)`. A history row therefore cannot refer to an
application with a different owner.

### Recruiting agent tables (owner only in practice)

Added by `20261113000100_agent_foundation.sql`, `20261113000200_resume_builds.sql`,
`20261113000300_complete_run.sql`,
`20261113000400_agent_profile_academic_standing.sql` and
`20261113000500_library_resume_sources.sql`. Only the `OWNER_USER_ID` account is ever
offered the tools and pages that write these, and row-level security limits
every row to its own user anyway.

- `agent_profile`: the fit-read facts (school, program, degree, graduation,
  year of study, and academic standing, which can differ from year of study),
  plus the school's first month and location for the resume's education
  heading.
- `experiences`, `stories`, `story_variants`: the story library. Built resumes
  take every employer, title, date and location from `experiences`, and its
  `section` says where each one goes (experience, projects or leadership). `char_count` is
  computed by the database.
- `templates`: one row per template (`jakes`, `zero2sudo`). `resumelol_template_ref`
  is the base resume's resume.lol id; `header_config` holds the parsed base
  resume (skeleton, CSS, page settings) saved by calibration; the three
  character targets come from measuring that base in Chrome.
- `tailored_resumes`: one per posting run. `content` is the tailored content;
  `build_count` is capped at 2 by a check constraint; `layout_check` is
  `passed`, `failed` or `skipped`, with `layout_report` saying which path ran;
  `pdf_path` and `html_path` point into the private `resumes` bucket;
  `built_markdown_sha256` and `resumelol_updated_at` guard rebuilds.
- `edit_examples`, `rules`, `answer_bank`: David's corrections, saved rules and
  application answers.
- `run_ledger`: which run steps are done per application.
- `usage_log`: bytes returned per tool call, append-only for clients.
- Additive `applications` columns: `jd_requirements`, `job_id`,
  `partner_functions`, `tailored_resume_id`, `fit_read`.

Child rows use composite `(parent_id, user_id)` foreign keys like the history
table, so no agent row can point at another user's row.

**Storage.** A private bucket, `resumes`, holds built PDFs and printable HTML
at `{user_id}/{tailored_resume_id}.pdf` and `.html`. Its four policies allow a
user only paths whose first folder is their own id. Files are served through
60-second signed links (PDF) or a sandboxed owner-only route (HTML). Account
deletion removes the owner's folder before the account is deleted.

**`public.complete_run(...)`.** One SECURITY INVOKER function that saves the
end of a run (fit read, tailored resume, new variants, answers, ledger) in one
transaction, so row-level security applies to everything it writes. See
decision record 0011.

## Controlled values

PostgreSQL enums constrain application status, normalized category, work
arrangement, and eventual classification confidence. Category is required from
the beginning but manually selected until Phase 5. Confidence remains null if no
classifier ran.

Salary is optional text with a 100-character limit. It is display-only and
excluded from analytics.

`applications.company_domain` (`20260824000100_add_company_domain.sql`) is
optional text holding the employer's canonical domain — `shopify.com`,
`rbc.com` — used only to look up a company logo. The application normalizes
input to a bare lowercase hostname before writing, so the column never holds a
scheme, a path, or a `www.` prefix; the database's own check is the 253-
character DNS limit. It is nullable with no default and no backfill: every
application saved before the column existed holds null and renders a local
lettermark instead.

Nothing in the application infers a domain from a company name: no
employer-to-domain table exists here and no model is called from the server.
An assistant connected over MCP supplies the value, which is why the column
stays nullable — an employer that cannot be identified confidently produces a
row with null rather than a failed insert or a guess.

That column needed no row-level-security change. Policies on `applications`
are owner predicates on `user_id` and apply to the whole row whatever its
columns, and the table grants are likewise table-wide.

Ticket 2.1 keeps the deployed schema unchanged even though its form treats
location and application source as optional. Blank values for those two
non-null database columns are stored as the internal sentinel `Not specified`;
the default list hides the location sentinel as absent. A future schema
migration may make these columns nullable if the product decision is revised.

## Date model

Calendar dates use `date`: application deadline, date applied, and next-action
due date. Instants use `timestamptz`: created, updated, archived, and status
changed. `archived_at` does not permanently delete an application.

## Automation

- `handle_new_user` creates a profile after an auth user is inserted.
- `set_updated_at` maintains profile/application update timestamps.
- `record_initial_application_status` creates one event after application insert.
- `record_application_status_change` runs only when the status value changes.

History belongs in triggers because every write path—including future imports or
direct Data API calls—must produce the same audit trail. Application code alone
could be bypassed or fail between the application update and history insert.

Security-definer functions use `set search_path = ''` and schema-qualify
references to prevent object-shadowing attacks.

## RLS policy matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | own row | own ID | own row, owner unchanged | own row |
| applications | own rows | `auth.uid()` owner | own rows, owner unchanged | own rows |
| status history | own application/history | explicitly denied | explicitly denied | explicitly denied |
| each agent table | own rows | `auth.uid()` owner | own rows, owner unchanged | own rows |
| usage_log | own rows | `auth.uid()` owner | not granted | not granted |
| storage `resumes` | own folder | own folder | own folder | own folder |

History table privileges grant authenticated users only `SELECT`; explicit deny
policies document all mutation operations as an additional layer. The trigger
function writes legitimate events as the database owner.

## Local migration workflow

Requires Docker:

```bash
npm run db:start
npm run db:reset
npm run test:db
```

For a linked development/staging project:

```bash
npx supabase db push --dry-run
npx supabase db push
```

Review generated SQL and target selection before applying. Never run a linked
reset against production.

## Isolation tests

`supabase/tests/001_foundation_rls.test.sql` creates User A and User B inside a
transaction. It verifies:

- profile trigger behavior;
- RLS enabled on all three tables;
- User A cannot read User B's profile;
- User B cannot read, update, or delete User A's application;
- User B cannot read User A's status history;
- ownership cannot be forged on insert;
- initial and transition events are correct;
- unrelated edits do not create history;
- authenticated clients cannot insert, update, or delete history.

The agent suites extend this: `007_agent_foundation` (RLS on every agent
table, a connected client writing its own rows, isolation, the build cap,
cascades), `008_resume_builds` (the private bucket's folder policies) and
`009_complete_run` (all or nothing, runs as the caller, drafts reused, built
resumes never overwritten) `010_agent_profile_academic_standing` (year of
study and standing stored apart, range check, isolation) and
`011_library_resume_sources` (section values, education fields, isolation).

The transaction rolls back, leaving no test data.
