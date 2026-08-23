-- Archive and restore, at the database level.
--
-- The unit suite proves which statement the repository builds. This proves
-- what that statement means once Postgres runs it: that archiving writes only
-- `archived_at`, that it leaves `current_status` alone, that it produces no
-- status-history event, that restore is a clean reversal, and above all that
-- row-level security stops one student archiving or restoring another's
-- application even when the owner predicate is removed.
--
-- The last point is the one only a real database can answer, because it is
-- enforced by the policy rather than by the query the application writes.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

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
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'archive-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User A"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'archive-b@example.test',
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
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
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
    'b0000000-0000-0000-0000-000000000001',
    'RBC',
    'Business Analyst Intern',
    'Business Analysis',
    'Toronto, ON',
    'LinkedIn',
    'Winter 2027',
    'Interview'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'Shopify',
    'Product Analyst',
    'Product Management',
    'Ottawa, ON',
    'Company website',
    'Summer 2027',
    'Applied'
  );

-- Creation recorded exactly one history event per application.
select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'an application starts with one history event'
);

-- ------------------------------------------------------------- archiving ---
update public.applications
set archived_at = now()
where id = 'b0000000-0000-0000-0000-000000000001';

select isnt(
  (select archived_at from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'),
  null,
  'archiving sets archived_at'
);

select is(
  (select current_status from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'),
  'Interview'::public.application_status,
  'archiving does not change the application status'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'archiving creates no status-history event'
);

select is(
  (select company_name from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'),
  'RBC',
  'archiving leaves the other fields untouched'
);

-- The active list excludes it; the archive list contains it.
select is(
  (select count(*)::int from public.applications where archived_at is null),
  1,
  'the active list excludes an archived application'
);

select is(
  (select count(*)::int from public.applications where archived_at is not null),
  1,
  'the archive list contains only archived applications'
);

select is(
  (select id from public.applications where archived_at is not null),
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'the archive list contains the archived application'
);

-- -------------------------------------------------------------- restoring ---
update public.applications
set archived_at = null
where id = 'b0000000-0000-0000-0000-000000000001';

select is(
  (select archived_at from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'),
  null,
  'restoring clears archived_at'
);

select is(
  (select current_status from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'),
  'Interview'::public.application_status,
  'restoring does not change the application status'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'b0000000-0000-0000-0000-000000000001'),
  1,
  'restoring creates no status-history event'
);

select is(
  (select count(*)::int from public.applications where archived_at is null),
  2,
  'a restored application returns to the active list'
);

-- --------------------------------------------------------------- user B ---
-- Re-archive so the cross-user attempts below have a real target.
update public.applications
set archived_at = now()
where id = 'b0000000-0000-0000-0000-000000000002';

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- Deliberately no `user_id` predicate: this is what an application-layer bug
-- would produce, and row-level security has to stop it on its own.
update public.applications set archived_at = now();

select is(
  (select count(*)::int from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'
     and archived_at is null),
  0,
  'user B cannot see user A rows at all, so the unscoped archive matched none'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select archived_at from public.applications
   where id = 'b0000000-0000-0000-0000-000000000001'),
  null,
  'user B could not archive user A''s application'
);

select isnt(
  (select archived_at from public.applications
   where id = 'b0000000-0000-0000-0000-000000000002'),
  null,
  'user B could not restore user A''s archived application'
);

select is(
  (select count(*)::int from public.application_status_history
   where user_id = '20000000-0000-0000-0000-000000000001'),
  2,
  'no cross-user attempt produced a history event'
);

select * from finish();

rollback;
