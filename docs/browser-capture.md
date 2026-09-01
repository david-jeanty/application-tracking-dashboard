# Browser-capture architecture

Status: server-side foundation implemented (2026-08-25); Interndex Capture
Chrome extension implemented as a locally loadable unpacked MV3 extension
(2026-08-26). Not submitted to or approved by the Chrome Web Store.

## Product boundary

The extension has one job: after an explicit user action, send the known
facts from the job posting currently being viewed to that student's Interndex
account. It is a capture layer, not an AI product.

**AI does the reasoning. Interndex stores the truth.**

The capture path does not classify jobs, match resumes, recommend roles, fill
forms, apply, detect submissions, discover postings, inspect email/calendar
data, or monitor browsing in the background. Unknown values stay absent rather
than being inferred to make a record look complete.

## Request and response

The server exposes `POST /api/browser-capture`. A request carries:

- `Authorization: Bearer <Supabase-issued access token>`; and
- JSON in the same external job-record shape used by MCP `save_job`, with
  `company` and `job_title` required and only fields Interndex already stores.

Successful creation returns HTTP 201 with `status: "created"` and a bounded
application summary containing the record id, company, title, status, and
relative Interndex detail link. An exact stored-URL match returns HTTP 409 with
`status: "already_tracked"`, names the matching record, and supplies its link.
Invalid input is HTTP 400; missing, malformed, expired, revoked, or otherwise
invalid bearer authentication is HTTP 401; repository failures are HTTP 500
without exposing database detail.

## Request flow

