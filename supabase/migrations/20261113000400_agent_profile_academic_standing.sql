-- Recruiting agent: academic standing on the fit-read profile.
--
-- Years enrolled and academic standing (credits completed) can differ.
-- Postings sometimes state eligibility by one and sometimes by the other, so
-- the fit read needs both. `year_of_study` keeps
-- meaning years enrolled; this column holds the standing.
--
-- Additive only: one nullable column with the same range check as
-- year_of_study. RLS and grants on agent_profile already cover it.

alter table public.agent_profile
  add column academic_standing smallint;

alter table public.agent_profile
  add constraint agent_profile_academic_standing_range
    check (academic_standing is null or academic_standing between 1 and 10);

comment on column public.agent_profile.academic_standing is
  'Year of academic standing (credits completed). Can differ from year_of_study, which counts years enrolled.';
