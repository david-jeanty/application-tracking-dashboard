-- Recruiting agent: the story library is where resume headings come from.
--
-- Employers, titles, dates, locations and schools on a built resume now come
-- from the library, not the base resume (decision record 0014). Two facts the
-- base resume used to supply have to live in the library for that:
--
--   * which resume section an experience belongs in (experience, projects or
--     leadership), on `experiences.section`;
--   * the school's first month and location, for the education heading, on
--     `agent_profile.study_start` and `agent_profile.school_location`.
--
-- Additive only: three nullable columns with checks. RLS and grants on both
-- tables already cover them.

alter table public.experiences
  add column section text;

alter table public.experiences
  add constraint experiences_section_allowed
    check (section is null or section in ('experience', 'projects', 'leadership'));

comment on column public.experiences.section is
  'Resume section this experience is shown in. Null means: where the base resume has it, else experience.';

alter table public.agent_profile
  add column study_start date,
  add column school_location text;

alter table public.agent_profile
  add constraint agent_profile_school_location_length
    check (school_location is null or char_length(btrim(school_location)) between 1 and 200);

comment on column public.agent_profile.study_start is
  'First month of the degree, for the resume education heading.';
comment on column public.agent_profile.school_location is
  'Where the school is, as the resume education heading shows it.';
