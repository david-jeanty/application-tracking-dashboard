# Build log: Interndex recruiting agent

This is the working log for the recruiting agent specs. Each spec gets a plan
before code, then a record of what was built, how it was tested, and what David
has to set up by hand.

---

## Spec 1: Foundation and resume pipeline

**Status:** plan written, no code yet (2026-11-13).
**Branch:** `agent-specs`. One PR for all of Spec 1.

### 1. What I found

**Framework and layout**

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind 4, Zod 4. No ORM:
  data access is `supabase-js` called from small repository modules
  (`lib/applications/repository.ts` is the model to copy).
- Authenticated pages live under `app/(app)/`, and the sidebar is driven by
  `components/app-shell/navigation.ts`. Protected paths are an allowlist in
  `lib/routes.ts`, so a new page must be added there too.
- Tests: Vitest unit tests in `tests/unit/` (92 files), pgTAP database tests in
  `supabase/tests/` (6 files, need Docker), Playwright in `tests/e2e/`, and hosted
  verifier scripts in `scripts/`. CI (`.github/workflows/ci.yml`) runs lint,
  typecheck, unit tests, build and the extension checks.
- Baseline on this branch before any change: lint 0 errors (2 existing warnings),
  typecheck clean, 1,580 unit tests pass, 590 extension tests pass.

**Supabase schema and migrations**

- Five migrations: `profiles`, `applications`, `application_status_history`
  (immutable, trigger-written), `company_domain`, consent columns, and two
  migrations that limit what an OAuth client session can do.
- Every table uses owner RLS on `user_id = auth.uid()`. Child rows use a
  composite foreign key `(parent_id, user_id)` so a row can never point at
  another user's parent. New tables will copy that pattern.
- **OAuth client limits matter here.** Claude reaches Interndex with an OAuth
  access token that carries a `client_id` claim. Restrictive policies stop that
  session from deleting or archiving applications, and from reading or writing
  `profiles`. So the agent **cannot read David's profile row** over MCP. The fit
  read's profile facts (graduation window, degree level, year of study) need a
  home the connector is allowed to read (see 3.2).
- `applications` already has three of the columns Spec 1 asks to add:
  `location` (required), `application_url` and `job_description` (up to 50,000
  characters). See 3.1.
- No Postgres functions are called from the app today (no `.rpc()` anywhere), and
  Supabase Storage is not used yet.

**MCP server and tools**

- `app/api/mcp/route.ts` uses `mcp-handler` with `withMcpAuth`. Every request
  carries a Supabase access token; `lib/mcp/identity.ts` verifies it, and the
  tools query through `lib/supabase/bearer.ts`, a client acting as that user. No
  service key on the MCP path; RLS is the boundary.
- Five tools in `lib/mcp/tools.ts`: `save_job`, `import_jobs`, `list_jobs`,
  `get_job`, `update_job`. Wire schemas are in `lib/validation/mcp.ts`. Each
  tool body is wrapped in `instrumentToolCall` (`lib/mcp/telemetry.ts`), which
  logs timings only, never arguments or results.
- Tools take an injected repository factory, so the real registration is unit
  tested against an in-memory store (`tests/unit/mcp-tool-registration.test.ts`).
  New tools will follow the same pattern.
- `mcp-handler` builds a fresh `McpServer` for every request, but its setup
  callback never sees the request or the caller's identity. So "register these
  tools only for the owner" cannot happen inside the setup callback. It has to
  happen in the route (see 3.4).
- `lib/mcp/instructions.ts` holds the server instructions sent to every client.
  `lib/mcp/capabilities.ts` holds the consent-screen promises shown to every
  user.

**Chrome extension**

- MV3, published on the Chrome Web Store as Interndex Capture 0.1.1.
  Permissions: `activeTab`, `scripting`, `storage`, `identity`; host permissions
  only for `www.interndex.dev` and the Supabase project. No content scripts:
  it runs only when the toolbar button is clicked.
- Spec 1 does not touch the extension. Spec 2's automatic sent tracking would
  need a LinkedIn content script and host permission, which means a new Web
  Store review. I am noting that so Spec 2 can plan for it; nothing in Spec 1
  depends on it.

**resume.lol**

