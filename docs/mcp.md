# MCP integration

Claude connects to this application as a remote MCP client and acts as the
signed-in student: it can save, list, read, and update job applications in the
same tables the web dashboard reads.

## Why there is no separate API-key system

An MCP request has no browser cookies, so it needs some other way to prove who
it is. Three options were considered:

| Approach | RLS applies | `auth.uid()` | Secret required |
|---|---|---|---|
| Supabase OAuth 2.1 access token | yes | correct user | none |
| Self-signed JWT (legacy JWT secret) | yes | correct user | JWT secret |
| `service_role` client | **no** | `null` | service-role key |

Supabase's OAuth 2.1 server issues ordinary Supabase JWTs (`sub` = user id,
`role` = `authenticated`). Handing one to a normal publishable-key client makes
every query run as that user, so the row-level security policies in
`supabase/migrations` remain the enforcing authorization boundary on the MCP
path exactly as they are for the website.

This is why **no service-role key and no JWT signing secret exists anywhere in
this application**, and why there is no bespoke API-key table to leak.

## Request flow

```text
Claude ──1── POST /api/mcp  (no token)
       ◄─2── 401 + WWW-Authenticate: resource_metadata="…"
       ──3── GET /.well-known/oauth-protected-resource
       ◄─4── { resource, authorization_servers: [Supabase] }
       ──5── Supabase discovery, dynamic client registration, PKCE
       ──6── browser opens /oauth/consent  → student signs in and approves
       ◄─7── authorization code → access token (issued by Supabase)
       ──8── POST /api/mcp  Authorization: Bearer <token>
                  │
                  ▼
        verify token ─► resolve user ─► repository ─► Postgres (RLS)
```

## Files

| File | Role |
|---|---|
| `app/api/mcp/route.ts` | MCP endpoint; picks the data access the tools get |
| `lib/mcp/tools.ts` | The four tool registrations, over an injected repository |
| `lib/mcp/repository.ts` | Binds the RLS repository to one verified request |
| `lib/mcp/list-jobs.ts` | `list_jobs` orchestration and summary shaping |
| `lib/mcp/get-job.ts` | `get_job` orchestration and record shaping |
| `lib/mcp/update-job.ts` | `update_job` read-merge-write orchestration |
| `lib/auth/bearer-identity.ts` | Generic bearer parsing, token validation, and user resolution |
| `lib/mcp/identity.ts` | Adapts a verified bearer identity to MCP `AuthInfo` |
| `lib/mcp/user.ts` | Reads the verified user id off a request |
| `lib/supabase/bearer.ts` | Token-scoped Supabase client (no cookies) |
| `lib/validation/mcp.ts` | Every tool's wire contract and field mapping |
| `app/api/oauth-protected-resource/route.ts` | RFC 9728 discovery document |
| `app/oauth/consent/page.tsx` | Consent screen Supabase redirects users to |
| `lib/oauth/actions.ts` | Approve / deny decision |

## Security properties

- **No tool accepts a `user_id`.** Ownership comes from the access token only.
  `applications.user_id` defaults to `auth.uid()`, resolved from that token,
  and every read is additionally scoped to that id before row-level security
  checks it again. A test asserts the argument is absent from all four
  advertised schemas and from the mapped values.
- **A record you do not own is indistinguishable from one that does not
  exist.** `get_job` and `update_job` return the identical message for both,
  and `list_jobs` returns an empty list rather than an error.
- **Tool input is validated twice.** The MCP schema is permissive so Claude can
  fill it easily; the result is then re-parsed by the same
  `applicationCreationSchema` the web form uses, so both surfaces enforce
  identical rules.
- **Authentication fails closed.** A missing, malformed, expired, or revoked
  token yields 401. If Supabase cannot be reached, verification returns
  `undefined`, which is also a 401 — never an unauthenticated success.
- **Untrusted job-description text is only ever data.** It is stored as a
  parameter and rendered as plain text; it never selects a table, a user, or a
  tool.
- **The consent decision is a Server Action**, so Next.js applies origin checks
  and a cross-site form post cannot approve access to somebody's tracker.
- **Discovery metadata is derived from configuration**, not from forwarding
  headers, so a spoofed `X-Forwarded-Host` cannot redirect a client's
  authorization attempt elsewhere.

