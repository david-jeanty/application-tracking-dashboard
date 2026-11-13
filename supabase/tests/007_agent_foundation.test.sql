-- Recruiting agent tables (20261113000100_agent_foundation.sql).
--
-- Proves, against a real Postgres:
--
--   1. every agent table has row-level security on, with the four owner
--      policies;
--   2. a connected client's session (Claude, carrying `client_id`) can read
--      and write its own agent rows, because the connector is the agent's
--      runtime;
--   3. another user can neither see, change, nor point at those rows, and
--      cannot write a row in someone else's name;
--   4. the constraints the code relies on hold in the database too: the
--      2-build cap, the computed character count, duplicate wording, allowed
--      values, and the append-only usage log;
--   5. deleting an application cascades to its resume and ledger and keeps
--      the usage history with the link cleared.

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- ------------------------------------------------------------- structure ---

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'agent_profile', 'experiences', 'stories', 'story_variants',
        'templates', 'tailored_resumes', 'edit_examples', 'rules',
        'answer_bank', 'run_ledger', 'usage_log'
      ])
      and c.relrowsecurity
  ),
  11,
  'all eleven agent tables have row-level security enabled'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'agent_profile', 'experiences', 'stories', 'story_variants',
        'templates', 'tailored_resumes', 'edit_examples', 'rules',
        'answer_bank', 'run_ledger', 'usage_log'
      ])
  ),
  44,
  'each agent table carries exactly the four owner policies'
);

select has_column('public', 'applications', 'jd_requirements', 'applications gains jd_requirements');
select has_column('public', 'applications', 'tailored_resume_id', 'applications gains tailored_resume_id');

-- ----------------------------------------------------------------- users ---

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'agent-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'agent-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}', now(), now());

-- ------------------------------------------ owner, as Claude's connector ---

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$
    insert into public.agent_profile (school, program, degree_level, expected_graduation, year_of_study)
    values ('University of Ottawa', 'Business Technology Management', 'Bachelor''s', '2028-05-01', 3);

    insert into public.applications (
      id, company_name, original_job_title, normalized_job_category,
      location, application_source, work_term_season,
      jd_requirements, job_id, partner_functions
    )
    values (
      'a7000000-0000-0000-0000-000000000001', 'Tinder', 'Technical Program Manager Intern',
      'Project Management', 'Los Angeles, CA', 'Company website', 'Summer 2027',
      '["Program management", "SQL"]'::jsonb, 'JR-1234', array['Engineering']
    );

    insert into public.experiences (id, org, official_title, start_date, end_date, location)
    values ('e7000000-0000-0000-0000-000000000001', 'IRB',
            'Information Management Analyst Intern', '2025-05-01', '2025-08-31', 'Ottawa, ON');

    insert into public.stories (id, experience_id, label, tags)
    values ('57000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001',
            'Ticket backlog', array['ops', 'product']);

    insert into public.story_variants (id, story_id, text, style, source, is_gold)
    values ('b7000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001',
            'Reduced the open ticket backlog by 35%.', 'house', 'import', true);

    insert into public.templates (id, name, one_line_chars, two_line_min, two_line_max)
    values ('d7000000-0000-0000-0000-000000000001', 'zero2sudo', 110, 199, 220);

    insert into public.tailored_resumes (id, application_id, template_id, content)
    values ('f7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001',
            'd7000000-0000-0000-0000-000000000001', '{"sections": []}'::jsonb);

    update public.applications
    set tailored_resume_id = 'f7000000-0000-0000-0000-000000000001'
    where id = 'a7000000-0000-0000-0000-000000000001';

    insert into public.edit_examples (variant_id, before_text, after_text)
    values ('b7000000-0000-0000-0000-000000000001', 'Helped reduce tickets.', 'Reduced tickets.');

    insert into public.rules (scope, text) values ('bullets', 'Never use "spearheaded"');

    insert into public.answer_bank (question, answer, application_id)
    values ('Why this team?', 'Because the role partners with engineering.',
            'a7000000-0000-0000-0000-000000000001');

    insert into public.run_ledger (application_id, step, status, count)
    values ('a7000000-0000-0000-0000-000000000001', 'fit_read', 'done', 1);

    insert into public.usage_log (application_id, tool, response_bytes)
    values ('a7000000-0000-0000-0000-000000000001', 'get_playbook', 4096);
  $$,
  'a connected client writes every agent table for its own user'
);

select is(
  (select user_id::text from public.stories where id = '57000000-0000-0000-0000-000000000001'),
  '70000000-0000-0000-0000-000000000001',
  'user_id is filled from the token, not sent by the writer'
);

select is(
  (select char_count from public.story_variants where id = 'b7000000-0000-0000-0000-000000000001'),
  char_length('Reduced the open ticket backlog by 35%.'),
  'char_count is computed by the database'
);

select throws_ok(
  $$ update public.story_variants set char_count = 5 where id = 'b7000000-0000-0000-0000-000000000001' $$,
  '428C9',
  null,
  'char_count cannot be written directly'
);

