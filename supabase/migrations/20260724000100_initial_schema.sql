-- Application Tracker Phase 1 foundation
-- All user-owned tables use RLS. Status history is written only by database
-- triggers so browser code cannot forge or rewrite audit events.

create type public.application_status as enum (
  'Interested',
  'Preparing',
  'Applied',
  'Screening',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Accepted'
);

create type public.job_category as enum (
  'Marketing',
  'Marketing Operations',
  'Sales',
  'Revenue Operations',
  'Business Analysis',
  'Strategy and Operations',
  'Project Management',
  'Product Management',
  'Data and Analytics',
  'Finance',
  'Accounting',
  'Human Resources',
  'Consulting',
  'Information Technology',
  'Software Engineering',
  'Other'
);

create type public.work_arrangement as enum (
  'Remote',
  'Hybrid',
  'On-site',
  'Unknown'
);

create type public.classification_confidence as enum (
  'High',
  'Medium',
  'Low'
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  school text,
  academic_program text,
  graduation_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length
    check (char_length(btrim(full_name)) between 1 and 120),
  constraint profiles_school_length
    check (school is null or char_length(btrim(school)) between 1 and 160),
  constraint profiles_academic_program_length
    check (
      academic_program is null
      or char_length(btrim(academic_program)) between 1 and 160
    ),
  constraint profiles_graduation_year_range
    check (graduation_year is null or graduation_year between 2000 and 2200)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (user_id) on delete cascade,
  company_name text not null,
  original_job_title text not null,
  normalized_job_category public.job_category not null,
  -- Null means the category was manually selected. Phase 5 will populate
  -- confidence and matched rules when deterministic classification runs.
  classification_confidence public.classification_confidence,
  classification_matches jsonb not null default '[]'::jsonb,
  location text not null,
  work_arrangement public.work_arrangement not null default 'Unknown',
  application_url text,
  application_source text not null,
  job_description text,
  application_deadline date,
  date_applied date,
  current_status public.application_status not null default 'Interested',
  work_term_season text not null,
  work_term_duration text,
  salary text,
  notes text,
  next_action text,
  next_action_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint applications_id_user_id_unique unique (id, user_id),
  constraint applications_company_name_length
    check (char_length(btrim(company_name)) between 1 and 160),
  constraint applications_original_job_title_length
    check (char_length(btrim(original_job_title)) between 1 and 200),
  constraint applications_classification_matches_array
    check (jsonb_typeof(classification_matches) = 'array'),
  constraint applications_location_length
    check (char_length(btrim(location)) between 1 and 200),
  constraint applications_url_length
    check (
      application_url is null
      or char_length(btrim(application_url)) between 1 and 2048
    ),
  constraint applications_source_length
    check (char_length(btrim(application_source)) between 1 and 100),
  constraint applications_description_length
    check (job_description is null or char_length(job_description) <= 50000),
  constraint applications_work_term_season_length
    check (char_length(btrim(work_term_season)) between 1 and 80),
  constraint applications_work_term_duration_length
    check (
      work_term_duration is null
      or char_length(btrim(work_term_duration)) between 1 and 80
    ),
  constraint applications_salary_length
    check (salary is null or char_length(btrim(salary)) between 1 and 100),
  constraint applications_notes_length
    check (notes is null or char_length(notes) <= 20000),
  constraint applications_next_action_length
    check (
      next_action is null
      or char_length(btrim(next_action)) between 1 and 500
    )
);

create table public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id uuid not null,
  previous_status public.application_status,
  new_status public.application_status not null,
  changed_at timestamptz not null default now(),
  constraint application_status_history_application_owner_fk
    foreign key (application_id, user_id)
    references public.applications (id, user_id)
    on delete cascade,
  constraint application_status_history_real_transition
    check (previous_status is null or previous_status <> new_status)
);

comment on column public.applications.salary is
  'Optional display-only MVP text. Salary is excluded from analytics.';
comment on column public.applications.classification_confidence is
  'Null for manual category selection until the Phase 5 classifier runs.';
comment on column public.application_status_history.previous_status is
  'Null only for the single initial history event created with an application.';

create unique index application_status_history_one_initial_event
  on public.application_status_history (application_id)
  where previous_status is null;

create index applications_user_created_idx
  on public.applications (user_id, created_at desc);
create index applications_user_updated_idx
  on public.applications (user_id, updated_at desc);
create index applications_user_status_active_idx
  on public.applications (user_id, current_status)
  where archived_at is null;
create index applications_user_date_applied_idx
  on public.applications (user_id, date_applied desc)
  where date_applied is not null;
create index applications_user_next_action_due_idx
  on public.applications (user_id, next_action_due_date)
  where next_action_due_date is not null and archived_at is null;
create index applications_user_deadline_idx
  on public.applications (user_id, application_deadline)
  where application_deadline is not null and archived_at is null;
create index applications_user_category_idx
  on public.applications (user_id, normalized_job_category)
  where archived_at is null;
create index application_status_history_owner_timeline_idx
  on public.application_status_history (user_id, application_id, changed_at);
create index application_status_history_owner_status_idx
  on public.application_status_history (user_id, new_status, changed_at);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_name text;
begin
  resolved_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Student'
  );

  insert into public.profiles (user_id, full_name)
  values (new.id, left(resolved_name, 120));

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.record_initial_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.application_status_history (
    application_id,
    user_id,
    previous_status,
    new_status
  )
  values (new.id, new.user_id, null, new.current_status);

  return new;
end;
$$;

create trigger applications_record_initial_status
after insert on public.applications
for each row execute function public.record_initial_application_status();

create function public.record_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.application_status_history (
    application_id,
    user_id,
    previous_status,
    new_status
  )
  values (new.id, new.user_id, old.current_status, new.current_status);

  return new;
end;
$$;

create trigger applications_record_status_change
after update of current_status on public.applications
for each row
when (old.current_status is distinct from new.current_status)
execute function public.record_application_status_change();

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.application_status_history enable row level security;

create policy "profiles_select_own"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "profiles_delete_own"
on public.profiles for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "applications_select_own"
on public.applications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "applications_insert_own"
on public.applications for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "applications_update_own"
on public.applications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "applications_delete_own"
on public.applications for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "application_status_history_select_own"
on public.application_status_history for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.applications
    where applications.id = application_status_history.application_id
      and applications.user_id = (select auth.uid())
  )
);

-- Explicit deny policies document that history is immutable to authenticated
-- clients. Table privileges below provide an independent denial layer.
create policy "application_status_history_insert_denied"
on public.application_status_history for insert
to authenticated
with check ((select auth.uid()) = user_id and false);

create policy "application_status_history_update_denied"
on public.application_status_history for update
to authenticated
using ((select auth.uid()) = user_id and false)
with check ((select auth.uid()) = user_id and false);

create policy "application_status_history_delete_denied"
on public.application_status_history for delete
to authenticated
using ((select auth.uid()) = user_id and false);

revoke all on public.profiles from anon, authenticated;
revoke all on public.applications from anon, authenticated;
revoke all on public.application_status_history from anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select on public.application_status_history to authenticated;
