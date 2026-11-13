-- Resume builds and private storage (20261113000200_resume_builds.sql).
--
-- Proves, against a real Postgres:
--
--   1. the new tailored_resumes columns exist and their constraints hold;
--   2. the "resumes" bucket is private;
--   3. a connected client's session (Claude, carrying client_id) can write
--      and read files in its own folder, and cannot write into another
--      user's folder;
--   4. another user can neither see, change nor delete those files.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ------------------------------------------------------------- structure ---

select has_column('public', 'tailored_resumes', 'html_path', 'tailored_resumes gains html_path');
select has_column('public', 'tailored_resumes', 'layout_check', 'tailored_resumes gains layout_check');
select has_column('public', 'tailored_resumes', 'built_markdown_sha256', 'tailored_resumes gains built_markdown_sha256');

select is(
  (select public from storage.buckets where id = 'resumes'),
  false,
  'the resumes bucket is private'
);

-- ----------------------------------------------------------------- users ---

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'build-owner@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'build-other@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Other"}', now(), now());

-- ------------------------------------------ owner, as Claude's connector ---

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated","client_id":"c1a0de00-0000-4000-8000-000000000001"}',
  true
);

select lives_ok(
  $$
    insert into public.applications (
      id, company_name, original_job_title, normalized_job_category,
      location, application_source, work_term_season
    )
    values (
      'a8000000-0000-0000-0000-000000000001', 'Pinterest', 'Strategy and Operations Intern',
      'Project Management', 'San Francisco, CA', 'Company website', 'Summer 2027'
    );

    insert into public.templates (id, name)
    values ('d8000000-0000-0000-0000-000000000001', 'jakes');

    insert into public.tailored_resumes (id, application_id, template_id, content)
    values ('f8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001',
            'd8000000-0000-0000-0000-000000000001', '{"entries": []}'::jsonb);

    update public.tailored_resumes
    set layout_check = 'skipped',
        layout_report = '{"path": "skipped", "reason": "launch_failed"}'::jsonb,
        built_markdown_sha256 = repeat('a', 64),
        html_path = '80000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-000000000001.html'
    where id = 'f8000000-0000-0000-0000-000000000001';
  $$,
  'a connected client records a build on its own resume'
);

select throws_ok(
  $$ update public.tailored_resumes set layout_check = 'maybe'
     where id = 'f8000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'layout_check is passed, failed or skipped'
);

select throws_ok(
  $$ update public.tailored_resumes set built_markdown_sha256 = 'not-a-hash'
     where id = 'f8000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'built_markdown_sha256 must be a sha-256 hex digest'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('resumes', '80000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-000000000001.pdf');
  $$,
  'a connected client stores a PDF in its own folder'
);

select lives_ok(
  $$
    update storage.objects set metadata = '{"size": 1}'::jsonb
    where bucket_id = 'resumes'
      and name = '80000000-0000-0000-0000-000000000001/f8000000-0000-0000-0000-000000000001.pdf';
  $$,
  'and can overwrite it on a rebuild'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('resumes', '80000000-0000-0000-0000-000000000002/planted.pdf');
  $$,
  '42501',
  null,
  'a client cannot write into another user''s folder'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name)
    values ('resumes', 'loose.pdf');
  $$,
  '42501',
  null,
  'a file outside any user folder is refused'
);

-- ------------------------------------------------------ the other user ---

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'resumes'),
  0,
  'another user sees none of the owner''s files'
);

-- Storage blocks SQL deletes unless this is set (the Storage API sets it),
-- so set it here to test the policy itself.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'resumes';
update storage.objects set metadata = '{"size": 999}'::jsonb where bucket_id = 'resumes';

select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'resumes'),
  1,
  'another user''s delete removed nothing'
);

select is(
  (select metadata->>'size' from storage.objects where bucket_id = 'resumes'),
  '1',
  'another user''s update changed nothing'
);

select * from finish();
rollback;
