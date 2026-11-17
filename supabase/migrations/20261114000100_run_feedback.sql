-- Recruiting agent: feedback from the first runs (Ramp, 2026-11-14).
--
-- * usage_log.request_bytes: how much each tool call sent in (the arguments),
--   next to the existing response_bytes, so a run's usage can be estimated
--   from both directions. Null on rows written before this column existed.
-- * agent_profile.interests: David's interests line, added to a resume only
--   when the page has room or the company's culture fits (off by default).
--
-- Additive only: two nullable columns with checks. RLS and grants on both
-- tables already cover them.

alter table public.usage_log
  add column request_bytes integer;

alter table public.usage_log
  add constraint usage_log_request_bytes_nonnegative
    check (request_bytes is null or request_bytes >= 0);

alter table public.agent_profile
  add column interests text;

alter table public.agent_profile
  add constraint agent_profile_interests_length
    check (interests is null or char_length(btrim(interests)) between 1 and 300);

comment on column public.usage_log.request_bytes is
  'Size of the tool call''s arguments in bytes; with response_bytes, the basis of the per-run usage estimate.';
comment on column public.agent_profile.interests is
  'Interests line for resumes, used only when the page has room or the culture fits.';
