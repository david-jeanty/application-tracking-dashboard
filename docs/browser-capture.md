# Browser-capture architecture

Status: server-side foundation implemented; browser extension not built or
publicly released. Decision date: 2026-08-25.

## Product boundary

The future extension has one job: after an explicit user action, send the known
facts from the job posting currently being viewed to that student's JobTrack
account. It is a capture layer, not an AI product.

**AI does the reasoning. JobTrack stores the truth.**

The capture path does not classify jobs, match resumes, recommend roles, fill
forms, apply, detect submissions, discover postings, inspect email/calendar
data, or monitor browsing in the background. Unknown values stay absent rather
than being inferred to make a record look complete.

## Request and response

The server exposes `POST /api/browser-capture`. A request carries:

- `Authorization: Bearer <Supabase-issued access token>`; and
- JSON in the same external job-record shape used by MCP `save_job`, with
  `company` and `job_title` required and only fields JobTrack already stores.

Successful creation returns HTTP 201 with `status: "created"` and a bounded
application summary containing the record id, company, title, status, and
relative JobTrack detail link. An exact stored-URL match returns HTTP 409 with
`status: "already_tracked"`, names the matching record, and supplies its link.
Invalid input is HTTP 400; missing, malformed, expired, revoked, or otherwise
invalid bearer authentication is HTTP 401; repository failures are HTTP 500
without exposing database detail.

## Request flow

```text
explicit user capture action (future extension)
  → POST /api/browser-capture
  → strict Authorization: Bearer parsing
  → Supabase Auth verifies token and resolves its user
  → bearer-scoped publishable-key Supabase client
  → externalJobRecordSchema
  → toApplicationCreationValues (truthful defaults)
  → applicationCreationSchema (final domain gate)
  → findApplicationByExactUrl(user, URL), when URL is known
  → createApplication(existing mapper and insert)
  → Postgres owner RLS
```

There is one external record contract, one final creation schema, and one
repository write. `newJobRecordSchema` remains the MCP-facing name for the same
schema object, preserving the MCP wire schema and behavior.

## Trust and authentication boundaries

Page content and the request body are untrusted data. Neither may supply an
owner: `user_id` is absent from the schema and unknown fields are removed before
mapping. Identity comes only from Supabase's verified access token. The same
token-scoped client is used for the database calls, so `auth.uid()` fills the
owner column and existing RLS policies independently enforce ownership.

No service-role key, JWT signing secret, bespoke API-key table, or server-side
RLS bypass exists on this path. Authentication fails closed when verification
does not produce a user, including when Supabase cannot validate the token.

Supabase OAuth scopes affect identity-token contents, not Postgres privileges.
Consequently, an OAuth grant shown in Settings is revocable but is not itself a
database capability boundary. Before any public Chrome Web Store release, use a
dedicated extension OAuth client and complete a least-privilege review. That
review must decide whether client-id-aware RLS/policies are required to limit
the extension client to capture rather than the full privileges of an ordinary
authenticated session.

## Validation and defaults

`lib/applications/external-record.ts` owns the caller-neutral record schema and
mapping shared by MCP and browser capture. The mapped result always passes
through `applicationCreationSchema`; browser capture has no alternate field
limits or application validation.

The established truthful defaults are unchanged:

- missing status → `Interested`;
- missing category → `Other`;
- missing work term → the database's `Not specified` sentinel;
- missing work arrangement → the mapper's `Unknown`; and
- other optional values remain absent/null or use the existing unspecified
  storage behavior.

The server never derives facts from a page URL. In particular, Workday,
Greenhouse, Lever, LinkedIn, and Indeed hosts are not employer domains.
`company_domain` is accepted only when the caller actually knows the employer's
brand domain.

## Duplicate behavior

Browser capture checks the authenticated user's tracker for an exact match on
the URL after the existing creation schema has validated and trimmed it. The
check includes archived records and returns the newest exact match if historical
duplicates already exist. It does not remove query parameters, follow
redirects, compare employer/title text, fuzzy-match, merge, or silently skip.

No global unique constraint is added: the same posting may legitimately be
saved again, and a role may be reposted at a different URL. The current endpoint
returns an explicit conflict rather than guessing. A future extension may add a
clearly confirmed "save another copy" request flow, but it must be an explicit
user choice rather than a silent override.

The check is a read followed by a write because PostgREST and the existing
schema provide no scoped transactional primitive for this policy. It prevents
ordinary repeated clicks after the first request completes, but two truly
simultaneous requests can race. A future extension must disable repeat submit
while a request is pending. If production evidence requires stronger
idempotency, add a scoped idempotency mechanism rather than a global URL
constraint.

## Source semantics

`application_source` means where the student found the opportunity and feeds
source analytics. The server never rewrites it to `Browser extension`, because
that is capture provenance, not a job source. A supplied source such as
`LinkedIn` remains `LinkedIn`; when source is unknown, the existing mapper stores
`Not specified`.

This foundation adds no capture-provenance column. Add one only if a concrete
product need arises, with a migration and privacy review separate from source
analytics.

## Privacy boundary

The public `/privacy` page distinguishes today's web app from the planned,
unreleased extension. The extension must be implemented so that page data is
accessed only after explicit user invocation, only extracted posting data is
sent to the user's JobTrack account, browsing is not continuously monitored,
and authentication data is used only to connect that account. Captured records
remain editable/deletable through the web app and are used only to provide
JobTrack functionality, not sold or used for personalized advertising.

The server can enforce authenticated, validated, owner-scoped writes. It cannot
prove that a future client accessed a page only after a user gesture; extension
permissions, content-script activation, local token storage, disclosure copy,
and store declarations require their own implementation and review.

## Future extension responsibilities

The extension PR must separately:

- request the smallest Chrome permissions and host access that work;
- activate extraction only after an explicit user gesture;
- authenticate through a dedicated reviewed client without exposing tokens to
  page scripts;
- extract only values visibly present or otherwise actually known;
- never infer source, employer domain, status, category, or student facts;
- send the shared external record shape and render every structured response;
- disable repeated submission while a request is pending;
- show the existing-record link on `already_tracked` and require explicit
  confirmation before any later duplicate override;
- provide clear signed-out, expired-auth, invalid-posting, network, conflict,
  and success states; and
- update and verify the privacy policy and Chrome Web Store disclosures before
  release.

## Explicitly deferred

No extension UI or package, site-specific scraper framework, generalized DOM
scraping, background monitoring, built-in AI, classification, resume matching,
autofill, auto-apply, submission detection, recommendations, discovery,
email/calendar integration, fuzzy deduplication, global URL uniqueness, or
capture analytics is part of this foundation.