- No resume.lol code exists anywhere in the repo.
- `resume.lol` is blocked by this session's network, and I found no public API
  documentation for it. The API's shape (endpoints, auth header, how a template
  is chosen, how content is sent, whether a PDF can be downloaded) is unknown.
  This blocks the build and calibration tools until I have the docs (see "What
  I need from David").

**Deployment**

- Vercel, connected to GitHub. Production is `https://www.interndex.dev` on
  Supabase project `jbkrwbofrctithcjevxy`. `docs/architecture-plan.md` says
  previews must use a non-production Supabase project. I found no record of one
  existing.

**Product docs that the agent knowingly departs from**

- `README.md` and `PROJECT_SPEC.md` say Interndex has "no resume generator" and
  does no resume tailoring. The agent stays true to the core rule (no LLM on the
  server; Claude does the writing), but resume building is new. It is owner-only,
  so the public product claim stays accurate. I will write this up as a decision
  record and leave the public README alone.

### 2. What I will add

**New tables** (one migration, RLS on every table, all owned by `user_id`, cascade
on profile delete, composite foreign keys like `application_status_history`):

| Table | Notes |
| --- | --- |
| `agent_profile` | One row per user: fit-read facts (graduation window, degree, year of study, school). Not in the spec; see 3.2. |
| `experiences` | `start_date` / `end_date` instead of `start` / `end` (`end` is a reserved SQL word). |
| `stories` | Linked to an experience. |
| `story_variants` | `char_count` computed by the database, so it can never be wrong. |
| `templates` | Per user, so calibration results belong to David. |
| `tailored_resumes` | `build_count` column holds the 2-build cap, enforced by a check constraint and in code. |
| `edit_examples`, `rules`, `answer_bank` | As specified. |
| `run_ledger` | One row per (application, step). `step` is text validated in TypeScript, so Spec 2 can add its steps without a migration. |
| `usage_log` | Bytes per tool call per application. |

Additive columns on `applications`: `jd_requirements` (jsonb), `job_id`,
`partner_functions` (text[]), `tailored_resume_id`. Nullable, no backfill, the
same approach `company_domain` used.

**Storage:** a private `resumes` bucket. Objects live at
`{user_id}/{tailored_resume_id}.pdf`, and storage policies only allow a path
whose first folder is the caller's own id.

**MCP tools** (owner only): `get_playbook`, `get_run_state`,
`get_application_brief`, `create_application_from_jd`, `search_stories`,
`save_variant`, `record_edit`, `add_rule`, `check_bullets`, `calibrate_template`,
`build_resume`, `rebuild_with_edits`, `save_answer`, `search_answers`,
`complete_run`, `import_library`. Read tools get the MCP `readOnlyHint`
annotation. Every result has a byte cap and is logged to `usage_log`.

**Code layout** (new folder, matching the repo's existing style):

```text
lib/agent/owner.ts              the OWNER_USER_ID gate
lib/agent/playbook/             playbook source (steps + STANDARDS.md parts), one source for the server and the skill
lib/agent/checks/text-rules.ts  shared blocklists, em dash and "genuine"+"ly" rules (Spec 2's check_message reuses these)
lib/agent/checks/bullets.ts     check_bullets, a pure function
lib/agent/library/scoring.ts    search_stories ranking, pure
lib/agent/calibration.ts        line-fill targets from PDF measurements, pure
lib/agent/pdf/verify.ts         one page, no widows, last line at least 80% full
lib/agent/resumelol/client.ts   the only module that calls resume.lol or reads RESUMELOL_API_KEY
lib/agent/repository.ts         database access for the agent tables
lib/agent/caps.ts               size caps and usage logging
lib/mcp/agent-tools.ts          tool registration, same injected-repository pattern as tools.ts
lib/validation/agent.ts         wire schemas
skill/interndex-pipeline/SKILL.md   generated by a script from lib/agent/playbook
```

**Web app** (owner only; other users see no new nav item and the route returns
404 for them): a Resumes page (newest first, company, role, date, template, Open,
Download, link to the application), a resume panel on each application page, and
an estimated cost per application and step from `usage_log` (bytes / 4 tokens).
PDFs open through short-lived signed URLs.

**Docs:** `docs/decisions/` records (server AI cost $0, story library instead of
one master resume, at most 2 builds, owner gate in the route, reusing existing
application columns, `complete_run` as a database function, PDF library choice,
resume building as an owner-only exception to the README). Updates to
`docs/mcp.md` and `docs/database.md`.

**Not in this PR (Spec 2 or later):** `import_contacts`, `import_interactions`
and every Spec 2 table. Spec 1 says to create those tables if missing; David's
instruction for this build is to build none of Spec 2, so they wait for Spec 2.

### 3. Decisions to flag before building

**3.1 Reuse existing `applications` columns instead of duplicating them.**
Spec 1 asks to add `location`, `source_url` and `jd_text`, but `location`,
`application_url` and `job_description` already exist and every page and tool
reads them. Adding copies would give one fact two homes that drift apart. Plan:
`create_application_from_jd` writes the posting link to `application_url` and
the JD to `job_description`. The rule "the full JD is never returned after
creation" is enforced in every new tool. The existing `get_job` still returns the
JD (changing it would change behavior for every user), so the playbook tells
Claude never to call `get_job` during a run.

**3.2 A small `agent_profile` table for fit-read facts.** The connector is not
allowed to read `profiles` (by design, and I will not loosen that), and the fit
read needs graduation window, degree level and year of study. One owner-scoped
row, returned inside `get_playbook("run")`.

**3.3 `complete_run` saves through one Postgres function.** supabase-js has no
transactions, and the spec asks for one transaction. A `security invoker`
function runs as the caller, so RLS still applies. The resume.lol build cannot be
inside a database transaction, so the order is: save everything atomically,
build, then record the build result. A failed build leaves a `draft` resume and a
ledger row that says so, and the next call picks up from there. The payload has
a reserved `people` section that is refused until Spec 2.

**3.4 The owner gate lives in the route.** After the token is verified,
`app/api/mcp/route.ts` sends the owner to a server with the existing tools plus
the agent tools and agent instructions. Everyone else gets today's server,
unchanged. Each agent tool also checks the owner again (defense in depth), and
RLS still limits every row to its owner. A test asserts that a non-owner's
`tools/list` and `instructions` are byte-identical to today's.

**3.5 One new dependency for reading PDFs.** Checking widows and line fill means
reading text positions from the built PDF. That needs a PDF text library
(`unpdf`, or `pdfjs-dist` if `unpdf` falls short). I will choose once I have a
real resume.lol PDF, and record why.

**3.6 Account deletion removes stored PDFs.** Database rows cascade when an
account is deleted, but Storage objects do not. I will extend the existing delete
flow to remove `resumes/{user_id}/`. It is a no-op for every user but David.

### 4. Build order

Each step ends with lint, typecheck, unit tests and build passing, and pgTAP
passing locally (Docker is available here) once migrations exist.

1. **Gate and route split.** `OWNER_USER_ID` in `.env.example`, `lib/agent/owner.ts`,
   the route split, with no new tools yet. Tests: owner vs non-owner tool lists,
   unset or malformed `OWNER_USER_ID` means nobody is the owner (fails closed).
2. **Schema.** Migration for the tables and columns above, plus pgTAP tests: two
   users, an OAuth client session can read and write its own agent rows, cannot
   reach the other user's rows, the build-cap constraint holds.
3. **Pure logic with fixtures from `docs/STANDARDS.md`.** `check_bullets` (every
   gold bullet passes the hard rules; every negative example fails for the
   stated reason; filler, first person, two sentences, repeated openers, em dash,
   line fill), shared text rules, story scoring, calibration math.
4. **Playbook.** Playbook source, `get_playbook` (steps, matching STANDARDS
   parts, all saved rules, `agent_profile`), the skill generator script, and a
   test that fails if `SKILL.md` is out of date.
5. **Library and application tools.** `create_application_from_jd` (dedupe on
   company + title + job_id), `get_run_state`, `get_application_brief` (under 300
   words), `search_stories`, `save_variant`, `record_edit`, `add_rule`,
   `save_answer`, `search_answers`, `check_bullets`, `import_library` (idempotent
   on natural keys). Size caps, ledger with `force`, usage log.
6. **resume.lol and PDFs** (blocked on the API docs). Client, storage migration,
   `calibrate_template`, `build_resume` (always a new resume named
   `David_Jeanty_{Company}_{Role}`, one PDF fetch, server verification, private
   storage), `rebuild_with_edits`, 2-build cap.
7. **`complete_run`** (database function and tool).
8. **Web app.** Resumes page, application panel, usage estimate, owner-only nav.
9. **Docs.** Decision records, `docs/mcp.md`, `docs/database.md`, this log.
10. **Preview test plan** (below), then open the PR.

Steps 1 to 5 and 7 to 8 do not depend on resume.lol, so missing API docs only
hold up step 6.

### 5. How I will test on a preview

**Preview setup (one time)**

1. **Preview database:** a separate Supabase project (a free second project is
   enough), never production. Apply all migrations to it with
   `supabase db push` and run the pgTAP suite against it. Enable its OAuth 2.1
   server with consent path `/oauth/consent` and dynamic registration, matching
   `supabase/config.toml`.
2. **Preview app:** Vercel builds a preview for every push to `agent-specs`, and
   the branch keeps a stable alias URL. Preview-scoped env vars point at the
   preview Supabase project, and `NEXT_PUBLIC_SITE_URL` is the branch alias URL.
3. **`OWNER_USER_ID` on the preview** is David's user id **in the preview
   project**, not production: a new project gives the same email a different id.
4. **Vercel Deployment Protection** blocks outside callers on previews by
   default, which would block Claude's connector. It has to be turned off for
   previews, or the preview MCP URL has to be allowed through.
5. **Claude:** add a second custom connector pointing at
   `{preview alias}/api/mcp`, sign in with David's preview account, in a Job
   Search project with only that connector and web search on.

**Automated checks on the preview**

- A hosted verifier (extending `scripts/verify-hosted-mcp.mjs`) with two
  disposable users plus the owner: owner sees the agent tools, a non-owner sees
  exactly the five current tools and current instructions, a non-owner calling
  an agent tool by name gets refused, and RLS isolation holds on every new table.
- Size caps: no tool result over its cap; the JD never comes back after
  creation.
- Build cap: a third build is refused. Existing resume.lol resumes are untouched.

**Spec 1 test plan (run in Claude against the preview)**

1. Full runs on 3 or 4 past postings (Tinder TPM, Pinterest Strategy & Operations,
   T-Mobile, exacare), compared with David's approved resumes. Target: 2 or fewer
   edits per resume.
2. One posting David skipped: the fit read should match his call.
3. One calibration build per template: full lines, no widows, one page.
4. A timed run at a low effort setting, with no input mid-run.
5. A rule saved with `add_rule` shows up in `get_playbook` on the next run.
6. The import run twice gives the same library (idempotent).
7. The same flow from the Claude phone app.

Results go in this log. The PR is opened only after these pass.

### 6. Environment variables

| Name | Where | Value |
| --- | --- | --- |
| `RESUMELOL_API_KEY` | `.env.local` locally; Vercel **Preview** now, **Production** at merge | Secret. Server only, never `NEXT_PUBLIC_`. Mark as Sensitive in Vercel. |
| `OWNER_USER_ID` | `.env.local`; Vercel Preview and Production | David's Supabase user id (a UUID). A different value per Supabase project. Not a secret. |

### 7. Suggestions (not building)

- Add the new agent data to the account export (`app/api/account/export`), so
  David's export includes his library.
- A small "Agent" section in Settings showing which templates are calibrated and
  when.

### 8. What I need from David

1. **OWNER_USER_ID:** I could not look it up. This session has no Supabase
   access, and reading users by email needs an admin key. Copy it from the
   Supabase dashboard (steps in the chat reply).
2. **resume.lol API docs**, and `resume.lol` (plus any API host it uses) allowed
   in this session's network settings, so I can build and test the client.
3. **The two template references** in resume.lol (Jake's and zero2sudo) and how
   they are named or selected through the API.
4. **Preview database:** does a staging Supabase project exist? If not, create
   one (free), and share its URL and publishable key for the Vercel Preview env.
5. **Fit-read facts** for `agent_profile`: graduation month and year, degree and
   program, current year of study.
6. **Vercel:** turn off Deployment Protection for previews (or tell me it is off),
   and the branch alias URL once the first preview deploys.
7. **For the test plan:** David's 9 recent resumes and the 3 or 4 past postings
   with his approved resumes, shared in the Claude session at import time, not
   committed to the repo.
