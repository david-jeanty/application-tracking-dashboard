-- Clickwrap consent tracking for the Terms of Service and Privacy Policy.
--
-- Four additive, nullable columns. Interndex previously relied on
-- browsewrap ("creating an account means you accept them"), which a user
-- could never affirmatively act on. Signup now requires a checked "I agree"
-- box, and this is where that acceptance is recorded: when, and against
-- which version of each document (`lib/legal/document-versions.ts`), so a
-- later revision to either document can tell who agreed to what.
--
-- Nullable with no backfill, the same choice `company_domain` made:
-- existing accounts created before this existed keep `null` rather than a
-- fabricated acceptance they never gave.

alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column terms_version_accepted text,
  add column privacy_accepted_at timestamptz,
  add column privacy_version_accepted text;

alter table public.profiles
  add constraint profiles_terms_version_accepted_length
  check (
    terms_version_accepted is null
    or char_length(btrim(terms_version_accepted)) between 1 and 40
  );

alter table public.profiles
  add constraint profiles_privacy_version_accepted_length
  check (
    privacy_version_accepted is null
    or char_length(btrim(privacy_version_accepted)) between 1 and 40
  );

-- A version without its timestamp (or the reverse) is not a fact this
-- schema should be able to represent: consent either happened, with both
-- pieces recorded together, or it did not.
alter table public.profiles
  add constraint profiles_terms_acceptance_paired
  check (
    (terms_accepted_at is null) = (terms_version_accepted is null)
  );

alter table public.profiles
  add constraint profiles_privacy_acceptance_paired
  check (
    (privacy_accepted_at is null) = (privacy_version_accepted is null)
  );

comment on column public.profiles.terms_accepted_at is
  'When the user checked "I agree" at signup (or last re-accepted a revised version). Null for accounts created before clickwrap existed.';
comment on column public.profiles.terms_version_accepted is
  'The TERMS_VERSION (lib/legal/document-versions.ts) in effect at the moment terms_accepted_at was recorded.';
comment on column public.profiles.privacy_accepted_at is
  'When the user checked "I agree" at signup (or last re-accepted a revised version). Null for accounts created before clickwrap existed.';
comment on column public.profiles.privacy_version_accepted is
  'The PRIVACY_VERSION (lib/legal/document-versions.ts) in effect at the moment privacy_accepted_at was recorded.';

-- No row-level-security change accompanies this. These columns belong to
-- the existing `profiles` row, whose policies are owner predicates on
-- `user_id` and already cover every column of that row, and the existing
-- `handle_new_user()` trigger (security definer) already writes this row on
-- signup — it is updated below to also carry consent through from signup's
-- own request, not from the row's owner-scoped policies.

create or replace function public.handle_new_user()
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

  insert into public.profiles (
    user_id,
    full_name,
    terms_accepted_at,
    terms_version_accepted,
    privacy_accepted_at,
    privacy_version_accepted
  )
  values (
    new.id,
    left(resolved_name, 120),
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(btrim(new.raw_user_meta_data ->> 'terms_version_accepted'), ''),
    nullif(new.raw_user_meta_data ->> 'privacy_accepted_at', '')::timestamptz,
    nullif(btrim(new.raw_user_meta_data ->> 'privacy_version_accepted'), '')
  );

  return new;
end;
$$;
