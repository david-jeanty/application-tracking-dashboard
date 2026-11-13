-- Library resume sources (20261113000500_library_resume_sources.sql).
--
-- Proves the library can hold an experience's resume section and the
-- school's start month and location, that only the three known sections are
-- accepted, and that another user still cannot read either row.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '7b000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'sources-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7b000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'sources-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}', now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$
    insert into public.experiences (org, official_title, start_date, section)
    values ('Interndex', 'Founder & Product Lead', '2026-08-01', 'projects');
    insert into public.agent_profile (school, study_start, school_location)
    values ('University of Ottawa', '2023-09-01', 'Ottawa, Ontario');
  $$,
  'the owner stores a section, a study start and a school location'
);

select results_eq(
  $$ select section from public.experiences $$,
  $$ values ('projects'::text) $$,
  'the section reads back'
);

select throws_ok(
  $$ insert into public.experiences (org, official_title, start_date, section)
     values ('Somewhere', 'Something', '2025-01-01', 'awards') $$,
  '23514',
  null,
  'a section other than experience, projects or leadership is refused'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.experiences),
  0,
  'another user cannot read the experiences'
);

select is(
  (select count(*)::int from public.agent_profile),
  0,
  'another user cannot read the profile'
);

select * from finish();

rollback;