Note that OAuth *scopes* do not restrict database access — Supabase states that
`openid`/`email`/`profile`/`phone` only affect ID-token contents. The consent
screen therefore describes access truthfully but does not enforce it. To
genuinely restrict what an MCP client may do relative to the website, add
policies keyed on `auth.jwt() ->> 'client_id'`.

The same limitation applies to browser capture: the foundation endpoint accepts
a valid Supabase-issued bearer token and relies on the existing owner RLS, but
that token's nominal OAuth scopes are not a write-only database capability. A
public Chrome Web Store release therefore requires a dedicated extension OAuth
client and an explicit least-privilege review, including whether `client_id`-
aware policies should restrict that client to the intended capture operation.
The current Settings grant list and consent copy describe/revoke OAuth clients;
they do not create database-level capability restrictions.

## Client compatibility aliases (`/authorize`, `/token`)

Supabase is the real authorization server and our RFC 9728 metadata names it
correctly. Claude's custom connector currently **ignores** that
`authorization_servers` value and synthesizes OAuth endpoints on the MCP
resource origin instead, producing a 404:

```text
observed:  https://<our-domain>/authorize?response_type=code&client_id=…   → 404
correct:   https://<ref>.supabase.co/auth/v1/oauth/authorize?…
```

Two aliases exist purely to absorb that:

- `GET /authorize` — 302 redirect to Supabase's authorize endpoint with the
  query string copied **verbatim**. Parameters are never parsed, rewritten, or
  invented, because `state` and `code_challenge` must arrive byte-identical or
  PKCE fails.
- `POST /token` — server-side proxy to Supabase's token endpoint. A redirect
  will not do: the body carries the authorization code and PKCE verifier, and
  clients need not replay a body across a cross-origin redirect.

The destination is always built from the configured `NEXT_PUBLIC_SUPABASE_URL`,
using only its **origin**. Nothing from the request can move it to another
host — `redirect_uri` is forwarded unexamined precisely because validating it
is Supabase's job, against the registered client.

Neither alias changes the authorization model. Supabase still issues every
token, RLS is still the enforcing boundary, and no service-role key or JWT
secret is introduced. Delete both once the client honours the metadata.

RFC 8414 metadata is deliberately **not** served at our origin. See
`docs/implementation-log.md` for why, and what would change that.

## Tools

All five tools exist: `save_job`, `import_jobs`, `list_jobs`, `get_job`, and
`update_job`.

`save_job` and `import_jobs` accept the **same record**, `newJobRecordSchema` —
one at a time and many at a time. They share the schema object itself rather
than two lists of fields kept in step by hand, so a field either tool could not
express would be a field the other quietly stored better.

### `save_job`

| Argument | Required | Notes |
|---|---|---|
| `company` | yes | |
| `job_title` | yes | |
| `location`, `job_description`, `job_url`, `source`, `notes` | no | |
| `status` | no | Defaults to `Interested` |
| `category` | no | Defaults to `Other` |
| `deadline`, `date_applied` | no | `YYYY-MM-DD` |
| `work_term`, `duration` | no | e.g. `Summer 2027`, `4 months` |
| `work_arrangement` | no | `Remote`, `Hybrid`, `On-site`; defaults to `Unknown` |
| `salary` | no | As the posting states it |
| `next_action`, `next_action_due_date` | no | A due date is only kept alongside an action |
| `company_domain` | no | The employer's canonical domain, e.g. `shopify.com`. Claude fills this in |

It returns structured output as well as its sentence:
`{ application_id, company, job_title, status }`, so a client need not list the
tracker again to find what it just created.

`work_term_season` is a required column that a posting rarely states, so it
falls back to the same `Not specified` sentinel the web form uses.

`company_domain` is brand metadata used to show the employer's logo, and
nothing else.

The tool asks Claude to treat it as ordinary employer metadata and fill it in
whenever the employer can be reasonably identified — from the posting, the
employer name, a supplied URL, or ordinary knowledge — rather than waiting to
be asked for a domain or a logo. "Save this KPMG internship" should produce
`company: KPMG Canada` and `company_domain: kpmg.com` in one step, because a
student asking for a job to be saved is not thinking about brand assets. The
guidance names the hosts that are not the employer (Workday, Greenhouse, Lever,
LinkedIn, Indeed) and carries worked examples: Shopify → `shopify.com`, KPMG →
`kpmg.com`, RBC or Royal Bank of Canada → `rbc.com`, BMO → `bmo.com`,
Microsoft → `microsoft.com`.