```text
explicit user capture action (extension popup)
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

### Least-privilege review (launch hardening, completed)

The extension already registers as its own OAuth client (`lib/auth/bearer-identity.ts`
resolves `app_metadata.client_id` per token, distinct from the MCP client), so
its grant is independently visible and revocable in Settings without affecting
a connected assistant. That client id is read into `BearerIdentity` but is not
currently used to gate anything: `lib/mcp/identity.ts` forwards it for
observability only, and no route or RLS policy branches on it. `grep` across
`app/`, `lib/mcp`, and `lib/auth` confirms no `client_id`-keyed authorization
check exists anywhere in this codebase today.

**Threat model.** An extension access token is an ordinary Supabase JWT
(`sub` = the user, `role` = `authenticated`) exchanged through
`createBearerClient`, identical in shape and privilege to a web-session token
or an MCP token for the same user. Whoever holds a valid extension token can
therefore do anything RLS permits that user to do directly against
PostgREST/`supabase-js` — not only call `POST /api/browser-capture` — because
RLS authorizes by `user_id`, never by which OAuth client obtained the token.
Two things bound the actual blast radius:

- **Cross-user isolation is unaffected.** RLS still authorizes strictly by
  `auth.uid()`; a leaked or malicious extension token grants no access to any
  other student's rows, regardless of "scope."
- **No privilege escalation exists.** There is no service-role key or elevated
  path reachable from a bearer token of any kind (`lib/supabase/bearer.ts`), so
  the ceiling is "everything this one user could already do to their own data,"
  never more.

What is *not* bounded: the consent screen's "will be able to / will not be
able to" list (`lib/mcp/capabilities.ts`) describes the extension's intended
behavior, not an enforced ceiling. A compromised extension build, a stolen
`chrome.storage.local` refresh token (unencrypted on disk, a documented
tradeoff — see the extension's OAuth section), or a rogue client registered
under the extension's flow could use that one grant to read, edit, or delete
any of that single user's applications — a materially larger capability than
"capture jobs" — without RLS or the API layer objecting.

**Classification: acceptable with residual risk for the current state, not a
launch blocker for the web/MCP launch this audit covers.** The extension is
distributed only as an unpacked local install (see "Explicitly deferred"
below) with a small, trusted user base — not the Chrome Web Store — so the
realistic exposure is a single user's own data under attacker conditions
(disk access, a tampered build) that already carry a comparable blast radius
through other vectors on that user's own machine. Client-id-aware RLS is not
implemented here, deliberately: it would need a real design (a policy
predicate on `app_metadata.client_id`, decisions about which mutations a
capture-only client may perform, and its own test suite) that this audit's
narrow-fix mandate does not justify inventing speculatively. This remains
exactly the gate `docs/browser-capture.md` already named: resolve it — either
by shipping client-id-aware policies or by making an explicit, documented
risk-acceptance decision — before any public Chrome Web Store distribution,
which is unchanged and still pending as of this review.

### Chrome Web Store release review (this review)

This is the gate named above, revisited now that public distribution is
actually being prepared (`docs/chrome-web-store-release.md`).

**Is there a trustworthy signal to key a policy on?** Yes, in principle.
`docs/mcp.md` already identifies it: when Supabase issues an access token
through its OAuth 2.1 authorization server — which is how both the MCP
client and the extension's dedicated public client obtain tokens — the
issued JWT carries `client_id` as a token claim distinct from an ordinary
password/session login, which carries none. Postgres verifies the JWT
signature before RLS ever evaluates `auth.jwt() ->> 'client_id'`, so a caller
cannot forge that value the way it could forge a request header or a body
field. This is not the same question as "does OAuth `scope` limit access" —
it does not, and no code here pretends otherwise — it is "does the token
itself carry a claim the extension's holder cannot rewrite," and the answer
is yes.

**Why it is not implemented in this PR.** Being trustworthy in principle is
not the same as being safe to ship blind. Three concrete gaps make writing
the policy now the wrong call rather than the cautious one:

1. **The extension's real `client_id` does not exist yet.** It is issued when
   the dedicated OAuth client is registered against a real Supabase project
   (see `docs/chrome-web-store-release.md`, OAuth section), which itself
   depends on the Chrome Web Store item existing. A policy authored today
   would have to reference a value nobody has yet, hardcoded or otherwise.
2. **No environment in this review can execute the pgTAP suite.** Docker is
   unavailable here, as in the prior audit, and RLS is exactly the kind of
   change where "the SQL parses" is not evidence it is correct: a
   `client_id`-restricted policy that fails closed for the wrong role, or
   fails open because of `NULL` comparison semantics on an ordinary
   session's absent `client_id` claim, is a materially worse outcome than
   today's status quo — a bug here can break every user's access, not just
   the extension's.
3. **The design has real decisions still open**, not just an SQL predicate:
   whether a capture-only client should be blocked from `UPDATE`/`DELETE`
   entirely (matching the product's stated single purpose) or only from
   specific columns, how the policy behaves for tokens with no `client_id`
   claim at all (every existing web-session and password-login token), and
   how it composes with the existing owner-scoped policies rather than
   replacing them.

**Recommended follow-up design**, for the PR that does implement this against
a real Postgres project: store the extension's registered `client_id` in a
small server-side settings table (not hardcoded into a migration, since the
value is assigned at OAuth-client-registration time and must remain
changeable without a schema change), and add a policy that permits `INSERT`
unconditionally for `authenticated` (capture's only operation) while
restricting `UPDATE`/`DELETE` on `applications` to rows where
`auth.jwt() ->> 'client_id'` is either absent or does not equal the stored
extension client id. That policy, and the settings table it reads, need
their own pgTAP coverage proving both the restriction and that an ordinary
web/MCP session is unaffected, run against a real Postgres before merge —
not asserted from this review.

**What is unchanged from the prior audit's classification, and what is new.**
Cross-user isolation is still absolute and unaffected by any of this: RLS
authorizes strictly by `auth.uid()`, so a leaked or malicious extension
token still grants no access to another student's rows regardless of
`client_id`. No service-role key or elevated path is reachable from a bearer
token of any kind. What changes with a public Chrome Web Store release is
exposure, not blast radius: more installations mean more chances for a
tampered build or a stolen `chrome.storage.local` refresh token, but each
compromised grant still reaches only that one user's own data — never more
than an ordinary authenticated session already could.

**Recommendation:** accept this as a documented residual risk for this
release rather than block on an RLS change this review cannot safely test.
This is an explicit human risk-acceptance decision, not a default — see
`docs/chrome-web-store-release.md` for the recommendation in the context of
the overall Store-readiness GO/CONDITIONAL GO/NO-GO call.

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
returns an explicit conflict rather than guessing. The extension shows the
existing record and a link to it; it offers no "save another copy" control at
all. If one is ever added it must be an explicit user choice rather than a
silent override.

The check is a read followed by a write because PostgREST and the existing
schema provide no scoped transactional primitive for this policy. It prevents
ordinary repeated clicks after the first request completes, but two truly
simultaneous requests can race. The extension disables its submit control for
the whole request: pressing it moves the popup into a `saving` state that has no
submit control to press. If production evidence requires stronger
idempotency, add a scoped idempotency mechanism rather than a global URL
constraint.

## Source semantics

`application_source` means where the student found the opportunity and feeds
source analytics. The server never rewrites it to `Browser extension`, because
that is capture provenance, not a job source. A supplied source such as
`LinkedIn` remains `LinkedIn`; when source is unknown, the existing mapper stores
`Not specified`.

Neither the server nor the extension adds a capture-provenance column. Add one
only if a concrete product need arises, with a migration and privacy review
separate from source analytics.

The extension applies the same rule on its side. It names a source only when the
host settles the question — LinkedIn, Indeed, Glassdoor and a short list of
comparable boards. An applicant-tracking host is never a source, and an
employer's own careers page is not labelled `Company website`, because a posting
being served from `careers.example.com` does not establish that the student
found it there. Unknown stays unset, which the server stores as
`Not specified`.

## Privacy boundary

The public `/privacy` page now describes implemented behavior rather than an
intention. Page data is read only after the student opens the popup on a page;
only the posting's own published details and a short allowlist of standard
metadata are read; browsing is not monitored; credentials are used only to reach
the student's own Interndex account and are never given to the page. Captured
records remain editable and deletable through the web app, are used only to
provide Interndex functionality, and are not sold or used for personalized
advertising.

Each of those is now enforced by something rather than promised. There is no
content script and no host permission for job sites, so the extension has no
mechanism to read a page it was not opened on; `activeTab` grants that access
for one page at the moment of the click. Nothing runs between captures — the
service worker is event-driven and holds no timer, listener, or history.

The server can enforce authenticated, validated, owner-scoped writes. It cannot
by itself prove a client read a page only after a user gesture; that property
comes from the manifest, which is why `extension/tests/manifest.test.ts` asserts
the permission set rather than leaving it to review.

## The extension

### Package and build

`extension/` is a plain Manifest V3 package built by `tsc` and nothing else. No
React, no bundler, no extension framework. TypeScript compiles `src/*.ts` to ES
modules in `extension/dist/`, the service worker is declared `"type": "module"`,
and `popup.html` loads its script as a module — so the browser does the module
loading a bundler would otherwise be hired to do.

```text
extension/
  manifest.json          the permission surface, asserted by a test
  popup.html popup.css   the popup document and its styles
  tsconfig.json          build config; tsconfig.test.json adds the tests
  vitest.config.ts       the extension's own test project
  src/
    background.ts        service worker: the only holder of credentials
    popup.ts             wiring; popup-render.ts draws; popup-state.ts decides
    page-collector.ts    the injected reader — self-contained, by necessity;
                         its rules arrive as an argument and it never decides
                         which site it is on
    adapters.ts          deterministic adapter registry; LinkedIn is the only
                         identity-aware adapter in P1.1
    evidence.ts          field-level acceptance/rejection ledger and the one
                         evidence-to-value projection
    extractor.ts         structured data, then a recognized site, then a
                         corroborated title; json-ld.ts, html-text.ts,
                         source.ts and sites.ts are its parts
    sites.ts             the only file naming LinkedIn, Indeed or Workday, and
                         the only place a LinkedIn route is told apart
    auth.ts pkce.ts      Authorization Code + PKCE
    tokens.ts            credential storage and token-response validation
    capture.ts           the POST to /api/browser-capture
    messages.ts          what may cross a context boundary
    config.ts            public origins and the public OAuth client id
    chrome.d.ts          the browser APIs this extension is able to name
  tests/                 the extension's unit tests
```

Root scripts, following the existing naming:

```bash
npm run extension:typecheck   # tsc --noEmit over src and tests
npm run extension:test        # vitest, extension project only
npm run extension:build       # tsc, emits extension/dist
npm run extension:check       # all three
```

`npm run check` runs the application gate and then `extension:check`. Build
output is generated, not committed: `extension/dist` is ignored.

### Loading it locally

1. Set `EXTENSION_CONFIG` in `extension/src/config.ts` to the Interndex origin,
   the Supabase project URL, and the public OAuth client id registered for the
   extension.
2. Update `host_permissions` in `extension/manifest.json` to the same two
   origins. `extension/tests/manifest.test.ts` fails if the two disagree.
3. `npm run extension:build`.
4. In Chrome, open `chrome://extensions`, turn on Developer mode, choose "Load
   unpacked", and select the `extension/` directory.
5. Register the extension's redirect URI —
   `https://<extension-id>.chromiumapp.org/` — with the Supabase OAuth client.
   The id is shown on the extensions page, and
   `chrome.identity.getRedirectURL()` returns the same value.

### Permissions, and why each one

| Permission | Why |
| --- | --- |
| `activeTab` | Read the one page the student invoked the popup on, at the moment they invoked it. This is what replaces a host permission for job sites. |
| `scripting` | Run the collector in that page once. |
| `storage` | Hold the student's credentials in the extension. |
| `identity` | `launchWebAuthFlow` and `getRedirectURL` for the OAuth flow. |

Host permissions are the Interndex origin and the Supabase project origin, and
nothing else. Not requested, and asserted absent by test: `<all_urls>` or any
wildcard host, `tabs`, `cookies`, `history`, `webNavigation`, `webRequest`,
`notifications`, `downloads`, `bookmarks`, `background`, `alarms`. No content
script is registered and no resource is web-accessible.

`tabs` is deliberately absent. The popup calls `chrome.tabs.query` to learn
which tab it was opened on; without the permission that call still returns the
tab and simply omits `url` and `title`, which the extension does not need — it
reads the posting URL from the page `activeTab` already granted it.

### Explicit invocation

Capture begins in one place: the student clicks the toolbar button, which opens
the popup, which asks Chrome to run the collector once in the active tab. There
is no listener on navigation, no periodic work, no injected sidebar, and no
state carried between captures. Closing the popup ends the extension's interest
in that page.

### Extraction hierarchy

```text
extractJobReport(pageSignals)
        │
        ├── structured data the publisher asserts   (JSON-LD, then microdata)
        ├── deterministic capture adapter
        │       ├── LinkedIn identity-aware evidence
        │       ├── Workday identity-aware evidence
        │       ├── Indeed compatibility
        │       └── generic-page compatibility
        │
        └── a conservative generic fallback         (a title, with corroboration)
        │
        └── evidence-aware internal report → ExtractedJob compatibility projection
```

Every path now contributes to one internal evidence-aware report. An
established field records its bounded source and confidence (`exact` for a
direct posting signal; `strong` for corroborated generic fallback); ambiguous
candidates are retained only as sanitized rejection metadata and project to a
blank `ExtractedJob` field. Local diagnostics contain strategy/source codes,
warning codes and description length, never page HTML, full descriptions,
tokens or cookies. The popup, browser-capture API and payload remain on the
same `ExtractedJob` contract, which now also carries the three Rich Capture
fields below.

Nothing below the first level knows that Interndex, Supabase, OAuth,
`applicationCreationSchema` or MCP exist; site rules extract facts from a page
and stop there.

#### P1.1/P1.2 adapter and page-local evidence boundary

Adapter selection is based only on the invoked page URL and the registry's
declared order. It does not inspect document order. LinkedIn was the first
adapter to claim page-local posting-identity support; Workday is the second.
Indeed keeps its unchanged site-field compatibility path, while Greenhouse,
Lever, SmartRecruiters and unrecognized pages keep the unchanged generic path.
Those compatibility adapters report identity as unsupported, not unobserved.

For LinkedIn, the collector records each field beside the posting ids written
on the same bounded root that supplied it. A matching root may project. A root
that names another posting, names none, or contributes alongside a root naming
a different posting is rejected. One matching job id elsewhere in the document
cannot verify another root. Rejected evidence has no value-bearing path through
the centralized evidence projection, so it cannot reappear through the popup or
save payload.

For supported Workday routes, the address and selected detail root both state
the requisition id. Direct `/job/...` pages are scoped to the single
`jobPostingPage`; selected `/details/...` search panes are scoped to the single
`jobDetails` section. The collector reads the `requisitionId` inside that exact
root and attaches it to every field and selected link. Missing, conflicting or
mismatched root identity projects no automatic values. A requisition id in a
search-result card cannot verify fields from the selected detail root, and
multiple candidate roots are never resolved by document order.

Selected Apply and description links are judged at the same boundary before
they may participate in employer-domain resolution. This matters because the
stored `company_domain` drives the dashboard logo: a stale LinkedIn link must
not make the correct job display a previous or unrelated employer's logo.
Posting hosts and employer domains remain distinct, and the existing
applicant-tracking/job-board rejection list remains the final host safety floor.
P1.1 adds no domain guessing and no coverage heuristics.

1. **`schema.org` JobPosting.** As JSON-LD — a single object, a top-level array,
   `@graph`, several script blocks, `@type` as a string or an array, a full IRI
   type, malformed blocks skipped — and as microdata, read from `itemprop`
   attributes under the posting's own `itemscope` and flattened to the same
   property paths. Employer careers sites publish microdata far more often than
   job boards do, and reading it costs no site knowledge.
2. **A recognized site.** `extension/src/sites.ts` names LinkedIn, Indeed and
   Workday, and nothing else. It holds a table of selectors, two named
   relational strategies (both LinkedIn's), and a little URL arithmetic. The
   injected collector receives the rules for the current address as an argument,
   so it never decides which site — or which route — it is on, and every site is
   described in exactly one file.
3. **The page's own headings**, but only on an unrecognized site, and only with
   corroboration (below).

Below that, nothing — and on a recognized site level 3 does not run at all. A
named read path that finds nothing has found nothing, and the page's first
heading is not a second opinion.

#### Why three sites and not none

Site-specific extraction was deliberately absent from the first version, and
real-Chrome testing showed the boundary was drawn one notch too tight. The
generic path did produce blanks where it should have — but the fallback beneath
it stored "Welcome back" from a signed-in Indeed page and "Search for Jobs" from
a Workday page as job titles. A confident wrong title is worse than the blank it
replaced.

LinkedIn, Indeed and Workday carry most of a student's search. Greenhouse,
Lever and everything else stay out: the adapter seam exists now, so adding one
later is a table entry, and adding one now without evidence would be inventing
selectors.

#### Selector rules

In order of preference: structured data; semantic and accessibility attributes;
stable data attributes a site maintains for its own automation (`data-testid` on
Indeed, `data-automation-id` on Workday); narrowly scoped component containers;
and human-visible text only inside a container that is trustworthy on its own.
Nothing keys off generated class hashes, `nth-child`, layout position, colour,
or nesting depth. A site that cannot be read reliably returns blanks.

#### Per-site notes

- **LinkedIn.** Not a selector list. The class names this adapter first carried
  matched nothing on the LinkedIn actually being served, and every field came
  back blank in real Chrome. The live markup names the employer in an
  `aria-label` of the form `Company, <employer>.` and marks the description
  container with `data-testid="expandable-text-box"`; the title and the
  location carry no id, role, `aria-label` or `data-testid` at all, and their
  classes are generated hashes such as `_c753af09` that change on any deploy.

  A list of selectors cannot express "the title inside the card this company
  belongs to", so LinkedIn is described as a named strategy — one, not a
  framework — and the collector implements it: find the labelled company, climb
  a bounded path to the card it belongs to, and take the title and the location
  from inside that card and nowhere else. A company anchor inside a list item is
  skipped, because the search view renders every result as one and each names a
  company too. The description is anchored to the visible "About the job"
  heading, because more than one element on the page carries the description
  container's test id and one of them is a hiring-insights upsell — taking the
  first would store an advertisement as the saved posting.

  Every step is bounded and every step that cannot be completed leaves its field
  blank. LinkedIn is a single-page application, so the student may move between
  postings without a navigation; the extension runs only on an explicit click
  and reads whatever is selected at that moment. No observer, no background
  listener, nothing watching navigation. Source is `LinkedIn`, which the
  hostname settles.

  **Similar Jobs is a different read, because the labelled company lies there.**
  On `/jobs/collections/similar-jobs/?currentJobId=…&referenceJobId=…` the page
  shows the posting the student selected while keeping the markup of the posting
  they arrived from — including a perfectly valid `aria-label="Company, …"` for
  that earlier job. Real-Chrome testing found the ordinary read filing a
  different employer, a different title and a different city than the screen was
  showing. Nothing about that is a selector mistake: the semantic anchor is
  real, it is simply the wrong posting's, and no selector distinguishes them.

  What does distinguish them is that the stale markup is not drawn. So the
  Similar Jobs read trusts only rendered elements — non-zero geometry, not
  `hidden`, not `aria-hidden`, not `display: none` or `visibility: hidden` —
  and resolves the pane in the order the evidence supports: first an element
  carrying the selected `currentJobId`, then the visible "About the job" region
  of the posting on screen. Rendered is not the same as scrolled into view; a
  student reading the bottom of a long posting still has that posting's header
  above the viewport, so intersection is deliberately not part of the test.

  Within the resolved pane the employer comes from its own label, or failing
  that from a link to the employer's LinkedIn company page — a URL shape rather
  than a class, scoped so it can only name the employer on screen. If neither a
  job-id element nor a visible About-the-job region resolves a pane, every field
  stays blank. A blank popup the student types into is a far better outcome than
  silently filing the job they navigated away from.

  `referenceJobId` is never posting identity. The address is routed on its
  presence, and the stored URL is built from `currentJobId` on every LinkedIn
  route, so a record can never combine one job's address with another's fields.
- **Indeed.** Employer, title, location and description from Indeed's own test
  attributes and the stable description id. Source is `Indeed`.
- **Workday.** Title, every stated location and description from stable
  `data-automation-id` values inside the identity-verified selected root. The
  employer may come from tenant-corroborated board branding or declarative
  posting/sidebar copy. A board `logoLink` (or one unambiguous board-sidebar
  destination where no logo link exists) may establish an employer domain only
  after the selected root independently verifies its requisition and the host
  passes the ATS/job-board/social/redirect/CDN rejection list. Logo name and
  destination use a distinct board-employer evidence path; they are not treated
  as job-description links or required to appear inside the selected root.

  One logo link states its employer at most once. A single link commonly
  carries two accessible names — the image's `alt` describes the mark, the
  anchor's `aria-label` describes where the link goes — and reading both as
  competing employers is what blanked Company on the live BDO board while
  title, locations and description all filled. The mark's own description is
  read first because it names the employer rather than a destination; a
  generic, empty or address-shaped source is passed over rather than accepted.
  Disagreement is judged across links, where two different employers is a real
  conflict and still refuses both.
  **Source is never set to `Workday`**: Workday is an applicant-tracking system,
  not where a student found the opportunity. **A Workday hostname is never a
  company domain**, and the employer is left empty unless the posting itself
  establishes it — a tenant hostname names whoever bought Workday.

#### The generic fallback, and what stops it

A heading becomes a job title only when at least two of these agree that the
page is a posting:

- the address names one posting — a job-shaped path segment followed by
  something that identifies a particular job, or an explicit job-id parameter;
- the page offers a control that applies for something;
- the page declares itself a job page in `og:type`.

A structured JobPosting is corroboration on its own, so a publisher who declared
a posting but omitted `title` still gets a title from the heading.

Beneath that there is a short backstop that refuses whole-string page furniture
— `Home`, `Jobs`, `Careers`, `Search for Jobs`, `Welcome back`, `Sign in` and
about a dozen more — and refuses a candidate that is only the site's own name.
It is a backstop, not the mechanism: the structural test above is what does the
work, and the list is deliberately not a growing corpus of English phrases.

When the evidence is not there, `jobTitle` is `undefined`. That is the correct
answer.

Specific rules worth stating:

- **Employer domain** comes only from `hiringOrganization.url` or `sameAs`,
  never from the address bar, and an applicant-tracking or job-board host is
  rejected even when the posting names one there.
- **Descriptions** are converted from HTML to plain text by string handling
  with no `innerHTML`, no `DOMParser`, and no element built from posting
  content. A description over Interndex's 50,000-character limit is shortened
  and says so, in the text and in the popup, rather than being cut silently.
- **The stored URL** prefers a recognized site's per-posting address, then a
  canonical link, and only ever one on the same host as the page being viewed.
  LinkedIn and Indeed both show a selected posting inside a search page whose
  own URL and canonical link describe the search; filing every job opened from
  one result list under that single address would make them all look like one
  job to the exact-URL duplicate check.

#### `validThrough` is an expiry, not a deadline

Real-site testing found a posting whose page said "apply by September 13" while
its `validThrough` produced September 14. Neither party was lying, and there is
no generic way to tell which is right:

- `validThrough` is defined as when the **posting** expires, not when the
  student must apply. A publisher who means "the last day to apply is the 13th"
  routinely writes the exclusive end of that day, `2026-09-14T00:00:00`.
- A timestamp also carries a zone, stated or implied. `2026-09-13T23:59-04:00`
  is `2026-09-14T03:59Z`, and which calendar day that is depends on whose clock
  is asked.

Both mechanisms are ordinary, both are invisible in the value itself, and both
are off by exactly one day — the worst possible size of error for a deadline.

**The decision: a `validThrough` carrying any time component is not stored as an
application deadline.** A bare `YYYY-MM-DD` is, because there is no boundary and
no zone left to disagree about. Anything else is omitted, and the student can
type a deadline they can see on the page. There is no site-specific correction
anywhere, and no attempt to infer a publisher's intent from the shape of a
timestamp. A deadline that is quietly a day late is the kind of wrong nobody
notices until it has cost them the application.

#### Salary is refused unless it is money

The same testing found a posting publishing `baseSalary.value.value: 0`, which
the first version stored as `USD 0 per year` — not an unknown salary but a false
one, in a field a student would use to compare offers.

- Zero, negative and non-finite amounts are refused; they are template
  placeholders, never compensation.
- A range whose maximum is below its minimum is refused. A range whose bounds
  are equal collapses to one figure.
- A half-stated range is qualified rather than rounded into a figure: a lone
  `minValue` becomes `CAD 50,000+ per year`, a lone `maxValue` becomes
  `CAD up to 80,000 per year`. Rendering either as a bare figure would read as
  the salary, and it is not.
- A written-out `baseSalary` string is kept as the publisher wrote it, unless
  every number in it is zero.
- A bare number with no currency is still left out.

#### Rich capture: work arrangement, work term, duration

Capture also persists three factual details about the term itself —
`work_arrangement` (`Remote`, `Hybrid` or `On-site`), `work_term` (`Summer
2027`) and `duration` (`4 months`, `16 weeks`) — on the existing external record
contract's own field names. No server, schema or API change was needed: those
fields were already part of `externalJobRecordSchema`.

They are extracted, not classified. `extension/src/rich-fields.ts` holds three
small pure helpers that read statements out of text the extractor has already
tied to the selected posting — its title, its description, and structured
`jobLocationType` where structured data is trusted at all. There is no model, no
network call and no new dependency.

- **Work arrangement** comes from a dedicated posting field (`Work arrangement:
  Hybrid`, `Work model: Remote`, `Work setting: On-site`), from the arrangement
  a recognized site states for the selected posting (below), from an arrangement
  the title states as its own (`Analytics Intern (Hybrid)`, `Analytics Intern —
  Remote`), or from `schema.org`'s one standardized structured signal,
  `jobLocationType` naming telecommuting. Nothing else: a city is not an
  arrangement, "flexible working environment" is not Hybrid, "may work remotely
  on Fridays" is not Remote, and an office address is not On-site.
- **Work term** needs a season *and* its year, stated by the posting —
  `Summer 2027 Internship`, `Work term: Fall 2026`. Casing is normalized and
  nothing else is rewritten. A term is never derived from the posting date, the
  deadline, today's date, a start date, or a university calendar, and a bare
  season in prose establishes nothing.
- **Duration** comes from a labelled length (`Duration: 4 months`, `Term length:
  16 weeks`) or from a length stated against the job itself (`8-month co-op`,
  `16-week internship`). A `2-week training`, a `3-month probation` and
  `5 years of experience` are lengths of something that is not the job, and none
  of them reaches the field. No start/end-date arithmetic happens anywhere, and
  weeks are never converted into months.

Two statements that disagree end the field. `Summer/Fall 2027`, a title saying
Hybrid against a description saying Remote, a `4-month internship` beside a
`Duration: 8 months` — each is recorded as an ambiguous field with the reason
`conflicting_evidence` and projects to a blank. There is no precedence table
that resolves them, because no general fact about publishing makes either side
right, and a coin toss is exactly the kind of wrong that survives unnoticed.

**LinkedIn states the arrangement beside the location.** On the card the
address names, the live markup writes `Toronto, Ontario, Canada (Hybrid)`. The
collector was already removing that suffix to normalize the location and then
throwing it away; it is now kept as its own bounded fact, `workplaceType`, read
from the same element the location comes from and therefore belonging to the
same selected posting. Only the three explicit suffixes are recognized —
`(Hybrid)`, `(Remote)`, `(On-site)` — the normalized location output is
unchanged, and nothing about which posting is selected, which frame is read, or
how company, title and location are chosen was touched. A location that states
no suffix establishes no arrangement, and `St. John's (NL)` keeps its
parentheses because only a terminal work mode is a work mode.

Each established rich field inherits the evidence of the bounded field it was
read out of, so a work term read from a LinkedIn selected posting records
`linkedin_selected_posting` rather than the pattern that matched it — no new
source vocabulary was added. Confidence is `exact` for a dedicated field and
`strong` where a title or a sentence had to be read conservatively. Workday's
structured data stays untrusted for these fields exactly as it is for the
others: a stale JSON-LD arrangement cannot override the selected posting, and
where only stale structured data states a rich fact the field is ambiguous and
projects nothing.

**The extension sends no default.** A missing arrangement is omitted rather than
sent as `Unknown`, and a missing work term is omitted rather than sent as
`Not specified`. Both of those are stored defaults the server's mapper already
owns, and a client that also wrote them would be a second implementation of one
rule — the one shipped inside a browser, which is the harder of the two to
change.

### Popup

Three editable fields — company, job title, location — a status control offering
`Interested` and `Applied`, and one button. Not the full Add Application form:
this is a confirmation, not data entry.

Status defaults to `Interested` and is never inferred; being on an application
page does not mean the student submitted it. `date_applied` is not collected
even when they choose `Applied`, because the extension does not know it and
today's date would be a plausible-looking guess in a record used for follow-up
timing.

States: loading, disconnected, connecting, connect-failed, extracting,
extraction-failed, ready, saving, unauthorized, and saved (as either created or
already tracked). A rejected save, an unreachable server, and an Interndex error
all return to the form with the reason beside it and everything the student
typed intact. `popup-state.ts` holds this as pure data so each state can be
asserted without a browser.

Below the status control, a compact read-only **Also found** list names what is
being saved that the student did not type: whether a job description was saved
(and whether it was shortened), a deadline, a salary, the work arrangement, the
work term, the duration, a source, and that the original posting URL was
stored. It lists only what will actually be stored, so
a deadline the extractor refused never appears there as a promise, and it
disappears entirely when there is nothing extra to report.

It is not a second copy of the Interndex form. Category, every other stored
field, and any notion of extraction confidence stay out of it. The point is
narrow: important data should not enter a tracker invisibly, and a wrong
deadline or a bogus salary is exactly the kind that survives unnoticed when
nobody is shown it.

The three Rich Capture fields appear in that list too — `Work arrangement`,
`Work term`, `Duration` — for exactly the same reason the deadline and the
salary do: they are stored without being typed, and the student should not have
to take the extension's word for what it saved. They are read-only rows built
from the projected `ExtractedJob`, so an ambiguous candidate has no value to
list. Nothing else about the popup changed: one click, the same three editable
fields, the same status control, no confidence badges, no diagnostics, no extra
screen and no extra step.

Accessibility: every control has a `<label>`, the summary is a labelled region
with a real heading, one polite live region announces each state change, focus
is visible, controls are at least 36px high, and long employer and role names
wrap rather than overflow.

### Authentication

Authorization Code with PKCE (`S256` only) against the same Supabase
authorization server the web app and MCP use, through a **dedicated public
OAuth client** so Interndex Capture and a connected assistant are separate grants
a student can allow and revoke independently. No client secret exists, and an
unpacked extension could not keep one.

```text
Connect Interndex
  → 32 random bytes of state, 32 random bytes of code verifier
  → S256 challenge
  → chrome.identity.launchWebAuthFlow(authorize URL)
  → student signs in and approves on Interndex's consent screen
  → https://<extension-id>.chromiumapp.org/ callback
  → state compared before anything else in the callback is read
  → POST /auth/v1/oauth/token with the code and the verifier
  → token response validated before it is stored
```

Refused, with nothing stored: a state mismatch, a missing code, denied consent,
a closed window, a malformed token response, an unreachable token endpoint.

### Token handling and refresh

The access token lives in `chrome.storage.session`, which Chrome keeps in memory
and discards when the browser closes. The refresh token lives in
`chrome.storage.local`, which is on disk and not encrypted by Chrome.

That trade-off is deliberate and worth stating plainly rather than burying: a
refresh token that did not survive a browser restart would make "Connect
Interndex" a daily chore and train students to click through an OAuth screen
without reading it. `storage.local` is readable by this extension's own contexts
and by anyone holding the profile directory and the local account it belongs to.
It is not readable by web pages, by other extensions, or across profiles.
Signing out clears both areas, and revoking the connection in Interndex Settings
invalidates the token regardless of what is still stored locally.

Before a capture the worker uses a valid access token, refreshing first if the
stored one expires within a minute. If a capture is nonetheless rejected as
unauthorized, it refreshes **once** and retries **once**; a second rejection
clears the credentials and returns the popup to its disconnected state. There is
no loop and no third attempt. A refresh refused by the server clears the
credentials; a refresh that merely could not reach the server leaves them alone.

Signing out clears what this browser holds. It does not revoke the grant, and
the extension does not claim to: revocation belongs to Interndex Settings, where
Supabase is the source of truth about who still has access.

### Trust boundaries between contexts

| Context | May | May not |
| --- | --- | --- |
| Injected collector | Read the invoked page's JSON-LD, allowlisted metadata, canonical link, `h1` and title | Hold a token, call Supabase or Interndex, modify the page, run remote script |
| Popup | Present, take the student's confirmation, render outcomes | Hold a token |
| Service worker | OAuth, PKCE, tokens, refresh, the capture request | Hand a credential to anything else |

The collector returns raw page signals rather than a finished record, and the
interpretation happens in the extension. That keeps the untrusted-page half as
small as it can be and puts the part with rules in a file that can be tested.

Messages are validated on arrival even though both ends ship together.
`chrome.runtime.onMessage` is a shared inbox that content scripts can also
reach, and a content script carries the extension's own id — so the check is
that the sender's document is under the extension's own origin, not merely that
the id matches. A capture record is rebuilt field by field, which is why an
invented `user_id` cannot ride along to the API.

### The capture API boundary

The extension writes only through `POST /api/browser-capture`. It never writes
to a Supabase table directly, although the token it holds would be accepted by
one. The server owns validation, the duplicate rule, the truthful defaults, and
the audit surface; a client that wrote rows itself would be a second
implementation of all of that, drifting quietly. The extension re-implements no
server validation beyond checking that company and title are non-empty before a
round trip.

### Real-site compatibility

Partly established, by hand, in real Chrome — and the results are the reason
this document's extraction section reads the way it does.

**What was tested, and what happened**

| Surface | Result |
| --- | --- |
| KPMG direct careers page | Company, title, location, description, posting URL and status all correct. Two faults: a bogus `USD 0 per year` salary, and a deadline one day later than the page's own. |
| LinkedIn | Title correct. Company, location and description missing. Source correct from the hostname. |
| Indeed | Title **wrong** — the page's "Welcome back" greeting. Company, location, description missing. |
| BMO on Workday | Title **wrong** — "Search for Jobs". Company, location, description missing. |
| L3Harris direct careers page | Title correct. Company, location, description missing. |

A second pass in real Chrome, after the corrections above were built and
loaded, confirmed Workday now fills title, location and description, and found
that the LinkedIn selector list still filled nothing: none of its class names
match what LinkedIn serves. That produced the DOM evidence the LinkedIn
strategy is now built on, and is why LinkedIn is no longer a selector list at
all. IBM's direct careers page fills a title but remains weak on company,
location and description; that is separate evidence, not addressed here.

A third pass verified the LinkedIn strategy on `/jobs/view/<id>` and on
`/jobs/search-results/?currentJobId=<id>` — company, title, location and
description all populate — and verified Indeed on every field. It also found the
Similar Jobs route filing the wrong posting entirely, which is what the separate
Similar Jobs read above exists for.

Two different problems. The blanks were the design working: nothing was
established, so nothing was claimed. The two wrong titles were the design
failing — the generic fallback was willing to promote any first heading, and a
confident wrong title is worse than the blank it replaced.

**What changed as a result**

- Named read paths for LinkedIn, Indeed and Workday, and the generic heading
  fallback switched off on all three.
- JobPosting microdata read generically, which is the class of signal an
  employer careers page such as L3Harris is most likely to publish.
- The generic fallback now requires structural corroboration, and refuses page
  furniture and the site's own name.
- Zero and structurally meaningless salaries refused.
- `validThrough` accepted only as a bare calendar date.

**What is and is not verified against live pages**

The development environment's network policy denies outbound connections to job
sites — `www.linkedin.com`, `ca.indeed.com` and `*.myworkdayjobs.com` all fail
at CONNECT — so no live DOM was inspected while writing the selectors above.

- **Verified by the manual QA in real Chrome:** the failure modes in the table.
  Those are evidence about behaviour, not about markup.
- **Verified by tests:** every extraction rule, against minimal synthetic
  fixtures carrying the container, attribute and nesting each read path depends
  on. Structure is what a parser is proved by; no real posting is committed,
  because a real one would be somebody else's copyrighted text.
Verified in real Chrome, per surface:

| Surface | Status |
| --- | --- |
| Indeed | Company, title, location, description, source and posting URL all correct. |
| LinkedIn `/jobs/view/<id>` | Company, title, location and description all correct. |
| LinkedIn `/jobs/search-results/?currentJobId=<id>` | Company, title, location and description all correct. |
| LinkedIn Similar Jobs | Filed the **reference** posting instead of the selected one. Corrected by the separate read above; **not yet retested**. |
| Workday | Title, location and description correct. **Employer is still blank** and remains incomplete — a separate task, not closed here. |
| KPMG / L3Harris / IBM | Not retested since the salary and deadline corrections. |

The Similar Jobs correction is built from DOM observed in real Chrome on
26 August 2026 — the stale reference `aria-label`, the zero-geometry copies of
the visible posting, the absence of any stable id on the header chain — but the
read written from that evidence has not itself been run against LinkedIn. Every
step fails safe: a relationship that cannot be established yields a blank field,
never a wrong one.

**Still required, in real Chrome, locally**

1. Load the unpacked extension and connect it to a real Interndex account.
2. Open a public posting on each of LinkedIn (`/jobs/view/`, a job selected
   inside `/jobs/search-results/`, and a job selected from Similar Jobs),
   Indeed, a Workday tenant, and the KPMG, IBM and L3Harris careers pages.
3. Record, per site: which fields extracted correctly, which were absent, which
   were wrong, and whether the popup made the result usable anyway.
4. Confirm specifically that a job selected from Similar Jobs stores that job
   and not the one the browsing began at — scroll to More jobs, select a
   different posting, and capture without reloading — that the KPMG posting no
   longer stores a salary, and that its deadline is absent rather than a day
   late.
5. Record nothing else. Do not commit captured descriptions.

A site that still extracts nothing is a finding for PR #29. A site that extracts
something **wrong** is a bug in this one.

**P1.2 Workday fixtures**

- TD direct Workday posting: the prior title/location/description/duration
  capture remains covered; P1.2 adds identity-gated board-name and `logoLink`
  evidence for employer and domain. Real-Chrome confirmation is still required.
- Greenhouse-hosted posting: title and description correct; employer and
  location missing. This remains outside P1.2.
- BDO Workday search-results split pane at `/details/...`: the selected job is
  now represented by a matching-requisition fixture with title, three
  locations, employer, description and safe employer-domain coverage. A stale
  or neighbouring requisition yields a blank/manual form. Real-Chrome capture
  confirmation is still required.

**Read-only Workday data feasibility spike (1 September 2026)**

- The initial document contains only the client shell and `window.workday`
  tenant/site/locale configuration; it does not embed the selected job payload.
- Rendered direct pages expose `jobPostingPage`, `jobPostingHeader`,
  `job-posting-details`, `locations`, `requisitionId`,
  `jobPostingDescription` and an Apply URL under the selected root.
- Rendered search-result panes expose the selected posting as one `jobDetails`
  section. The results rail remains a separate `jobResults` section. The BDO
  JR6803 pane repeated `JR6803` inside `requisitionId` and exposed Vancouver,
  Calgary and Edmonton as separate location definitions.
- The board header exposes a `logoLink`; BDO pointed it to `bdo.ca` and TD to
  `careers.td.com`. This is explicit board-owned domain evidence. The Workday
  tenant host remains posting infrastructure and never supplies an employer
  name or domain.
- The public CXS job endpoint is technically useful: its response includes a
  stable internal posting id, requisition id, title, primary/additional
  locations, external URL and hiring-organization name. It is deliberately not
  called by the extension: P1.2 adds no request, permission, host permission,
  background fetch, dependency or network-architecture change.

### The least-privilege question

Supabase OAuth scopes affect what an identity token contains, not what Postgres
will accept. An authorized client therefore holds the authority of an ordinary
authenticated session — which is why the consent screen shows the extension the
same capability list it shows an assistant, and why that list is accurate rather
than merely convenient.

The extension confines itself to capture by construction: it calls one endpoint
and has no code that does anything else. That is a property of this client, not
a boundary the server enforces. See "Least-privilege review (launch hardening,
completed)" under "Trust and authentication boundaries" above for the full
threat model and classification: acceptable with residual risk for the current
unpacked/local-install distribution, not a launch blocker for the web/MCP
launch. Client-id-aware policies, if a review ever concludes they are
warranted, remain deferred to PR #29 along with Chrome Web Store submission.

## Explicitly deferred

Not part of the server foundation and not part of the extension: read paths for
any site other than LinkedIn, Indeed and Workday — Greenhouse, Lever, Glassdoor
and the rest wait for evidence, and the table in `sites.ts` is where one would
go; a generalized scraping framework; background monitoring; built-in AI;
classification; resume matching or tailoring; cover letters; autofill;
auto-apply; submission detection; recommendations; job discovery;
email or calendar integration; notifications; fuzzy deduplication; global URL
uniqueness; a browser-capture idempotency migration; client-id-aware RLS;
capture analytics, telemetry or an error-monitoring SDK; and Chrome Web Store
submission, listing or screenshots.

PR #28 proves the capture loop. PR #29 makes it reliable enough to distribute.
