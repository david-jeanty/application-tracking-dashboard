-- Recruiting agent, Spec 1 step 6: resume builds and private PDF storage.
--
-- Additive only. Owner only in practice: only the OWNER_USER_ID account is
-- ever offered the tools that write these, and every policy below limits a
-- row or file to its own user anyway.
--
-- 1. tailored_resumes gains what a build records:
--    * html_path: the printable HTML resume.lol returned, kept so a resume
--      can still be opened and printed when the server could not render the
--      PDF (the layout check was skipped);
--    * layout_check and layout_report: whether the rendered page passed the
--      one-page, no-widow check, failed it, or the check was skipped, and
--      why (which path ran);
--    * resumelol_updated_at and built_markdown_sha256: what a rebuild needs to
--      update the resume in place without overwriting an edit David made in
--      resume.lol (see decision record 0009).
--
-- 2. A private storage bucket, "resumes". Files live at
--    {user_id}/{tailored_resume_id}.pdf and .html. A user may only touch
--    files whose first folder is their own id. Files are opened through
--    short-lived signed URLs, never public links.

-- ------------------------------------------------- tailored_resumes (add) --

alter table public.tailored_resumes
  add column html_path text,
  add column layout_check text,
  add column layout_report jsonb,
  add column resumelol_updated_at text,
  add column built_markdown_sha256 text;

alter table public.tailored_resumes
  add constraint tailored_resumes_html_path_length
    check (html_path is null or char_length(html_path) <= 300),
  add constraint tailored_resumes_layout_check_value
    check (layout_check is null or layout_check in ('passed', 'failed', 'skipped')),
  add constraint tailored_resumes_layout_report_object
    check (layout_report is null or jsonb_typeof(layout_report) = 'object'),
  add constraint tailored_resumes_resumelol_updated_at_length
    check (resumelol_updated_at is null or char_length(resumelol_updated_at) <= 64),
  add constraint tailored_resumes_markdown_sha_format
    check (built_markdown_sha256 is null or built_markdown_sha256 ~ '^[0-9a-f]{64}$');

comment on column public.tailored_resumes.layout_check is
  'passed, failed, or skipped (headless Chrome could not render; see layout_report.path).';

-- ------------------------------------------------------------ storage ---

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf', 'text/html'])
on conflict (id) do nothing;

create policy resumes_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy resumes_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy resumes_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy resumes_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