That expectation lives entirely in the tool description, which is the whole
mechanism. **Interndex still infers nothing**: no employer-to-domain table
exists in the application, no model is called from the server, and the Logo.dev
Search and Brand APIs are not used. The knowledge is Claude's, and it arrives
over the wire like any other argument.

It is deliberately not the posting URL (`job_url` holds that), a recruiter's
email domain, or the applicant-tracking host a posting happens to be served
from. Whatever arrives is normalized to a bare lowercase hostname by the same
helper the web form uses, so `https://www.shopify.com/careers` is stored as
`shopify.com`, and anything that is not a plausible domain is rejected rather
than stored.

The field stays optional and the column stays nullable, and that is the safety
net rather than an oversight: an employer that genuinely cannot be identified
confidently produces a save with no domain and a local lettermark, never a
failed save and never a guess. A student can always correct or clear the value
on the edit form.

### `import_jobs`

For migrating a tracker the student already keeps somewhere else.

| Argument | Required | Notes |
|---|---|---|
| `applications` | yes | 1–25 records, each exactly a `save_job` record |

Returns `{ imported, applications: [{ application_id, company, job_title }] }`
and the sentence `Imported 23 applications into Interndex.`

**The CSV never reaches Interndex.** The student uploads their export to their
assistant; the assistant reads it, works out what the columns meant, resolves
the ambiguities with them, and sends canonical records. Interndex validates and
stores. That division is the whole design, and it is why there is no upload
control on the website, no CSV parser in this repository, and no spreadsheet
dependency in `package.json`.

What must already be resolved before the call:

- **Statuses** are Interndex's own ten. `OA`, `Interviewing`, `Ghosted`,
  `Submitted` and `Phone screen` are rejected by the schema, because deciding
  that `Ghosted` means `Rejected` is a claim about an employer that only the
  student can make.
- **Dates** are `YYYY-MM-DD`. `03/04/2026` is March 4th or April 3rd depending
  on whose spreadsheet it is, and Interndex must never be the one guessing.
- **Duplicates** have been reviewed. The assistant is told to check with
  `list_jobs` — narrowing by company where that helps — and to ask the student
  whether a row that looks present already should be skipped or imported again.
  Interndex does no fuzzy matching, no silent merge, and no silent skip: a
  deduplication guess made inside a database write is one nobody can see.
- **Unmapped columns** are the assistant's to place. A recruiter name or a
  resume version has no Interndex column and is not getting one; the assistant
  may fold what is useful into that record's `notes`, having told the student
  it is doing so.

Batch size is capped at 25, which is `LIST_JOBS_DEFAULT_LIMIT` — deliberately
the same number, so a batch is as much as the duplicate check just showed the
student. A hundred-row tracker arrives as four batches they can watch land, and
the tool description tells the assistant to keep the agreed mapping identical
across all of them.

**All-or-nothing, twice over.** Every record is validated through
`applicationCreationSchema` — the same schema the web form uses — before
anything is written, and the first failure returns without a write:

```text
Nothing was imported. Import record 17 (RBC — Business Analyst Intern) could not
be validated: Next action due date requires a next action. Fix that record with
the student and send the batch again.
```

Then the whole batch goes through `createApplications`, one `insert` carrying
every row. One statement is one implicit transaction, so a constraint or policy
violation takes the batch down whole. There is no per-record write to partially
succeed — no loop, and no `Promise.all` of single inserts.

**No history is fabricated.** An application imported at `Interview` is stored
at `Interview`, with whatever `date_applied` the student recorded. The database
trigger writes the one creation event saying it entered Interndex at that
status, which is true. The stages it passed through before Interndex existed are
not ours to invent, `created_at` is import time and is never backdated, and no
application code writes to `application_status_history` at all.

Ownership is the same as everywhere else: no `user_id` argument exists, the
inserted rows carry no owner column, `auth.uid()` from the caller's own token
fills it in, and the insert policy checks it again.

### `list_jobs`

The tool that removes the need for a student to know an identifier. Claude
lists, reads the short records, and picks the application the student meant.

| Argument | Required | Notes |
|---|---|---|
| `status` | no | One of the ten application statuses |
| `company` | no | Case-insensitive substring of the employer name |
| `work_term` | no | Case-insensitive substring, e.g. `Summer 2027` or `2027` |
| `archive_state` | no | `active` (default), `archived`, or `all` |
| `limit` | no | Defaults to 25, ceiling 50 |

