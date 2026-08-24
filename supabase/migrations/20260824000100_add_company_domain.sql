-- Company domain for brand/logo lookup.
--
-- One additive, nullable column. It carries the employer's canonical internet
-- domain — `rbc.com`, `shopify.com` — and exists so a logo can be looked up by
-- domain. It is brand metadata and deliberately not the posting URL, the
-- recruiter's email domain, or the applicant-tracking host a posting happens
-- to be served from; `application_url` already holds the link.
--
-- Nullable with no backfill and no default. Every existing application keeps
-- `null` and renders a local lettermark, and nothing in the product infers a
-- domain from a company name — a guessed brand is worse than no brand.
--
-- No row-level-security change accompanies this. The column belongs to the
-- existing `applications` row, whose policies are owner predicates on
-- `user_id` and apply to every column of the row regardless of how many there
-- are. Table privileges are likewise table-wide, so the existing grants cover
-- it.

alter table public.applications
  add column company_domain text;

-- 253 is the maximum length of a DNS name. The application normalizes input to
-- a bare lowercase hostname before it ever reaches here; this check is the
-- database's own floor, not a restatement of that parsing.
alter table public.applications
  add constraint applications_company_domain_length
  check (
    company_domain is null
    or char_length(btrim(company_domain)) between 1 and 253
  );

comment on column public.applications.company_domain is
  'Optional canonical employer domain (hostname only, no scheme or path) used for logo lookup. Null means no brand asset is shown.';
