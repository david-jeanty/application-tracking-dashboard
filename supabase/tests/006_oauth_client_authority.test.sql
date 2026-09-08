-- What a connected OAuth client may do, at the database level.
--
-- An OAuth grant (a connected assistant over MCP, the Interndex Capture
-- extension) is an ordinary Supabase user token, distinguished from the
-- student's own web session by one thing: Supabase Auth's OAuth 2.1 server
-- writes the client's id into the access token as a top-level `client_id`
-- claim, and a password or session login carries none. PostgREST verifies the
-- token and exposes its claims as `request.jwt.claims`, which is what this
-- test sets — the same shape the tokens the OAuth server actually issues were
-- seen to have when the gap was reproduced against a running stack
-- (`tests/integration/oauth-client-authority.test.ts` does that end to end).
--
-- This proves the ceiling the consent screen promises
-- (`lib/mcp/capabilities.ts`), and only that ceiling:
--
--   1. a client session cannot delete an application, archive one, restore
--      one, create one already archived, or write the profile — whichever
--      client it is, the extension's or an assistant's;
--   2. a client session can still read, add, and update an application's
--      details, including the details of an archived one — the legitimate
--      work of save_job, import_jobs, update_job, and browser capture;
--   3. the student's own web session (no claim) is unaffected: it archives,
--      restores, deletes, and edits its profile exactly as before;
--   4. cross-user isolation is unchanged by any of it.
--
-- A mutation that the policies filter out affects no rows and raises nothing,
-- so those cases are proved by looking at the row afterwards; the archive
-- guard raises, so those cases use `throws_ok`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- ------------------------------------------------------------- structure ---

select has_function(
  'public', 'is_oauth_client_session',
  'the OAuth-client predicate exists'
);

select policies_are(
  'public', 'applications',
  array[
    'applications_select_own',
    'applications_insert_own',
    'applications_update_own',
    'applications_delete_own',
    'applications_delete_denied_to_oauth_clients',
    'applications_insert_archived_denied_to_oauth_clients'
  ],
  'applications carries the owner policies plus the two client restrictions'
);

select policies_are(
  'public', 'profiles',
  array[
    'profiles_select_own',
    'profiles_insert_own',
    'profiles_update_own',
    'profiles_delete_own',
    'profiles_insert_denied_to_oauth_clients',
    'profiles_update_denied_to_oauth_clients',
    'profiles_delete_denied_to_oauth_clients'
  ],
  'profiles carries the owner policies plus the three client restrictions'
);

select has_trigger(
  'public', 'applications', 'applications_guard_archive_state',
  'archived_at is guarded by a trigger'
);

-- ----------------------------------------------------------------- users ---

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
    '50000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'oauth-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User A"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'oauth-b@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User B"}',
    now(),
    now()
  );

-- --------------------------------------------------- user A, web session ---
-- A password/session login: `sub` and `role`, no `client_id`.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  public.is_oauth_client_session(), false,
  'a web session is not an OAuth-client session'
);

insert into public.applications (
  id, company_name, original_job_title, normalized_job_category,
  location, application_source, work_term_season
)
values
  ('e0000000-0000-0000-0000-000000000001', 'Acme', 'Analyst Intern',
   'Business Analysis', 'Toronto', 'LinkedIn', 'Summer 2027'),
  ('e0000000-0000-0000-0000-000000000002', 'Globex', 'Data Intern',
   'Data and Analytics', 'Ottawa', 'Indeed', 'Fall 2026'),
  ('e0000000-0000-0000-0000-000000000003', 'Initech', 'Ops Intern',
   'Strategy and Operations', 'Waterloo', 'Company website', 'Winter 2027');

-- The student archives one of them from the web app.
update public.applications
set archived_at = now()
where id = 'e0000000-0000-0000-0000-000000000002';

select isnt(
  (select archived_at from public.applications
   where id = 'e0000000-0000-0000-0000-000000000002'),
  null,
  'the web session archives its own application'
);

