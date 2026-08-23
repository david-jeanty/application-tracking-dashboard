-- Quick status and next-action updates, at the database level.
--
-- The unit suite proves which statement each mutation builds. This proves what
-- those statements mean once Postgres runs them, and covers what only a real
-- database can answer:
--
--   1. that a genuine status change records exactly one history event, and
--      re-saving the status already stored records none — the trigger is
--      declared `after update of current_status ... when (old.current_status
--      is distinct from new.current_status)`, and the quick control relies on
--      that rather than deduplicating in application code.
--
--   2. that a next-action update produces no status-history event at all,
--      because the statement never names `current_status`.
--
--   3. that row-level security stops one student updating another's row even
--      when the `user_id` predicate is removed from the statement.
--
--   4. that the `archived_at is null` predicate genuinely excludes archived
--      rows. Unlike the delete path, this rule is doubly not RLS's job:
--      `applications_update_own` permits an owner to update any of their own
--      rows, archived included — as it must, since archive and restore are
--      themselves updates. The active-only rule for quick updates lives in the
--      repository's predicate, so that predicate is not redundant and must not
--      be removed.

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
    '40000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'quick-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User A"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'quick-b@example.test',
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
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
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
    'd0000000-0000-0000-0000-000000000001',
    'RBC',
    'Business Analyst Intern',
    'Business Analysis',
    'Toronto, ON',
    'LinkedIn',
    'Winter 2027',
    'Applied'
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    'Shopify',
    'Product Analyst',
    'Product Management',
    'Ottawa, ON',
    'Company website',
    'Summer 2027',
    'Applied'
  );

-- The insert trigger writes one initial event per application.
select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'),
  1,
  'a new application starts with its single initial history event'
);

-- ------------------------------------------ a real status change is logged ---
-- Exactly the statement the repository builds for a quick status update.
update public.applications
set current_status = 'Interview'
where id = 'd0000000-0000-0000-0000-000000000001'
  and user_id = '40000000-0000-0000-0000-000000000001'
  and archived_at is null;

select is(
  (select current_status::text from public.applications
   where id = 'd0000000-0000-0000-0000-000000000001'),
  'Interview',
  'the status is now what the student chose'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'),
  2,
  'a real status change adds exactly one history event'
);

select is(
  (select previous_status::text from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'
     and previous_status is not null),
  'Applied',
  'the new event records the status it moved from'
);

-- --------------------------------- re-saving the same status logs nothing ---
update public.applications
set current_status = 'Interview'
where id = 'd0000000-0000-0000-0000-000000000001'
  and user_id = '40000000-0000-0000-0000-000000000001'
  and archived_at is null;

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'),
  2,
  'submitting the status already stored creates no duplicate history event'
);

-- ------------------------------------------ moving backward is permitted ---
update public.applications
set current_status = 'Applied'
where id = 'd0000000-0000-0000-0000-000000000001'
  and user_id = '40000000-0000-0000-0000-000000000001'
  and archived_at is null;

select is(
  (select current_status::text from public.applications
   where id = 'd0000000-0000-0000-0000-000000000001'),
  'Applied',
  'nothing enforces a linear progression, so a student may move backward'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'),
  3,
  'the backward move is recorded like any other real change'
);

-- ---------------------------- a next-action update logs no status history ---
update public.applications
set next_action = 'Follow up with recruiter',
    next_action_due_date = '2026-09-01'
where id = 'd0000000-0000-0000-0000-000000000001'
  and user_id = '40000000-0000-0000-0000-000000000001'
  and archived_at is null;

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'),
  3,
  'saving a next action creates no status-history event'
);

select is(
  (select current_status::text from public.applications
   where id = 'd0000000-0000-0000-0000-000000000001'),
  'Applied',
  'saving a next action leaves the status exactly as it was'
);

-- Clearing writes both columns null, which is what the repository sends when
-- the action is empty.
update public.applications
set next_action = null,
    next_action_due_date = null
where id = 'd0000000-0000-0000-0000-000000000001'
  and user_id = '40000000-0000-0000-0000-000000000001'
  and archived_at is null;

select ok(
  (select next_action is null and next_action_due_date is null
   from public.applications
   where id = 'd0000000-0000-0000-0000-000000000001'),
  'clearing the next action leaves no orphaned due date behind'
);

-- ------------------------------------- archived rows are out of the flow ---
update public.applications
set archived_at = now()
where id = 'd0000000-0000-0000-0000-000000000002';

update public.applications
set current_status = 'Offer'
where id = 'd0000000-0000-0000-0000-000000000002'
  and user_id = '40000000-0000-0000-0000-000000000001'
  and archived_at is null;

select is(
  (select current_status::text from public.applications
   where id = 'd0000000-0000-0000-0000-000000000002'),
  'Applied',
  'the archived_at predicate stops a quick status update on an archived row'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000002'),
  1,
  'the blocked update recorded no history event'
);

-- The rule is the repository's, not the policy's: archive and restore are
-- themselves updates, so the update policy cannot exclude archived rows.
-- Recorded so nobody later drops that predicate believing RLS covers it.
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'applications'
      and cmd = 'UPDATE'
      and qual not ilike '%archived_at%'
  ),
  'the update policy does not itself restrict updates to active rows'
);

-- --------------------------------------------------------------- user B ---
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

-- Deliberately no owner predicate: this is what an application-layer bug would
-- produce, and row-level security has to stop it on its own.
update public.applications
set current_status = 'Rejected',
    next_action = 'Nothing to do'
where archived_at is null;

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select current_status::text from public.applications
   where id = 'd0000000-0000-0000-0000-000000000001'),
  'Applied',
  'user B''s unscoped update could not change user A''s status'
);

select ok(
  (select next_action is null from public.applications
   where id = 'd0000000-0000-0000-0000-000000000001'),
  'user B''s unscoped update could not set user A''s next action'
);

select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'd0000000-0000-0000-0000-000000000001'),
  3,
  'the rejected cross-user update recorded no history event'
);

select * from finish();

rollback;
