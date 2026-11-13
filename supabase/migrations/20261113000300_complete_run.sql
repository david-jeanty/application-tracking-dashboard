-- Recruiting agent, Spec 1 step 7: complete_run saves a run in one transaction.
--
-- Spec 1 asks the end of a run to save everything in one write. supabase-js
-- has no transactions, so the save is one Postgres function. It is
-- SECURITY INVOKER: it runs as the caller, so row-level security on every
-- table it touches still decides what it can see and write. It can only ever
-- save into the caller's own application, template, stories and answers.
--
-- The resume.lol build cannot be part of a database transaction, so the
-- order is: this function saves everything (or nothing), then the tool
-- builds, then the build records its own result (BUILD-LOG 3.3).
--
-- Additive only: one nullable column on applications and one function.

alter table public.applications
  add column fit_read jsonb;

alter table public.applications
  add constraint applications_fit_read_object
    check (fit_read is null or jsonb_typeof(fit_read) = 'object');

comment on column public.applications.fit_read is
  'Recruiting agent: the fit read for this posting (verdict, summary, gaps). Null for applications the agent never ran on.';

create function public.complete_run(
  p_application_id uuid,
  p_template_name text,
  p_fit_read jsonb,
  p_content jsonb,
  p_mirrored_title text,
  p_variants jsonb,
  p_answers jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_template_id uuid;
  v_resume_id uuid;
  v_created boolean := false;
  v_variants_added integer := 0;
  v_answers_added integer := 0;
begin
  if v_user_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Row-level security hides other users' applications, so "not found" covers both.
  perform 1 from public.applications
  where id = p_application_id and user_id = v_user_id;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  select id into v_template_id from public.templates
  where user_id = v_user_id and name = p_template_name and calibrated_at is not null;
  if v_template_id is null then
    raise exception 'template not calibrated' using errcode = 'P0002';
  end if;

  -- Reuse the newest resume for this posting while it has never been built;
  -- once built, a new run makes a new resume (its build cap is spent).
  select id into v_resume_id from public.tailored_resumes
  where user_id = v_user_id
    and application_id = p_application_id
    and build_count = 0
    and resumelol_resume_id is null
  order by created_at desc
  limit 1;

  if v_resume_id is null then
    insert into public.tailored_resumes (application_id, template_id, content, mirrored_title)
    values (p_application_id, v_template_id, p_content, p_mirrored_title)
    returning id into v_resume_id;
    v_created := true;
  else
    update public.tailored_resumes
    set template_id = v_template_id,
        content = p_content,
        mirrored_title = p_mirrored_title,
        status = 'draft'
    where id = v_resume_id;
  end if;

  update public.applications
  set fit_read = p_fit_read,
      tailored_resume_id = v_resume_id
  where id = p_application_id and user_id = v_user_id;

  with inserted as (
    insert into public.story_variants (
      story_id, text, style, angles, template_fit, explain_note, source
    )
    select
      (variant->>'story_id')::uuid,
      variant->>'text',
      variant->>'style',
      coalesce(array(select jsonb_array_elements_text(variant->'angles')), '{}'),
      coalesce(array(select jsonb_array_elements_text(variant->'template_fit')), '{}'),
      variant->>'explain_note',
      'pipeline'
    from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) as variant
    on conflict (story_id, text) do nothing
    returning 1
  )
  select count(*) into v_variants_added from inserted;

  with inserted as (
    insert into public.answer_bank (question, answer, tags, application_id)
    select
      answer->>'question',
      answer->>'answer',
      coalesce(array(select jsonb_array_elements_text(answer->'tags')), '{}'),
      p_application_id
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as answer
    returning 1
  )
  select count(*) into v_answers_added from inserted;

  insert into public.run_ledger (application_id, step, status, count)
  values (p_application_id, 'fit_read', 'done', 1), (p_application_id, 'tailor', 'done', 1)
  on conflict (application_id, step)
  do update set status = 'done', count = public.run_ledger.count + 1;

  return jsonb_build_object(
    'tailored_resume_id', v_resume_id,
    'created', v_created,
    'variants_added', v_variants_added,
    'answers_added', v_answers_added
  );
end;
$$;

revoke all on function public.complete_run(uuid, text, jsonb, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.complete_run(uuid, text, jsonb, jsonb, text, jsonb, jsonb) to authenticated;
