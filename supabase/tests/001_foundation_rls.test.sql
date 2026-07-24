begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.applications'::regclass),
  'applications has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.application_status_history'::regclass
  ),
  'status history has RLS enabled'
);

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
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'user-a@example.test',
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
    'user-b@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User B"}',
    now(),
    now()
  );

select is(
  (select count(*)::integer from public.profiles),
  2,
  'auth user creation creates exactly one profile per user'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.profiles),
  1,
  'User A sees only one profile'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '20000000-0000-0000-0000-000000000002'
  ),
  0,
  'User A cannot read User B profile'
);

insert into public.applications (
  id,
  company_name,
  original_job_title,
  normalized_job_category,
  location,
  application_source,
  work_term_season
)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Example Company',
  'Business Analyst Intern',
  'Business Analysis',
  'Toronto, ON',
  'Company website',
  'Summer 2027'
);

select is(
  (
    select count(*)::integer
    from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  1,
  'application creation makes exactly one initial history event'
);
select ok(
  (
    select previous_status is null and new_status = 'Interested'
    from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  'initial history has null previous status and selected new status'
);

update public.applications
set notes = 'An ordinary edit'
where id = 'a0000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  1,
  'ordinary edits do not duplicate status history'
);

update public.applications
set current_status = 'Applied'
where id = 'a0000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  2,
  'a real status change adds one history event'
);
select ok(
  (
    select previous_status = 'Interested' and new_status = 'Applied'
    from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
    order by changed_at desc, id desc
    limit 1
  ),
  'transition history contains the previous and new status'
);

select throws_ok(
  $$
    insert into public.applications (
      user_id,
      company_name,
      original_job_title,
      normalized_job_category,
      location,
      application_source,
      work_term_season
    )
    values (
      '20000000-0000-0000-0000-000000000002',
      'Wrong owner',
      'Intern',
      'Other',
      'Toronto, ON',
      'Other',
      'Summer 2027'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "applications"',
  'User A cannot create an application owned by User B'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.applications),
  0,
  'User B cannot read User A applications'
);
select is(
  (select count(*)::integer from public.application_status_history),
  0,
  'User B cannot read User A status history'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id = '10000000-0000-0000-0000-000000000001'
  ),
  0,
  'User B cannot read User A profile'
);

update public.applications
set company_name = 'Tampered'
where id = 'a0000000-0000-0000-0000-000000000001';

delete from public.applications
where id = 'a0000000-0000-0000-0000-000000000001';

reset role;

select is(
  (
    select company_name
    from public.applications
    where id = 'a0000000-0000-0000-0000-000000000001'
  ),
  'Example Company',
  'User B update against User A record changes nothing'
);
select is(
  (
    select count(*)::integer
    from public.applications
    where id = 'a0000000-0000-0000-0000-000000000001'
  ),
  1,
  'User B delete against User A record changes nothing'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.application_status_history (
      application_id,
      user_id,
      previous_status,
      new_status
    )
    values (
      'a0000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'Applied',
      'Offer'
    )
  $$,
  '42501',
  'permission denied for table application_status_history',
  'authenticated users cannot forge history'
);

select throws_ok(
  $$
    update public.application_status_history
    set new_status = 'Offer'
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table application_status_history',
  'authenticated users cannot rewrite history'
);

select throws_ok(
  $$
    delete from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table application_status_history',
  'authenticated users cannot delete history'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.application_status_history
    where application_id = 'a0000000-0000-0000-0000-000000000001'
  ),
  2,
  'failed history mutations preserve the two legitimate events'
);

select * from finish();
rollback;
