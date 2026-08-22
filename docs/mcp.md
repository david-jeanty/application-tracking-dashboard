# MCP integration

Claude connects to this application as a remote MCP client and acts as the
signed-in student: it can save job applications into the same tables the web
dashboard reads.

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
| `app/api/mcp/route.ts` | MCP endpoint and tool registration |
| `lib/mcp/identity.ts` | Validates the bearer token, resolves the user |
| `lib/supabase/bearer.ts` | Token-scoped Supabase client (no cookies) |
| `lib/validation/mcp.ts` | `save_job` wire contract and field mapping |
| `app/api/oauth-protected-resource/route.ts` | RFC 9728 discovery document |
| `app/oauth/consent/page.tsx` | Consent screen Supabase redirects users to |
| `lib/oauth/actions.ts` | Approve / deny decision |

## Security properties

- **No tool accepts a `user_id`.** Ownership comes from the access token only.
  `applications.user_id` defaults to `auth.uid()`, resolved from that token.
  A test asserts the argument is absent from the schema and the mapped values.
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

`save_job` and `update_job` exist so far.

| Argument | Required | Notes |
|---|---|---|
| `company` | yes | |
| `job_title` | yes | |
| `location`, `job_description`, `job_url`, `source`, `notes` | no | |
| `status` | no | Defaults to `Interested` |
| `category` | no | Defaults to `Other` |
| `deadline`, `date_applied` | no | `YYYY-MM-DD` |
| `work_term`, `duration` | no | e.g. `Summer 2027`, `4 months` |

`work_term_season` is a required column that a posting rarely states, so it
falls back to the same `Not specified` sentinel the web form uses.

### `update_job`

Takes `application_id` plus any subset of the fields the web edit form owns:
`company`, `job_title`, `location`, `status`, `category`, `work_arrangement`,
`job_description`, `job_url`, `source`, `deadline`, `date_applied`,
`work_term`, `duration`, `salary`, `notes`, `next_action`,
`next_action_due_date`.

An omitted field keeps its stored value. An empty string clears a field that
is allowed to be empty; a required field cannot be emptied. There is no
dedicated interview-date column, so a phrase like "the interview is
September 4" is expressed as `next_action` plus `next_action_due_date`.

It works by read-merge-write rather than a partial SQL update:

```text
getApplicationById(userId, id)     owner-scoped; null ⇒ not_found, nothing written
   ↓ toApplicationFormValues()     existing mapper, handles the sentinel
   ↓ apply only supplied keys      explicit allowlist in UPDATE_FIELD_MAP
   ↓ applicationUpdateSchema       the same gate the web edit form passes
updateApplication(userId, id, …)   existing conditional write
   ↓ diff before/after             structured result
```

Nothing was added to the repository layer. The read supplies the real
`updated_at`, so the conditional write keeps its optimistic-concurrency
protection instead of dropping it; on a conflict the tool re-reads and retries
once, then reports the conflict rather than looping.

Status history is never written by this tool. Changing `current_status` fires
the existing database trigger, and resending the same status writes no event
because of the trigger's `WHEN` clause. The result's
`status_history_recorded` reports which happened.

Missing and not-owned applications return the identical result, because the
read is scoped to the authenticated user and RLS applies again underneath.

## Setup

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

## Not built yet

`list_jobs` and `get_job` come next; they are what will let Claude resolve
"the RBC job" into the id `update_job` currently requires. `delete_job` is
deliberately omitted: archiving is the safer default for job-search history,
and Claude does not need a destructive tool.
