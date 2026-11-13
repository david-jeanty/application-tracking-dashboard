-- Recruiting agent foundation (Spec 1, docs/SPEC-1-foundation-and-resume.md).
--
-- Additive only: ten new tables and four nullable columns on `applications`.
-- No existing column, policy, or grant changes, and every existing row is
-- untouched (the new columns are null with no backfill, as `company_domain`
-- was).
--
-- Who can reach these rows. The agent is offered to one account only (the
-- `OWNER_USER_ID` gate in `lib/agent/owner.ts`), but the database does not
-- rely on that: every table here has row-level security scoped to its own
-- `user_id`, exactly like `applications`. A user can only ever reach their own
-- rows, whatever the application layer decides to offer.
--
-- Connected clients. The agent runs in Claude, whose access token carries a
-- `client_id` claim. The restrictive policies in
-- `20260908000100_oauth_client_authority.sql` and
-- `20260910000100_oauth_client_profile_reads.sql` cover `applications` and
-- `profiles` only, and stay exactly as they are. These tables get no such
-- restriction because the connector is the agent's runtime: it has to read
-- and write the library, the ledger and the resumes.
--
-- That is also why `agent_profile` exists. The fit read needs a few facts
-- about the student (graduation, degree, year of study), and a client session
-- is not allowed to read `profiles`. Rather than loosen that, the facts the
-- agent needs live in their own owner-scoped row.
--
-- Ownership pattern. Child rows point at their parent through a composite key
-- `(parent_id, user_id)`, the same pattern `application_status_history` uses,
-- so a row can never reference a parent that belongs to someone else. Every
-- `user_id` defaults to `auth.uid()`, so no write path has to send one.
--
-- Optional parent links use `on delete set null (column)`, which nulls only
-- the link column and leaves the owner column alone (PostgreSQL 15+).

-- ------------------------------------------------------------ agent_profile --

create table public.agent_profile (
  user_id uuid primary key default auth.uid()
    references public.profiles (user_id) on delete cascade,
  school text,
  program text,
  degree_level text,
  expected_graduation date,
  year_of_study smallint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_profile_school_length
    check (school is null or char_length(btrim(school)) between 1 and 160),
  constraint agent_profile_program_length
    check (program is null or char_length(btrim(program)) between 1 and 160),
  constraint agent_profile_degree_level_length
    check (degree_level is null or char_length(btrim(degree_level)) between 1 and 80),
  constraint agent_profile_year_of_study_range
    check (year_of_study is null or year_of_study between 1 and 10),
  constraint agent_profile_notes_length
    check (notes is null or char_length(notes) <= 2000)
);

comment on table public.agent_profile is
  'Facts the recruiting agent''s fit read checks a posting against. Separate from profiles because connected clients may not read profiles.';

-- -------------------------------------------------------------- experiences --

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  org text not null,
  official_title text not null,
  start_date date not null,
  -- Null means the role is current.
  end_date date,
  location text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiences_id_user_id_unique unique (id, user_id),
  -- The natural key the one-time import dedupes on.
  constraint experiences_natural_key
    unique (user_id, org, official_title, start_date),
  constraint experiences_org_length
    check (char_length(btrim(org)) between 1 and 160),
  constraint experiences_official_title_length
    check (char_length(btrim(official_title)) between 1 and 200),
  constraint experiences_location_length
    check (location is null or char_length(btrim(location)) between 1 and 200),
  constraint experiences_dates_ordered
    check (end_date is null or end_date >= start_date)
);

-- ------------------------------------------------------------------ stories --

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  experience_id uuid not null,
  label text not null,
  summary text,
  -- Angles this story can be told from: product, ops, consulting, marketing, data.
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stories_id_user_id_unique unique (id, user_id),
  constraint stories_experience_owner_fk
    foreign key (experience_id, user_id)
    references public.experiences (id, user_id)
    on delete cascade,
  constraint stories_natural_key unique (experience_id, label),
  constraint stories_label_length
    check (char_length(btrim(label)) between 1 and 120),
  constraint stories_summary_length
    check (summary is null or char_length(summary) <= 2000),
  constraint stories_tags_count check (cardinality(tags) <= 20)
);

-- ---------------------------------------------------------- story_variants --

