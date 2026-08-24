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
lettermark instead. Nothing infers a domain from a company name.

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

The transaction rolls back, leaving no test data.
