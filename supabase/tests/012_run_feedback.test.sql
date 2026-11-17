-- Run feedback columns (20261114000100_run_feedback.sql).
--
-- Proves the owner can record a call's request size and an interests line,
-- that negative sizes are refused, and that another user cannot read either.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '7c000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'feedback-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7c000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'feedback-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}', now(), now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$
    insert into public.usage_log (tool, response_bytes, request_bytes) values ('check_bullets', 640, 1200);
    insert into public.agent_profile (school, interests) values ('Example University', 'Guitar, rock climbing');
  $$,
  'the owner records a request size and an interests line'
);

select throws_ok(
  $$ insert into public.usage_log (tool, response_bytes, request_bytes) values ('check_bullets', 1, -1) $$,
  '23514',
  null,
  'a negative request size is refused'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"7c000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is((select count(*)::int from public.usage_log), 0, 'another user cannot read the usage log');
select is((select count(*)::int from public.agent_profile), 0, 'another user cannot read the profile');

select * from finish();

rollback;