create table public.story_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  story_id uuid not null,
  text text not null,
  style text not null,
  angles text[] not null default '{}',
  template_fit text[] not null default '{}',
  -- Computed by the database so it can never disagree with the text.
  char_count integer generated always as (char_length(text)) stored,
  is_gold boolean not null default false,
  source text not null,
  explain_note text,
  created_at timestamptz not null default now(),
  constraint story_variants_id_user_id_unique unique (id, user_id),
  constraint story_variants_story_owner_fk
    foreign key (story_id, user_id)
    references public.stories (id, user_id)
    on delete cascade,
  -- Saving the same wording twice is a no-op, which keeps the import idempotent.
  constraint story_variants_natural_key unique (story_id, text),
  constraint story_variants_text_length
    check (char_length(btrim(text)) between 1 and 600),
  constraint story_variants_style_value
    check (style in ('house', 'story_voice')),
  constraint story_variants_source_value
    check (source in ('import', 'library_session', 'pipeline', 'edited')),
  constraint story_variants_explain_note_length
    check (explain_note is null or char_length(explain_note) <= 500),
  constraint story_variants_angles_count check (cardinality(angles) <= 20),
  constraint story_variants_template_fit_count
    check (cardinality(template_fit) <= 10)
);

-- ---------------------------------------------------------------- templates --

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  name text not null,
  resumelol_template_ref text,
  use_for text[] not null default '{}',
  -- Character targets for line fill. Null until calibrated or seeded.
  one_line_chars integer,
  two_line_min integer,
  two_line_max integer,
  header_config jsonb not null default '{}'::jsonb,
  calibrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint templates_id_user_id_unique unique (id, user_id),
  constraint templates_natural_key unique (user_id, name),
  constraint templates_name_value check (name in ('jakes', 'zero2sudo')),
  constraint templates_ref_length
    check (
      resumelol_template_ref is null
      or char_length(btrim(resumelol_template_ref)) between 1 and 200
    ),
  constraint templates_header_config_object
    check (jsonb_typeof(header_config) = 'object'),
  constraint templates_targets_positive
    check (
      (one_line_chars is null or one_line_chars between 20 and 400)
      and (two_line_min is null or two_line_min between 20 and 800)
      and (two_line_max is null or two_line_max between 20 and 800)
      and (
        two_line_min is null or two_line_max is null
        or two_line_min <= two_line_max
      )
    )
);

-- --------------------------------------------- applications (additive only) --

alter table public.applications
  add column jd_requirements jsonb,
  add column job_id text,
  add column partner_functions text[],
  add column tailored_resume_id uuid;

alter table public.applications
  add constraint applications_jd_requirements_array
    check (jd_requirements is null or jsonb_typeof(jd_requirements) = 'array'),
  add constraint applications_job_id_length
    check (job_id is null or char_length(btrim(job_id)) between 1 and 100),
  add constraint applications_partner_functions_count
    check (partner_functions is null or cardinality(partner_functions) <= 20);

comment on column public.applications.jd_requirements is
  'Recruiting agent: the posting''s stated requirements, as extracted by the assistant. Null for applications the agent never ran on.';
comment on column public.applications.job_id is
  'Recruiting agent: the employer''s own posting id, used with company and title to dedupe.';
comment on column public.applications.partner_functions is
  'Recruiting agent: the functions the posting says this role works with.';
comment on column public.applications.tailored_resume_id is
  'Recruiting agent: the tailored resume linked to this application.';

create index applications_user_job_id_idx
  on public.applications (user_id, job_id)
  where job_id is not null;

-- --------------------------------------------------------- tailored_resumes --

create table public.tailored_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  application_id uuid not null,
  template_id uuid not null,
  content jsonb not null,
  mirrored_title text,
  resumelol_resume_id text,
  resumelol_url text,
  pdf_path text,
  status text not null default 'draft',
  -- The 2-build cap lives here as well as in code.
  build_count smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tailored_resumes_id_user_id_unique unique (id, user_id),
  constraint tailored_resumes_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete cascade,
  constraint tailored_resumes_template_owner_fk
    foreign key (template_id, user_id)
    references public.templates (id, user_id),
  constraint tailored_resumes_content_object
    check (jsonb_typeof(content) = 'object'),
  constraint tailored_resumes_status_value
    check (status in ('draft', 'built', 'edited')),
  constraint tailored_resumes_build_cap check (build_count between 0 and 2),
  constraint tailored_resumes_mirrored_title_length
    check (mirrored_title is null or char_length(btrim(mirrored_title)) between 1 and 200),
  constraint tailored_resumes_resumelol_url_length
    check (resumelol_url is null or char_length(resumelol_url) <= 2048),
  constraint tailored_resumes_pdf_path_length
    check (pdf_path is null or char_length(pdf_path) <= 300)
);

create index tailored_resumes_user_created_idx
  on public.tailored_resumes (user_id, created_at desc);
create index tailored_resumes_application_idx
  on public.tailored_resumes (user_id, application_id);

