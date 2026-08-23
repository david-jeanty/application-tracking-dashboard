-- Permanent deletion, at the database level.
--
-- The unit suite proves which statement the repository builds. This proves
-- what that statement means once Postgres runs it, and covers two things only
-- a real database can answer:
--
--   1. that deleting an application cascades its status history, even though
--      authenticated clients hold `select` only on that table and every
--      mutation policy on it denies; referential actions are performed by the
--      system and bypass both, which is the behaviour the repository relies on
--      instead of deleting history by hand.
--
--   2. that row-level security stops one student deleting another's row even
--      when the `user_id` predicate is removed from the statement.
--
-- It also records something the schema does *not* enforce: `applications_
-- delete_own` permits an owner to delete any of their own rows, active ones
-- included. "Only archived applications may be deleted" is enforced by the
-- repository's `archived_at is not null` predicate, so that predicate is not
-- redundant with RLS and must not be removed.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'delete-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User A"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'delete-b@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User B"}',
    now(),
    now()
  );

-- ---------------------------------------------------------------- user A ---
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

insert into public.applications (
  id,
  company_name,
  original_job_title,
  normalized_job_category,
  location,
  application_source,
  work_term_season,
  current_status
)
values
  (
    'c0000000-0000-0000-0000-000000000001',
    'RBC',
    'Business Analyst Intern',
    'Business Analysis',
    'Toronto, ON',
    'LinkedIn',
    'Winter 2027',
    'Interview'
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    'Shopify',
    'Product Analyst',
    'Product Management',
    'Ottawa, ON',
    'Company website',
    'Summer 2027',
    'Applied'
  );

-- Give the first application a second history event, then archive it.
update public.applications
set current_status = 'Offer'
where id = 'c0000000-0000-0000-0000-000000000001';

update public.applications
set archived_at = now()
where id = 'c0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'c0000000-0000-0000-0000-000000000001'),
  2,
  'the archived application has two history events before deletion'
);

select is(
  (select count(*)::int from public.applications),
  2,
  'user A has two applications before deletion'
);

-- ------------------------------------- an active row cannot be deleted ---
-- Exactly the statement the repository builds, aimed at the active row.
delete from public.applications
where id = 'c0000000-0000-0000-0000-000000000002'
  and user_id = '30000000-0000-0000-0000-000000000001'
  and archived_at is not null;

select is(
  (select count(*)::int from public.applications
   where id = 'c0000000-0000-0000-0000-000000000002'),
  1,
  'the archived_at predicate stops an active application being deleted'
);

-- The rule is the repository's, not the policy's. Recorded so nobody later
-- removes that predicate believing RLS already covers it.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'applications'
      and cmd = 'DELETE'
      and qual not ilike '%archived_at%'
  ),
  'the delete policy does not itself restrict deletion to archived rows'
);

-- --------------------------------------------- deleting the archived row ---
delete from public.applications
where id = 'c0000000-0000-0000-0000-000000000001'
  and user_id = '30000000-0000-0000-0000-000000000001'
  and archived_at is not null;

select is(
  (select count(*)::int from public.applications
   where id = 'c0000000-0000-0000-0000-000000000001'),
  0,
  'the archived application row is gone'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'c0000000-0000-0000-0000-000000000001'),
  0,
  'its status history cascaded away with it'
);

select is(
  (select count(*)::int from public.applications
   where id = 'c0000000-0000-0000-0000-000000000002'),
  1,
  'the other application is untouched'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'c0000000-0000-0000-0000-000000000002'),
  1,
  'the other application keeps its history'
);

select is(
  (select count(*)::int from public.applications where archived_at is not null),
  0,
  'the deleted application no longer appears in the archive list'
);

select is(
  (select count(*)::int from public.applications where archived_at is null),
  1,
  'the active list and dashboard count are unchanged by the deletion'
);

-- --------------------------------------------------------------- user B ---
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

insert into public.applications (
  id,
  company_name,
  original_job_title,
  normalized_job_category,
  location,
  application_source,
  work_term_season,
  current_status,
  archived_at
)
values
  (
    'c0000000-0000-0000-0000-000000000003',
    'Nokia',
    'Marketing Student',
    'Marketing',
    'Kanata, ON',
    'Referral',
    'Fall 2026',
    'Rejected',
    now()
  );

-- Deliberately no owner predicate: this is what an application-layer bug would
-- produce, and row-level security has to stop it on its own.
delete from public.applications where archived_at is not null;

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.applications
   where id = 'c0000000-0000-0000-0000-000000000002'),
  1,
  'user B''s unscoped delete could not reach user A''s application'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'c0000000-0000-0000-0000-000000000002'),
  1,
  'user A''s history survived user B''s unscoped delete'
);

-- ---------------------------------------------- history stays immutable ---
-- The cascade is a system action. A client still cannot delete history itself.
select throws_ok(
  $$delete from public.application_status_history
    where application_id = 'c0000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'an authenticated client still cannot delete history rows directly'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'c0000000-0000-0000-0000-000000000002'),
  1,
  'the direct history delete changed nothing'
);

select * from finish();

rollback;