-- ---------------------------------------- user A, Interndex Capture session ---
-- The extension's registered public client id (extension/src/config.ts).

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"461d1918-6343-447b-80f8-73f22e75b34d"}',
  true
);

select is(
  public.is_oauth_client_session(), true,
  'a token carrying client_id is an OAuth-client session'
);

-- Reads: unchanged.
select is(
  (select count(*)::int from public.applications),
  3,
  'the client session still sees all of the student''s applications'
);

-- Capture: insert is the extension's one operation, and it still works.
select lives_ok(
  $$ insert into public.applications (
       id, company_name, original_job_title, normalized_job_category,
       location, application_source, work_term_season
     ) values (
       'e0000000-0000-0000-0000-000000000004', 'Captured Co', 'Intern',
       'Other', 'Remote', 'Not specified', 'Not specified'
     ) $$,
  'the client session can add an application (browser capture, save_job)'
);
select is(
  (select user_id from public.applications
   where id = 'e0000000-0000-0000-0000-000000000004'),
  '50000000-0000-0000-0000-000000000001'::uuid,
  'the captured application belongs to the token''s user'
);

-- update_job: details, dates and status still update, and history records.
update public.applications
set current_status = 'Applied', date_applied = current_date,
    notes = 'Edited by an assistant'
where id = 'e0000000-0000-0000-0000-000000000001';

select is(
  (select current_status::text from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  'Applied',
  'the client session can update an application''s details and status'
);
select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'e0000000-0000-0000-0000-000000000001'),
  2,
  'that status change recorded its history event as before'
);

-- Editing an archived record's details is not archiving, and stays allowed:
-- the guard is on `archived_at` changing, not on the row being archived.
update public.applications
set notes = 'Still editable while archived'
where id = 'e0000000-0000-0000-0000-000000000002';

select is(
  (select notes from public.applications
   where id = 'e0000000-0000-0000-0000-000000000002'),
  'Still editable while archived',
  'the client session can still edit the details of an archived application'
);
select isnt(
  (select archived_at from public.applications
   where id = 'e0000000-0000-0000-0000-000000000002'),
  null,
  'and that edit left it archived'
);

-- Archive: refused.
select throws_ok(
  $$ update public.applications set archived_at = now()
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'connected clients cannot archive or restore an application',
  'the client session cannot archive an application'
);
select is(
  (select archived_at from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  null,
  'the application is still active'
);

-- Restore: refused, for the same reason.
select throws_ok(
  $$ update public.applications set archived_at = null
     where id = 'e0000000-0000-0000-0000-000000000002' $$,
  '42501',
  'connected clients cannot archive or restore an application',
  'the client session cannot restore an archived application'
);

-- Archiving inside a wider edit is still archiving.
select throws_ok(
  $$ update public.applications
     set notes = 'tidy up', archived_at = now()
     where id = 'e0000000-0000-0000-0000-000000000003' $$,
  '42501',
  'connected clients cannot archive or restore an application',
  'the client session cannot archive as a side effect of another edit'
);

-- Re-stating the current value is not a change, and is not refused.
select lives_ok(
  $$ update public.applications set archived_at = null, notes = 'no change'
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'writing archived_at back unchanged is not archiving'
);

-- Delete: filtered out by the restrictive policy, silently, whatever the row.
delete from public.applications
where id = 'e0000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.applications
   where id = 'e0000000-0000-0000-0000-000000000002'),
  1,
  'the client session cannot delete an archived application'
);

delete from public.applications
where id = 'e0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  1,
  'the client session cannot delete an active application'
);

delete from public.applications;

select is(
  (select count(*)::int from public.applications),
  4,
  'nor delete without a predicate: every application is still there'
);

