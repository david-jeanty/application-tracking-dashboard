-- complete_run (20261113000300_complete_run.sql).
--
-- Proves, against a real Postgres:
--
--   1. one call saves the fit read, the tailored resume, new variants,
--      answers and the ledger, and links the resume to the application;
--   2. it is all or nothing: one bad variant leaves no trace of the call;
--   3. it runs as the caller, so another user's application, template or
--      story is out of reach;
--   4. an unbuilt draft is reused, a built resume is never overwritten.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_function(
  'public', 'complete_run',
  array['uuid', 'text', 'jsonb', 'jsonb', 'text', 'jsonb', 'jsonb'],
  'complete_run exists'
);

select is(
  (select prosecdef from pg_proc where proname = 'complete_run'),
  false,
  'complete_run runs as the caller (security invoker)'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'run-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'run-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}', now(), now());

-- ------------------------------------------ owner, as Claude's connector ---

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

insert into public.applications (
  id, company_name, original_job_title, normalized_job_category,
  location, application_source, work_term_season
)
values (
  'a9000000-0000-0000-0000-000000000001', 'Tinder', 'Technical Program Manager Intern',
  'Project Management', 'Los Angeles, CA', 'Company website', 'Summer 2027'
);
insert into public.templates (id, name, calibrated_at)
values ('d9000000-0000-0000-0000-000000000001', 'zero2sudo', now());
insert into public.templates (id, name)
values ('d9000000-0000-0000-0000-000000000002', 'jakes');
insert into public.experiences (id, org, official_title, start_date)
values ('e9000000-0000-0000-0000-000000000001', 'IRB', 'Analyst Intern', '2026-09-01');
insert into public.stories (id, experience_id, label)
values ('59000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000001', 'Backlog');

-- A variant pointing at a story that does not exist: the whole call fails.
select throws_ok(
  $$ select public.complete_run(
       'a9000000-0000-0000-0000-000000000001', 'zero2sudo',
       '{"verdict": "strong_fit"}', '{"entries": []}', null,
       '[{"story_id": "59000000-0000-0000-0000-00000000dead", "text": "Cut it.", "style": "house"}]',
       '[{"question": "Why us?", "answer": "Because."}]') $$,
  '23503',
  null,
  'a bad variant fails the whole call'
);

select is(
  (select count(*)::int from public.tailored_resumes) + (select count(*)::int from public.answer_bank)
    + (select count(*)::int from public.run_ledger),
  0,
  'and nothing from that call was saved'
);

select throws_ok(
  $$ select public.complete_run(
       'a9000000-0000-0000-0000-000000000001', 'jakes', '{}', '{"entries": []}', null, '[]', '[]') $$,
  'P0002',
  'template not calibrated',
  'an uncalibrated template is refused'
);

select lives_ok(
  $$ select public.complete_run(
       'a9000000-0000-0000-0000-000000000001', 'zero2sudo',
       '{"verdict": "strong_fit", "summary": "Matches program management."}',
       '{"entries": [{"key": "irb", "bullets": ["Cut the backlog by 35%."]}]}',
       'Technical Program Manager Intern',
       '[{"story_id": "59000000-0000-0000-0000-000000000001", "text": "Cut the backlog by 35%.", "style": "house", "angles": ["ops"], "explain_note": "Measured in ADO."}]',
       '[{"question": "Why us?", "answer": "Because.", "tags": ["motivation"]}]') $$,
  'a full run saves'
);

select is(
  (select fit_read->>'verdict' from public.applications where id = 'a9000000-0000-0000-0000-000000000001'),
  'strong_fit',
  'the fit read is stored on the application'
);

select is(
  (select tailored_resume_id from public.applications where id = 'a9000000-0000-0000-0000-000000000001'),
  (select id from public.tailored_resumes where application_id = 'a9000000-0000-0000-0000-000000000001'),
  'the application links to its tailored resume'
);

select is(
  (select source || ':' || explain_note || ':' || array_to_string(angles, ',')
   from public.story_variants where story_id = '59000000-0000-0000-0000-000000000001'),
  'pipeline:Measured in ADO.:ops',
  'new variants are saved as pipeline variants with their explain notes'
);

select is(
  (select string_agg(step || '=' || status, ',' order by step) from public.run_ledger),
  'fit_read=done,tailor=done',
  'the fit read and tailor steps are marked done'
);

-- Saving again before any build updates the same draft.
select is(
  (select (public.complete_run(
     'a9000000-0000-0000-0000-000000000001', 'zero2sudo', '{"verdict": "stretch"}',
     '{"entries": []}', null,
     '[{"story_id": "59000000-0000-0000-0000-000000000001", "text": "Cut the backlog by 35%.", "style": "house"}]',
     '[]')->>'created')::boolean),
  false,
  'an unbuilt draft is reused'
);

select is(
  (select count(*)::int from public.tailored_resumes) * 10 + (select count(*)::int from public.story_variants),
  11,
  'still one resume, and the same wording is not saved twice'
);

-- Once built, a new run never overwrites it.
update public.tailored_resumes set build_count = 1, resumelol_resume_id = 'rl-1';

select is(
  (select (public.complete_run(
     'a9000000-0000-0000-0000-000000000001', 'zero2sudo', '{"verdict": "stretch"}',
     '{"entries": []}', null, '[]', '[]')->>'created')::boolean),
  true,
  'a built resume is left alone and a new draft is made'
);

-- ------------------------------------------------------ the other user ---

select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

insert into public.templates (name, calibrated_at) values ('zero2sudo', now());

select throws_ok(
  $$ select public.complete_run(
       'a9000000-0000-0000-0000-000000000001', 'zero2sudo', '{}', '{"entries": []}', null, '[]', '[]') $$,
  'P0002',
  'application not found',
  'another user cannot complete a run on the owner''s application'
);

insert into public.applications (
  id, company_name, original_job_title, normalized_job_category,
  location, application_source, work_term_season
)
values (
  'a9000000-0000-0000-0000-000000000002', 'Other Co', 'Analyst Intern',
  'Project Management', 'Ottawa, ON', 'Company website', 'Summer 2027'
);

select throws_ok(
  $$ select public.complete_run(
       'a9000000-0000-0000-0000-000000000002', 'zero2sudo', '{}', '{"entries": []}', null,
       '[{"story_id": "59000000-0000-0000-0000-000000000001", "text": "Planted.", "style": "house"}]',
       '[]') $$,
  '23503',
  null,
  'and cannot add a variant to the owner''s story'
);

select is(
  (select count(*)::int from public.tailored_resumes),
  0,
  'and sees none of the owner''s resumes'
);

select * from finish();
rollback;
