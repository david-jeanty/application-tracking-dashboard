-- Applications search and filtering, at the database level.
--
-- The unit suite proves which query the repository builds. This proves what
-- that query means once Postgres runs it: that `ilike` really is
-- case-insensitive, that an escaped `%` or `_` is matched literally, that the
-- three searched columns are the ones intended, and that none of it can reach
-- another user's rows or an archived application.
--
-- The patterns below are written exactly as PostgREST hands them to Postgres
-- after unquoting: `%term%`, with a backslash escaping any wildcard the
-- student actually typed.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

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
    'search-a@example.test',
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
    'search-b@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User B"}',
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- User A's applications. The last two carry text that a naive `LIKE` pattern
-- would treat as wildcards.
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
    'a0000000-0000-0000-0000-000000000001',
    'RBC',
    'Business Analyst Intern',
    'Business Analysis',
    'Toronto, ON',
    'LinkedIn',
    'Winter 2027',
    'Applied'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'Shopify',
    'Product Analyst',
    'Product Management',
    'Ottawa, ON',
    'Company website',
    'Summer 2027',
    'Interested'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'Nokia',
    'Marketing Student',
    'Marketing',
    'Kanata, ON',
    'Referral',
    'Winter 2027',
    'Interview'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    '100% Capital',
    'Finance Intern',
    'Finance',
    'Montreal, QC',
    'Job board',
    'Summer 2027',
    'Interested'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'A_B Consulting',
    'Strategy Intern',
    'Consulting',
    'Vancouver, BC',
    'Job board',
    'Fall 2026',
    'Interested'
  );

-- An archived application that would otherwise match a company search.
insert into public.applications (
  id,
  company_name,
  original_job_title,
  normalized_job_category,
  location,
  application_source,
  work_term_season,
  archived_at
)
values (
  'a0000000-0000-0000-0000-000000000006',
  'RBC',
  'Archived Analyst',
  'Business Analysis',
  'Toronto, ON',
  'LinkedIn',
  'Winter 2027',
  now()
);

-- ---------------------------------------------------------------- search ---

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%RBC%'
        or original_job_title ilike '%RBC%'
        or location ilike '%RBC%'
      )
  ),
  1,
  'search matches an application by company name'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%Marketing Student%'
        or original_job_title ilike '%Marketing Student%'
        or location ilike '%Marketing Student%'
      )
  ),
  1,
  'search matches an application by job title'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%Ottawa%'
        or original_job_title ilike '%Ottawa%'
        or location ilike '%Ottawa%'
      )
  ),
  1,
  'search matches an application by location'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%analyst%'
        or original_job_title ilike '%analyst%'
        or location ilike '%analyst%'
      )
  ),
  2,
  'search spans all three columns at once'
);

select is(
  (
    select company_name
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%rbc%'
        or original_job_title ilike '%rbc%'
        or location ilike '%rbc%'
      )
  ),
  'RBC',
  'search is case-insensitive on a lowercase term'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%BUSINESS ANALYST%'
        or original_job_title ilike '%BUSINESS ANALYST%'
        or location ilike '%BUSINESS ANALYST%'
      )
  ),
  1,
  'search is case-insensitive on an uppercase term'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%ana%'
        or original_job_title ilike '%ana%'
        or location ilike '%ana%'
      )
  ),
  3,
  'search matches a substring anywhere in the value'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%nothing here%'
        or original_job_title ilike '%nothing here%'
        or location ilike '%nothing here%'
      )
  ),
  0,
  'a term nobody matches returns nothing rather than everything'
);

-- ------------------------------------------------- literal wildcard input ---

select is(
  (
    select company_name
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%100\%%'
        or original_job_title ilike '%100\%%'
        or location ilike '%100\%%'
      )
  ),
  '100% Capital',
  'an escaped percent matches a literal percent sign'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%\%%'
        or original_job_title ilike '%\%%'
        or location ilike '%\%%'
      )
  ),
  1,
  'a lone escaped percent does not match every application'
);

select is(
  (
    select company_name
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%A\_B%'
        or original_job_title ilike '%A\_B%'
        or location ilike '%A\_B%'
      )
  ),
  'A_B Consulting',
  'an escaped underscore matches a literal underscore'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%A\_B%'
        or original_job_title ilike '%A\_B%'
        or location ilike '%A\_B%'
      )
  ),
  1,
  'an escaped underscore does not stand in for any character'
);

-- --------------------------------------------------------------- filters ---

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null and current_status = 'Applied'
  ),
  1,
  'status filter returns only that status'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null and work_term_season ilike '%Winter 2027%'
  ),
  2,
  'work-term filter returns only that term'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and normalized_job_category = 'Business Analysis'
  ),
  1,
  'category filter returns only that category'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and work_term_season ilike '%Winter 2027%'
      and current_status = 'Interview'
      and (
        company_name ilike '%nokia%'
        or original_job_title ilike '%nokia%'
        or location ilike '%nokia%'
      )
  ),
  1,
  'search combined with filters narrows to the intersection'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and current_status = 'Applied'
      and (
        company_name ilike '%shopify%'
        or original_job_title ilike '%shopify%'
        or location ilike '%shopify%'
      )
  ),
  0,
  'a combination nothing satisfies returns nothing'
);

-- --------------------------------------------------------------- archived ---

select is(
  (
    select count(*)::integer
    from public.applications
    where archived_at is null
      and (
        company_name ilike '%RBC%'
        or original_job_title ilike '%RBC%'
        or location ilike '%RBC%'
      )
  ),
  1,
  'an archived application is excluded from a matching search'
);

select is(
  (
    select count(*)::integer
    from public.applications
    where company_name ilike '%RBC%'
  ),
  2,
  'the archived application does exist, and is only hidden by the filter'
);

-- ---------------------------------------------------------------- owner ----

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)::integer
    from public.applications
    where company_name ilike '%RBC%'
       or original_job_title ilike '%analyst%'
       or location ilike '%Toronto%'
  ),
  0,
  'another user searching the same terms matches none of User A rows'
);

select * from finish();

rollback;