select throws_ok(
  $$ insert into public.story_variants (story_id, text, style, source)
     values ('57000000-0000-0000-0000-000000000001', 'Reduced the open ticket backlog by 35%.', 'house', 'pipeline') $$,
  '23505',
  null,
  'the same wording cannot be saved twice for one story'
);

select throws_ok(
  $$ insert into public.story_variants (story_id, text, style, source)
     values ('57000000-0000-0000-0000-000000000001', 'Another wording.', 'casual', 'pipeline') $$,
  '23514',
  null,
  'style must be house or story_voice'
);

select lives_ok(
  $$ update public.tailored_resumes set build_count = 2 where id = 'f7000000-0000-0000-0000-000000000001' $$,
  'two builds are allowed'
);

select throws_ok(
  $$ update public.tailored_resumes set build_count = 3 where id = 'f7000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'a third build is refused by the database'
);

select throws_ok(
  $$ insert into public.run_ledger (application_id, step, status)
     values ('a7000000-0000-0000-0000-000000000001', 'Fit Read!', 'done') $$,
  '23514',
  null,
  'ledger step names are lowercase identifiers'
);

select throws_ok(
  $$ update public.usage_log set response_bytes = 0 $$,
  '42501',
  null,
  'the usage log cannot be rewritten'
);

select throws_ok(
  $$ delete from public.usage_log $$,
  '42501',
  null,
  'the usage log cannot be deleted from'
);

select throws_ok(
  $$ insert into public.rules (scope, text) values ('people', 'Anything') $$,
  '23514',
  null,
  'rule scope must be bullets, outreach or all'
);

-- --------------------------------------------------------- another user ---

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

select is(
  (
    (select count(*) from public.agent_profile)
    + (select count(*) from public.experiences)
    + (select count(*) from public.stories)
    + (select count(*) from public.story_variants)
    + (select count(*) from public.templates)
    + (select count(*) from public.tailored_resumes)
    + (select count(*) from public.edit_examples)
    + (select count(*) from public.rules)
    + (select count(*) from public.answer_bank)
    + (select count(*) from public.run_ledger)
    + (select count(*) from public.usage_log)
  )::int,
  0,
  'another user sees none of the owner''s agent rows'
);

update public.story_variants set text = 'Rewritten by someone else.'
where id = 'b7000000-0000-0000-0000-000000000001';
update public.tailored_resumes set build_count = 0
where id = 'f7000000-0000-0000-0000-000000000001';
delete from public.rules;

select throws_ok(
  $$ insert into public.rules (user_id, scope, text)
     values ('70000000-0000-0000-0000-000000000001', 'all', 'Planted rule') $$,
  '42501',
  null,
  'another user cannot write a rule in the owner''s name'
);

select throws_ok(
  $$ insert into public.stories (experience_id, label)
     values ('e7000000-0000-0000-0000-000000000001', 'Borrowed story') $$,
  '23503',
  null,
  'another user cannot attach a story to the owner''s experience'
);

insert into public.applications (
  id, company_name, original_job_title, normalized_job_category,
  location, application_source, work_term_season
)
values (
  'a7000000-0000-0000-0000-000000000002', 'Pinterest', 'Strategy Intern',
  'Strategy and Operations', 'San Francisco, CA', 'LinkedIn', 'Summer 2027'
);

select throws_ok(
  $$ update public.applications
     set tailored_resume_id = 'f7000000-0000-0000-0000-000000000001'
     where id = 'a7000000-0000-0000-0000-000000000002' $$,
  '23503',
  null,
  'another user cannot link the owner''s resume to their own application'
);

select throws_ok(
  $$ insert into public.tailored_resumes (application_id, template_id, content)
     values ('a7000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000001', '{}'::jsonb) $$,
  '23503',
  null,
  'another user cannot build on the owner''s template'
);

-- ------------------------------------------------- back to the owner ---

select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select text from public.story_variants where id = 'b7000000-0000-0000-0000-000000000001'),
  'Reduced the open ticket backlog by 35%.',
  'the other user''s update changed nothing'
);

select is(
  (select build_count::int from public.tailored_resumes where id = 'f7000000-0000-0000-0000-000000000001'),
  2,
  'the other user could not reset the build count'
);

select is(
  (select count(*)::int from public.rules),
  1,
  'the other user''s delete removed nothing'
);

select is(
  (select count(*)::int from public.applications),
  1,
  'the owner does not see the other user''s application'
);

-- The application is deleted from the owner's own web session (clients may
-- not delete applications, by the existing restrictive policy).
delete from public.applications where id = 'a7000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.tailored_resumes),
  0,
  'deleting an application deletes its tailored resume'
);

select is(
  (select count(*)::int from public.run_ledger),
  0,
  'deleting an application deletes its ledger'
);

select is(
  (select application_id from public.usage_log),
  null,
  'usage history is kept with its application link cleared'
);

select is(
  (select application_id from public.answer_bank),
  null,
  'saved answers are kept with their application link cleared'
);

select is(
  (select count(*)::int from public.story_variants),
  1,
  'the story library is independent of applications'
);

select is(
  (select variant_id::text from public.edit_examples),
  'b7000000-0000-0000-0000-000000000001',
  'edit examples keep their variant link'
);

select * from finish();

rollback;