alter table public.applications
  add constraint applications_tailored_resume_owner_fk
    foreign key (tailored_resume_id, user_id)
    references public.tailored_resumes (id, user_id)
    on delete set null (tailored_resume_id);

-- ------------------------------------------------------------ edit_examples --

create table public.edit_examples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  variant_id uuid,
  before_text text not null,
  after_text text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint edit_examples_variant_owner_fk
    foreign key (variant_id, user_id)
    references public.story_variants (id, user_id)
    on delete set null (variant_id),
  constraint edit_examples_before_length
    check (char_length(before_text) between 1 and 2000),
  constraint edit_examples_after_length
    check (char_length(after_text) between 1 and 2000),
  constraint edit_examples_note_length
    check (note is null or char_length(note) <= 500)
);

create index edit_examples_user_created_idx
  on public.edit_examples (user_id, created_at desc);

-- -------------------------------------------------------------------- rules --

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  scope text not null,
  text text not null,
  created_at timestamptz not null default now(),
  -- The same instruction saved twice is one rule.
  constraint rules_natural_key unique (user_id, scope, text),
  constraint rules_scope_value check (scope in ('bullets', 'outreach', 'all')),
  constraint rules_text_length check (char_length(btrim(text)) between 1 and 500)
);

-- -------------------------------------------------------------- answer_bank --

create table public.answer_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  question text not null,
  answer text not null,
  application_id uuid,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint answer_bank_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete set null (application_id),
  constraint answer_bank_question_length
    check (char_length(btrim(question)) between 1 and 1000),
  constraint answer_bank_answer_length
    check (char_length(btrim(answer)) between 1 and 5000),
  constraint answer_bank_tags_count check (cardinality(tags) <= 20)
);

-- --------------------------------------------------------------- run_ledger --

create table public.run_ledger (
  user_id uuid not null default auth.uid(),
  application_id uuid not null,
  -- Step names are validated in `lib/agent/ledger.ts`, so Spec 2 can add its
  -- people and outreach steps without another migration.
  step text not null,
  status text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (application_id, step),
  constraint run_ledger_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete cascade,
  constraint run_ledger_step_format check (step ~ '^[a-z][a-z_]{0,39}$'),
  constraint run_ledger_status_value
    check (status in ('started', 'done', 'failed', 'skipped')),
  constraint run_ledger_count_nonnegative check (count >= 0)
);

-- ---------------------------------------------------------------- usage_log --

create table public.usage_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  application_id uuid,
  tool text not null,
  response_bytes integer not null,
  created_at timestamptz not null default now(),
  constraint usage_log_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete set null (application_id),
  constraint usage_log_tool_format check (tool ~ '^[a-z][a-z_]{0,63}$'),
  constraint usage_log_response_bytes_nonnegative check (response_bytes >= 0)
);

create index usage_log_user_application_idx
  on public.usage_log (user_id, application_id, created_at);

-- ---------------------------------------------------------- updated_at upkeep --

create trigger agent_profile_set_updated_at
before update on public.agent_profile
for each row execute function public.set_updated_at();

create trigger experiences_set_updated_at
before update on public.experiences
for each row execute function public.set_updated_at();

create trigger stories_set_updated_at
before update on public.stories
for each row execute function public.set_updated_at();

create trigger templates_set_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

create trigger tailored_resumes_set_updated_at
before update on public.tailored_resumes
for each row execute function public.set_updated_at();

create trigger answer_bank_set_updated_at
before update on public.answer_bank
for each row execute function public.set_updated_at();

create trigger run_ledger_set_updated_at
before update on public.run_ledger
for each row execute function public.set_updated_at();

-- ------------------------------------------------------- row-level security --
--
-- Four owner policies per table, the same predicate `applications` uses. The
-- `with check` on update stops a row being handed to another owner.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agent_profile',
    'experiences',
    'stories',
    'story_variants',
    'templates',
    'tailored_resumes',
    'edit_examples',
    'rules',
    'answer_bank',
    'run_ledger',
    'usage_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name || '_select_own', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name || '_insert_own', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name || '_update_own', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name || '_delete_own', table_name
    );

    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

grant select, insert, update, delete on
  public.agent_profile,
  public.experiences,
  public.stories,
  public.story_variants,
  public.templates,
  public.tailored_resumes,
  public.edit_examples,
  public.rules,
  public.answer_bank,
  public.run_ledger
to authenticated;

-- The usage log is append-only for clients: it is a record of what tool calls
-- returned, and nothing should rewrite it after the fact.
grant select, insert on public.usage_log to authenticated;