-- Creating a record that is born archived is archiving by another route.
select throws_ok(
  $$ insert into public.applications (
       company_name, original_job_title, normalized_job_category,
       location, application_source, work_term_season, archived_at
     ) values (
       'Pre-archived', 'Intern', 'Other', 'Remote', 'Not specified',
       'Not specified', now()
     ) $$,
  '42501',
  null,
  'the client session cannot insert an application that is already archived'
);

-- Profile: nothing on the consent screen grants this.
update public.profiles
set full_name = 'Renamed by a client'
where user_id = '50000000-0000-0000-0000-000000000001';

select is(
  (select full_name from public.profiles
   where user_id = '50000000-0000-0000-0000-000000000001'),
  'User A',
  'the client session cannot update the student''s profile'
);

delete from public.profiles
where user_id = '50000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.profiles
   where user_id = '50000000-0000-0000-0000-000000000001'),
  1,
  'the client session cannot delete the student''s profile'
);

-- -------------------------------------------- user A, an assistant's session ---
-- A different client (an MCP connector). The rule is about being a client,
-- not about which one.

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d"}',
  true
);

delete from public.applications
where id = 'e0000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.applications
   where id = 'e0000000-0000-0000-0000-000000000002'),
  1,
  'an assistant''s session cannot delete an application either'
);
select throws_ok(
  $$ update public.applications set archived_at = now()
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'connected clients cannot archive or restore an application',
  'nor archive one'
);

update public.applications
set current_status = 'Interview'
where id = 'e0000000-0000-0000-0000-000000000001';

select is(
  (select current_status::text from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  'Interview',
  'but it can still update details and status (update_job)'
);

-- ------------------------------------------------ user B, a client session ---
-- Cross-user isolation is `auth.uid()`'s job and is unchanged. The attempts
-- here are checked from user A's own session below.

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated","client_id":"461d1918-6343-447b-80f8-73f22e75b34d"}',
  true
);

select is(
  (select count(*)::int from public.applications),
  0,
  'another student''s client session sees none of user A''s applications'
);

update public.applications
set notes = 'stolen'
where id = 'e0000000-0000-0000-0000-000000000001';

delete from public.applications;

-- --------------------------------------------- user A, web session again ---
-- The student's own session is not a client and keeps its full authority.

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.applications),
  4,
  'the web session sees everything: user B''s session deleted nothing'
);
select is(
  (select current_status::text from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  'Interview',
  'and the clients'' legitimate updates were kept'
);
select is(
  (select notes from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  'no change',
  'while user B''s session changed nothing'
);
select lives_ok(
  $$ update public.applications set archived_at = now()
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'the web session can archive an application'
);
select isnt(
  (select archived_at from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  null,
  'and it is archived'
);
select lives_ok(
  $$ update public.applications set archived_at = null
     where id = 'e0000000-0000-0000-0000-000000000001' $$,
  'the web session can restore it'
);
select is(
  (select archived_at from public.applications
   where id = 'e0000000-0000-0000-0000-000000000001'),
  null,
  'and it is active again'
);

delete from public.applications
where id = 'e0000000-0000-0000-0000-000000000002'
  and archived_at is not null;

select is(
  (select count(*)::int from public.applications),
  3,
  'the web session can permanently delete an archived application'
);
select lives_ok(
  $$ insert into public.applications (
       company_name, original_job_title, normalized_job_category,
       location, application_source, work_term_season, archived_at
     ) values (
       'Imported as archived', 'Intern', 'Other', 'Remote', 'Not specified',
       'Not specified', now()
     ) $$,
  'the web session may create an application that is already archived'
);

update public.profiles
set full_name = 'User A, renamed'
where user_id = '50000000-0000-0000-0000-000000000001';

select is(
  (select full_name from public.profiles
   where user_id = '50000000-0000-0000-0000-000000000001'),
  'User A, renamed',
  'the web session can update its own profile'
);
select is(
  (select count(*)::int from public.application_status_history
   where application_id = 'e0000000-0000-0000-0000-000000000001'),
  3,
  'status history holds exactly the events the permitted updates produced'
);

select * from finish();

rollback;
