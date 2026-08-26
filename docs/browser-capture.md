# Browser-capture architecture

Status: server-side foundation implemented (2026-08-25); JobTrack Capture
Chrome extension implemented as a locally loadable unpacked MV3 extension
(2026-08-26). Not submitted to or approved by the Chrome Web Store.

## Product boundary

The extension has one job: after an explicit user action, send the known
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
the student's own JobTrack account and are never given to the page. Captured
records remain editable and deletable through the web app, are used only to
provide JobTrack functionality, and are not sold or used for personalized
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
    page-collector.ts    the injected reader — self-contained, by necessity
    extractor.ts         JSON-LD, then metadata, then a title; json-ld.ts,
                         html-text.ts and source.ts are its parts
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

1. Set `EXTENSION_CONFIG` in `extension/src/config.ts` to the JobTrack origin,
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

Host permissions are the JobTrack origin and the Supabase project origin, and
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

1. **`schema.org` JobPosting JSON-LD.** Handles a single object, a top-level
   array, `@graph`, several script blocks, `@type` as a string or an array, and
   a full IRI type. A block that is not valid JSON is skipped, not fatal —
   pages ship one broken block beside good ones routinely.
2. **Standard metadata.** Open Graph, Twitter card, `meta description`,
   `<link rel="canonical">`.
3. **The page's own headings.** The first `<h1>`, then `document.title`, with a
   trailing site name removed only when it matches the page's declared
   `og:site_name`.

Below that, nothing. There are no site-specific selectors, and none were added
for LinkedIn, Workday, Greenhouse, Lever, Indeed or Glassdoor. A selector guess
on an unfamiliar site produces a confident wrong record, and the student — who
asked to save one job and got a filled-in form — has no reason to doubt it.
Fields that cannot be established are left empty for the student to type.

Specific rules worth stating:

- **Employer domain** comes only from `hiringOrganization.url` or `sameAs`,
  never from the address bar, and an applicant-tracking or job-board host is
  rejected even when the posting names one there.
- **Descriptions** are converted from HTML to plain text by string handling
  with no `innerHTML`, no `DOMParser`, and no element built from posting
  content. A description over JobTrack's 50,000-character limit is shortened
  and says so, in the text and in the popup, rather than being cut silently.
- **The stored URL** prefers a canonical link, but only one on the same host as
  the page being viewed; a canonical pointing elsewhere is refused, because it
  would file the posting under an address the student never visited.
- **`validThrough`** becomes a deadline only when it is a real date;
  `2026-02-31` is discarded rather than normalized into a different day.
- **`baseSalary`** is read only when it maps cleanly — a currency with a value
  or a range. A bare number with no currency is left out.

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
already tracked). A rejected save, an unreachable server, and a JobTrack error
all return to the form with the reason beside it and everything the student
typed intact. `popup-state.ts` holds this as pure data so each state can be
asserted without a browser.

Accessibility: every control has a `<label>`, one polite live region announces
each state change, focus is visible, controls are at least 36px high, and long
employer and role names wrap rather than overflow.

### Authentication

Authorization Code with PKCE (`S256` only) against the same Supabase
authorization server the web app and MCP use, through a **dedicated public
OAuth client** so JobTrack Capture and a connected assistant are separate grants
a student can allow and revoke independently. No client secret exists, and an
unpacked extension could not keep one.

```text
Connect JobTrack
  → 32 random bytes of state, 32 random bytes of code verifier
  → S256 challenge
  → chrome.identity.launchWebAuthFlow(authorize URL)
  → student signs in and approves on JobTrack's consent screen
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
JobTrack" a daily chore and train students to click through an OAuth screen
without reading it. `storage.local` is readable by this extension's own contexts
and by anyone holding the profile directory and the local account it belongs to.
It is not readable by web pages, by other extensions, or across profiles.
Signing out clears both areas, and revoking the connection in JobTrack Settings
invalidates the token regardless of what is still stored locally.

Before a capture the worker uses a valid access token, refreshing first if the
stored one expires within a minute. If a capture is nonetheless rejected as
unauthorized, it refreshes **once** and retries **once**; a second rejection
clears the credentials and returns the popup to its disconnected state. There is
no loop and no third attempt. A refresh refused by the server clears the
credentials; a refresh that merely could not reach the server leaves them alone.

Signing out clears what this browser holds. It does not revoke the grant, and
the extension does not claim to: revocation belongs to JobTrack Settings, where
Supabase is the source of truth about who still has access.

### Trust boundaries between contexts

| Context | May | May not |
| --- | --- | --- |
| Injected collector | Read the invoked page's JSON-LD, allowlisted metadata, canonical link, `h1` and title | Hold a token, call Supabase or JobTrack, modify the page, run remote script |
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

Not yet established. The development environment's network policy denies
outbound connections to job sites, so no posting on LinkedIn, Indeed,
Greenhouse, Lever, Workday, Glassdoor or an employer careers page has been
captured. Extraction has been verified against synthetic pages carrying the
markup shapes those sites publish, and the whole loop has been verified in real
Chromium against a local stub — but neither is evidence about a real posting.

This is the first thing to do before PR #29 and the main reason PR #29 exists.
The procedure:

1. Load the unpacked extension and connect it to a real JobTrack account.
2. Open a public posting on each of: an employer careers page, LinkedIn,
   Indeed, Greenhouse, Lever, Workday.
3. Record, per site: which fields extracted correctly, which were absent, which
   were wrong, and whether the editable popup made the result usable anyway.
4. Record nothing else. Do not commit captured descriptions — they are somebody
   else's copyrighted text.

A site that extracts nothing is a finding for PR #29, not a reason to add a
selector to this one.

### The open least-privilege question

Supabase OAuth scopes affect what an identity token contains, not what Postgres
will accept. An authorized client therefore holds the authority of an ordinary
authenticated session — which is why the consent screen shows the extension the
same capability list it shows an assistant, and why that list is accurate rather
than merely convenient.

The extension confines itself to capture by construction: it calls one endpoint
and has no code that does anything else. That is a property of this client, not
a boundary the server enforces. Before any public distribution, decide whether
client-id-aware policies are required so that a token issued to the capture
client cannot do more than capture. That work is deferred to PR #29 along with
Chrome Web Store submission.

## Explicitly deferred

Not part of the server foundation and not part of the extension: site-specific
adapters for LinkedIn, Workday, Greenhouse, Lever, Indeed or Glassdoor; a
generalized scraping framework; background monitoring; built-in AI;
classification; resume matching or tailoring; cover letters; autofill;
auto-apply; submission detection; recommendations; job discovery;
email or calendar integration; notifications; fuzzy deduplication; global URL
uniqueness; a browser-capture idempotency migration; client-id-aware RLS;
capture analytics, telemetry or an error-monitoring SDK; and Chrome Web Store
submission, listing or screenshots.

PR #28 proves the capture loop. PR #29 makes it reliable enough to distribute.
