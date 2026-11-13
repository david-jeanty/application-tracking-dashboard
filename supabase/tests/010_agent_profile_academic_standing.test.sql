-- Academic standing on the fit-read profile
-- (20261113000400_agent_profile_academic_standing.sql).
--
-- Proves the owner can store year of study and academic standing as two
-- different values, that the range check holds, and that another user still
-- cannot read the row.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'standing-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'standing-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}', now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$
    insert into public.agent_profile (school, year_of_study, academic_standing)
    values ('University of Ottawa', 4, 3)
  $$,
  'the owner stores year of study and academic standing as different values'
);

select results_eq(
  $$ select year_of_study::int, academic_standing::int from public.agent_profile $$,
  $$ values (4, 3) $$,
  'both values read back unchanged'
);

select throws_ok(
  $$ update public.agent_profile set academic_standing = 11 $$,
  '23514',
  null,
  'academic standing outside 1 to 10 is refused'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7a000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.agent_profile),
  0,
  'another user cannot read the profile'
);

select * from finish();

rollback;