Each record carries `application_id`, `company`, `job_title`, `status`,
`work_term`, `location`, `deadline`, `date_applied`, and `archived` — and
nothing else. `company_domain` is deliberately absent: this tool exists so
Claude can tell one saved application from another, and a brand domain is not
something anyone chooses between applications by. It is on `get_job` instead. `job_description` and `notes` are absent from the query's
projection, not filtered out afterwards, so a list response cannot carry a
50,000-character posting however many applications match.

The result also reports `returned` and `has_more`. `has_more` comes from
fetching one row past the limit and dropping it, so Claude knows to narrow the
filters without paying for a second counting query.

Filters are literal, not fuzzy. `company: "RBC"` matches stored text
containing `RBC`, with `%` and `_` escaped so a name matches itself; it does
not match "Royal Bank of Canada" by meaning. Deciding which application a
student meant is Claude's reasoning over the returned candidates — a tracker
that silently guesses is worse than one that shows the options. An oversized
`limit` is refused by the advertised schema rather than quietly trimmed.

### `get_job`

Takes `application_id` and nothing else. Returns the whole stored application:
`company`, `company_domain`, `job_title`, `status`, `category`,
`work_arrangement`, `location`,
`work_term`, `duration`, `job_url`, `source`, `job_description`, `deadline`,
`date_applied`, `salary`, `notes`, `next_action`, `next_action_due_date`,
`archived`, `created_at`, and `updated_at`.

What it does not return: `user_id` (never selected), `classification_confidence`
and `classification_matches` (a classifier this product dropped), and any
version token — `update_job` reads the record's own `updated_at` when it
writes, so Claude never has to carry one.

An application belonging to another student returns exactly what a nonexistent
id returns, because the read is owner-scoped and RLS applies again underneath.

### `update_job`

Takes `application_id` plus any subset of the fields the web edit form owns:
`company`, `company_domain`, `job_title`, `location`, `status`, `category`,
`work_arrangement`, `job_description`, `job_url`, `source`, `deadline`,
`date_applied`, `work_term`, `duration`, `salary`, `notes`, `next_action`,
`next_action_due_date`.

An omitted field keeps its stored value. An empty string clears a field that
is allowed to be empty; a required field cannot be emptied. There is no
dedicated interview-date column, so a phrase like "the interview is
September 4" is expressed as `next_action` plus `next_action_due_date`.

Those two are the one pair that is not independent. Emptying `next_action`
clears `next_action_due_date` with it, because a due date describes an action —
the same resolution `setApplicationNextAction` applies to the detail page's
Clear button. "I have dealt with that follow-up" is therefore
`next_action: ""` and nothing else, not two empty fields, and a due date sent
alongside an emptied action is dropped rather than refused. An action that
survives the patch — supplied, or stored and left alone — keeps its date.

`company_domain` is the one field the tool invites Claude to fill in on its own
initiative: if an application has none stored and the employer can be
reasonably identified, the guidance asks for it alongside whatever else is
being updated, so an application saved before this existed picks up a logo the
next time it moves. The same guidance and the same worked examples as
`save_job`, defined once so the two cannot drift. Clearing still works, so a
student is never stuck with a domain that was identified wrongly.

It works by read-merge-write rather than a partial SQL update:

```text
getApplicationById(userId, id)     owner-scoped; null ⇒ not_found, nothing written
   ↓ toApplicationFormValues()     existing mapper, handles the sentinel
   ↓ apply only supplied keys      explicit allowlist in UPDATE_FIELD_MAP
   ↓ applicationUpdateSchema       the same gate the web edit form passes
updateApplication(userId, id, …)   existing conditional write
   ↓ diff before/after             structured result
```

The read supplies the real `updated_at`, so the conditional write keeps its
optimistic-concurrency protection instead of dropping it; on a conflict the
tool re-reads and retries once, then reports the conflict rather than looping.

## How a request reaches the database

```text
tools/call ─► registerJobTrackTools handler   lib/mcp/tools.ts
   ↓ readUserId(authInfo)                     the verified token's user, or 401
   ↓ repositoryFor({ token, userId })         lib/mcp/repository.ts
   ↓ existing repository function             owner-scoped query
Postgres                                      RLS decides, as it does for the web
```

The route chooses only which repository the tools get. Tests register the same
`registerJobTrackTools` against a two-user stand-in store and drive it over a
real `McpServer`, so the registration, argument validation, output validation,
and ownership behaviour under test are the ones the route serves.

Status history is never written by this tool. Changing `current_status` fires
the existing database trigger, and resending the same status writes no event
because of the trigger's `WHEN` clause. The result's
`status_history_recorded` reports which happened.

Missing and not-owned applications return the identical result, because the
read is scoped to the authenticated user and RLS applies again underneath.

## How a student connects

Everything a student needs is on **Settings** in the app; nothing in this
repository is required reading for them.

`/settings` shows the connection address (`getMcpResourceUrl()`, derived from
the one configured origin), numbered Claude steps, example things to say, and
what a connected assistant can and cannot do. The dashboard links to it, so the
feature is reachable without knowing it exists.

**Disconnecting** is on the same page. `revokeGrantAction` calls
`supabase.auth.oauth.revokeGrant({ clientId })`, which marks the consent
revoked, drops that client's sessions, and invalidates its refresh tokens.
Supabase is the only source of truth for who has access — nothing about a
connection is stored in this application, so the list cannot drift from
reality.

The capability wording on the consent screen and on Settings comes from one
place, `lib/mcp/capabilities.ts`, so the promise made while granting access and
the description read afterwards cannot disagree.

## Setup (deployment)

1. **Enable the OAuth server.** Dashboard → Authentication → OAuth Server.
   `supabase/config.toml` already carries the matching local configuration:

   ```toml
   [auth.oauth_server]
   enabled = true
   authorization_url_path = "/oauth/consent"
   allow_dynamic_registration = true
   ```

2. **Deploy, or expose a tunnel.** Claude cannot reach `localhost`; a remote
   connector needs a public HTTPS URL. When tunnelling, set `jwt_issuer` in
   `config.toml` to the tunnel URL so token validation matches.

3. **Set `NEXT_PUBLIC_SITE_URL`** to the public origin. The discovery document
   is built from it, so a wrong value breaks the connection.

4. **Add the connector** in Claude: Settings → Connectors → Add custom
   connector → `https://<your-domain>/api/mcp`. Free Claude accounts may have
   only one custom connector.

## Verifying without Claude

```bash
# Expect 401 and a WWW-Authenticate header naming the metadata URL
curl -i -X POST https://<domain>/api/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Expect the resource identifier and Supabase as the authorization server
curl https://<domain>/.well-known/oauth-protected-resource
```

## Verification

`scripts/verify-hosted-mcp.mjs` drives the deployed endpoint over HTTP with two
disposable users and real access tokens:

```bash
node --env-file=.env.local scripts/verify-hosted-mcp.mjs
```

It covers the unauthenticated 401, session initialization, `tools/list`, all
four tools, that the database and its history trigger agree with what MCP did,
and that a second user can neither list, read by direct id, nor update the
first user's application. It exercises HTTP → token verification → repository →
Supabase → RLS, with no stand-in anywhere. `SUPABASE_SERVICE_ROLE_KEY` is read
only from the process environment, and nothing is printed that could carry a
token.

**It deliberately does not test OAuth revocation.** Its tokens come from a
password sign-in, not from the authorization-code + PKCE flow an MCP client
uses, so revoking an OAuth client's grant would say nothing about them — such a
test would pass for the wrong reason. Revocation is covered by unit tests
around `revokeGrantAction` and by the manual test below.

### Manual acceptance test

This is the only way to verify the real fresh-user experience, and it must
actually be performed before claiming it works:

1. Open Interndex as a normal user.
2. Find the AI connection settings **without** reading this repository.
3. Copy the connection address from Settings.
4. Add Interndex to a real MCP client.
5. Sign in and approve access on the consent screen.
6. Ask the client to list your applications.
7. Ask it to save a new application.
8. Ask it to change that application's status.
9. Confirm the website shows both changes.
10. Return to Settings.
11. Confirm the connected client is listed.
12. Disconnect it.
13. Confirm it must be re-authorized before it can reach the account again.

## Not built yet

`delete_job` is deliberately omitted rather than deferred: archiving is the
safer default for job-search history, and Claude does not need a destructive
tool. Archiving itself is still a later Phase 2 ticket, so `archive_state` can
currently only read a distinction the web UI cannot yet create.
