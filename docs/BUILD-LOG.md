# Build log: Interndex recruiting agent

This is the working log for the recruiting agent specs. Each spec gets a plan
before code, then a record of what was built, how it was tested, and what David
has to set up by hand.

---

## Spec 1: Foundation and resume pipeline

**Status:** steps 1 to 9 built and tested locally (2026-11-13). Step 10 (the
preview test plan) is next and needs the preview Supabase user id from David.
See section 9 for progress and section 10 for setup.
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
- **Two-line ceiling.** Calibration sets the longest two-line bullet to twice
  the shortest full line (260 for zero2sudo), which is safe but flags some
  bullets that do fit (David's zero2sudo base has 273-character two-liners).
  Twice the median line (about 274) would match the real page more closely.
  The Chrome layout check is exact either way, so this only affects how often
  `check_bullets` asks for a cut.
- **Self-host the Jake's font.** The Jake's base loads Computer Modern from
  `cdn.jsdelivr.net/gh/...@latest`. If that file moves, every Jake's build is
  skipped. Pinning a version in the base resume's CSS would remove the risk.

### 8. What I need from David

1. ~~**OWNER_USER_ID**~~ Received 2026-11-13 (production project). Stored in
   the local `.env.local` only, never in the repo. The preview project needs
   its own id. `RESUMELOL_API_KEY` also received and stored the same way;
   David adds both to Vercel himself.
2. ~~**resume.lol API docs** and network access~~ Received 2026-11-13. The API
   is an MCP server; see step 6.
3. ~~**The two template references**~~ Received 2026-11-13: the base resume
   ids in step 6's setup.
4. **Preview database:** does a staging Supabase project exist? If not, create
   one (free), and share its URL and publishable key for the Vercel Preview env.
5. **Fit-read facts** for `agent_profile`: graduation month and year, degree and
   program, current year of study.
6. **Vercel:** turn off Deployment Protection for previews (or tell me it is off),
   and the branch alias URL once the first preview deploys.
7. **For the test plan:** David's 9 recent resumes and the 3 or 4 past postings
   with his approved resumes, shared in the Claude session at import time, not
   committed to the repo.

### 9. Progress

#### Steps 1 to 5: built (2026-11-13)

**Step 1, owner gate.** `lib/agent/owner.ts` reads `OWNER_USER_ID` and fails
closed (unset, empty or not a UUID means nobody is the owner).
`lib/mcp/servers.ts` picks the server per request, and `app/api/mcp/route.ts`
keeps one handler per kind. Other users get the five tracker tools and the
existing instructions, byte for byte. Decision record 0002.

**Step 2, schema.** `supabase/migrations/20261113000100_agent_foundation.sql`:
eleven new tables (the ten in the plan plus `agent_profile`), four nullable
columns on `applications`, owner RLS on every table, composite ownership keys,
the 2-build cap as a check constraint, a database-computed `char_count`, and an
append-only usage log. No existing column, policy or grant changed.

**Step 3, pure logic.** `lib/agent/checks/bullets.ts` (check_bullets),
`lib/agent/checks/text-rules.ts` (shared with Spec 2's message checker),
`lib/agent/library/scoring.ts` (search_stories ranking),
`lib/agent/calibration.ts` (line targets from measured lines),
`lib/agent/ledger.ts`, `lib/agent/caps.ts`, `lib/agent/brief.ts`,
`lib/agent/dedupe.ts`. Decision record 0007.

**Step 4, playbook.** `lib/agent/playbook/phases.ts` is the one source for the
steps of `run`, `library_session` and `import`. `npm run agent:playbook`
regenerates `lib/agent/playbook/standards.generated.ts` (from
`docs/STANDARDS.md`) and `skill/interndex-pipeline/SKILL.md`. Decision record
0006.

**Step 5, tools.** `lib/mcp/agent-tools.ts` registers twelve owner-only tools:
`get_playbook`, `get_run_state`, `get_application_brief`,
`create_application_from_jd`, `search_stories`, `save_variant`, `record_edit`,
`add_rule`, `check_bullets`, `save_answer`, `search_answers`,
`import_library`. `lib/mcp/agent-repository.ts` is their Supabase data access,
running as the caller so RLS applies. Every result is compact JSON under a
size cap and logged to `usage_log`.

**Tests**

| Check | Result |
| --- | --- |
| Unit tests (`npm run test`) | 1,741 pass (1,580 existing, 161 new) |
| Database tests (`npm run test:db`, local Docker) | 164 pass (133 existing, 31 new in `007_agent_foundation.test.sql`) |
| Mutation check | Dropping the build-cap constraint makes the database suite fail, as it should |
| Repository against real PostgREST, Postgres and RLS | 10 of 10 pass (one-off run, tokens shaped like Claude's, see below) |
| Lint, typecheck, production build, extension checks | Pass (lint: 0 errors, only the existing warnings) |

New unit test files: `agent-check-bullets` (every gold bullet passes, every
negative example is caught, every blocklist entry is blocked; fixtures are
read from `docs/STANDARDS.md` itself), `agent-scoring-calibration`,
`agent-owner-gate`, `agent-tools`, `agent-playbook` (generated files current,
writing rules on all agent text and docs, ledger, dedupe).

The repository check ran PostgREST from Docker Hub against the local
database, because the full local Supabase stack cannot start here (some
images are blocked by this session's network). It is not committed as a test
because it needs that hand-started PostgREST; the hosted verifier on the
preview (step 10) covers the same ground for good.

**Where the build departs from the plan, and why**

- `get_playbook`'s cap is 40 KB, not 24 KB. The run steps and standards are
  about 18 KB, and every saved rule must be served, so rules need room to grow.
- `get_application_brief` trims requirements to fit both the 300-word limit and
  its byte cap, so it is always built to fit rather than refused.
- Duplicate detection compares normalized company and title in code. PostgREST
  treats `*` as a wildcard in like patterns and cannot escape it.
- `import_library` is one upsert per level, not one transaction. Every level is
  keyed on a natural key, so a failed import is finished by running it again.
  (`complete_run` in step 7 is the call that needs a real transaction.)
- `tests/unit/mcp-instructions.test.ts` changed: it expected one MCP handler and
  now checks two, with the standard one's instructions unchanged byte for byte.
- The existing server instructions every student receives contain em dashes.
  They are left as they are, because changing them would change every user's
  server. The agent's own addition has none, and a test checks that.
- `npm run agent:playbook` loads TypeScript directly, which needs Node 22.18 or
  later (CI already uses the latest Node 22).

#### Step 6: resume.lol and PDFs, built (2026-11-13)

**What resume.lol's API turned out to be.** An MCP server at
`https://www.resume.lol/api/mcp` (Bearer key) with ten tools: the authoring
guide, `list_resumes`, `get_resume`, `create_resume`, `update_resume` (with an
`expected_updated_at` guard), `get_resume_html`, and four share-link tools.
There is no PDF export and no template concept: PDFs come from a browser's
print dialog, and a "template" is just one of David's resumes. The account
also holds resumes for other people, so Interndex never lists or browses it.

**The gap and the fix (agreed with David before building).** The spec has
`build_resume` fetch a PDF and check it on the server. Instead, the server
prints the PDF itself: it opens resume.lol's printable HTML in headless
Chrome, measures every bullet line by line, checks the layout, and prints the
PDF with Chrome. If Chrome fails at runtime, the build still saves the resume
and HTML, keeps the character-count result, and marks the layout check
`skipped` with the reason. Decision records 0008, 0009 and 0010.

**What was built**

| File | What it does |
| --- | --- |
| `lib/agent/resumelol/client.ts` | The only code that calls resume.lol. Four calls (get, get HTML, create, update markdown). No list, delete or share links. Refuses to write a base resume. Scrubs the key from every error. |
| `lib/agent/resume/skeleton.ts` | Parses a base resume into a skeleton: the @ variable header (with `@REDACTED=false` forced), headings verbatim, spacers, skills format, entry keys. |
| `lib/agent/resume/content.ts` | The tailored content schema and the renderer that fills the skeleton. Locked facts (employers, dates, schools, degrees) come only from the base. Names resumes `{Name}_{Company}_{Role}`. |
| `lib/agent/resume/layout.ts` | Pure layout check: one page, no widows, last lines at least 80% full, never three lines, page shows exactly the bullets sent. Page not full is a warning. |
| `lib/agent/resume/pdf.ts` | Counts a PDF's pages from the file, as a second check. |
| `lib/agent/resume/render.ts` | Headless Chrome: render, wait for pagination, measure, print. Never throws; failures come back as a skip reason. Lets through only stylesheets and fonts. |
| `lib/agent/resume/build.ts` | `calibrateTemplate` and `buildResume` (build and rebuild), with injected services so every rule is unit tested. |
| `lib/agent/resume/services.ts` | The real resume.lol client and renderer for the route, and the one log line per build. |
| `lib/agent/storage.ts` | Removes the owner's stored files on account deletion (plan 3.6). A no-op for every other account. |
| `supabase/migrations/20261113000200_resume_builds.sql` | Private `resumes` bucket with owner-folder policies; five additive columns on `tailored_resumes`. |

New MCP tools (owner only): `calibrate_template`, `build_resume`,
`rebuild_with_edits`. Annotated as writes that reach outside Interndex.

**How a build runs.** Load the tailored resume and the calibrated template,
render the content onto the skeleton, run `check_bullets` on the page (with
saved rules), reserve a build, create the resume on resume.lol (or, on a
rebuild, update the same one if its content is unchanged there), record its
id at once, fetch the printable HTML once, store it, render it in Chrome,
check the layout, store the PDF, save the result, mark the ledger. A
resume.lol failure releases the reserved build. One log line per build says
which path ran:
`{"at":"agent.resume_build","mode":"build","build":1,"path":"chromium","layout_check":"passed",...}`
or `"path":"skipped","reason":"timeout"`. The same is stored in
`tailored_resumes.layout_report`.

**Checked against the real service (read-only, nothing written).** The
client fetched both base resumes and their HTML. Chrome rendered the
zero2sudo base in 1.7 seconds: one page in the layout and in the PDF, page
fully used. Calibration from its 12 wrapped lines gives 130 characters per
line, two-liners from 240 to 260 (the seed values in STANDARDS.md were about
138 and 250 to 275). The layout check flags 4 of that resume's 13 bullets
as widows (last lines 73% to 78% full), which the character count alone
would not have caught reliably. Both bases parse into the expected sections
and entries.

**Tests**

| Check | Result |
| --- | --- |
| Unit tests (`npm run test`) | 1,811 pass (70 new) |
| Render tests (`npm run test:render`, real Chrome) | 8 pass (new suite) |
| Database tests (`npm run test:db`, local Docker) | 178 pass (14 new in `008_resume_builds.test.sql`) |
| Lint, typecheck, production build, extension checks | Pass (lint: only the 2 existing warnings) |

New unit test files: `agent-resume-skeleton` (both base layouts, from
fixtures that copy their structure with placeholder people),
`agent-resume-layout`, `agent-resumelol-client` (key never in an error, base
never written, conflict detection), `agent-resume-build` (cap, fallback,
rebuild guard, edits), `agent-resume-tools` (through a real MCP server),
`agent-account-files`.

**Where step 6 departs from the plan, and why**

- **No PDF library (plan 3.5).** There is no resume.lol PDF to parse. Chrome
  measures the layout directly, and a 15-line counter checks the PDF's page
  count. The new dependencies are `playwright-core` (already in the repo
  through `@playwright/test`, same version) and `@sparticuz/chromium`.
- **Calibration builds nothing.** It measures the base resume read-only
  instead of making a test resume (agreed with David).
- **Base resume ids are configuration in the database**
  (`templates.resumelol_template_ref`), set by `calibrate_template`, not
  written in code. The ids are in "Setup for David" below.
- **`check_bullets` counts printed characters.** `**bold**` markers no longer
  count toward line fill; David's zero2sudo resumes use bold.
- **The MCP route now declares `runtime = "nodejs"` and `maxDuration = 90`.**
  It already ran on Node; the time limit only raises the ceiling, so tracker
  tools behave the same for every user.
- **Render tests are their own suite.** CI's unit job has no browser, so
  `npm run test:render` runs in the local quality gate, like `test:db`. In
  this container it needs `CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`
  (Playwright here expects a different bundled build).
- **Jake's base could not be rendered here.** It loads its font from
  `cdn.jsdelivr.net`, which this session's network refuses (HTTP 403 even
  from curl). The fallback handled it as designed (`pagination_failed`, so
  skipped, never a measurement with the wrong font). The preview will
  calibrate it for real.
- **`rebuild_with_edits` holds an edit that breaks a rule** unless David
  says to keep it (`keep_failing_edits: true`), because STANDARDS.md says to
  apply his corrections exactly and also that a draft must pass the checks.

#### Setup for David (step 6)

1. Nothing new in Vercel beyond `RESUMELOL_API_KEY`. Do not set
   `CHROMIUM_EXECUTABLE_PATH` on Vercel.
2. Once the preview is up, in the Job Search project in Claude, say:
   "Calibrate the zero2sudo template with base resume
   85f004fa-d780-4bef-9892-ad882dc61b7f, and the jakes template with base
   resume 8157e84f-ffc6-4bf8-9c9e-17cf2b18314f." Run it again whenever a base
   resume changes.

#### Step 7: complete_run, built (2026-11-13)

**What was built.** `supabase/migrations/20261113000300_complete_run.sql`
adds `public.complete_run`, a SECURITY INVOKER function that saves the fit
read (new nullable column `applications.fit_read`), the tailored resume,
new variants (source `pipeline`), answers and the `fit_read` and `tailor`
ledger steps in one transaction, and links the resume to the application.
An unbuilt draft is reused; a built resume is never overwritten (a forced
redo makes a new draft). The `complete_run` tool checks everything first
(content fits the template, the whole page passes `check_bullets` with
saved rules, house-style variants pass, every number has an explain note),
calls the function, then builds exactly as `build_resume` does. A failed
build leaves the run saved and says to retry with `build_resume`. The
`people` field is refused until Spec 2. Decision record 0011.

**Playbook.** The run steps now say how to calibrate, how to write content
with the template's entry keys (shown under each calibrated template in
`get_playbook`), and what to do for each layout result: passed, failed (one
`rebuild_with_edits` on the named bullets) or skipped (give David the
resume.lol link to print from). `SKILL.md` regenerated.

**Tests**

| Check | Result |
| --- | --- |
| Unit tests | 1,818 pass (7 new in `agent-complete-run`) |
| Database tests | 194 pass (16 new in `009_complete_run.test.sql`) |
| Mutation check | Making the function SECURITY DEFINER fails the database suite |
| Render tests, lint, typecheck, build, extension checks | Pass |

**Departures.** The fit read had no home in the spec's data model, so it is
one additive column on `applications`. The ledger records `fit_read` and
`tailor` together when the run is saved, because the fit read is only
stored at that point.

#### Step 8: web app, built (2026-11-13)

**What was built**

- **Resumes page** (`/resumes`): every tailored resume, newest first, with
  role (linking to the application), company, date, template, estimated
  tokens, the layout result in words, and Open, Download, or "Open to print"
  when the server could not print a PDF, plus the resume.lol link for design
  tweaks. Owner only: for every other signed-in student the page is a 404 and
  no query runs.
- **Resume panel on each application page**: the newest resume, its layout
  result, builds left, the same file links, and the estimated usage for that
  posting per tool. Read only for the owner; a student's page runs exactly the
  two reads it always did (a test proves the agent query is never called).
- **File routes**: `/resumes/{id}/pdf` checks the session and the owner gate,
  then redirects to a signed storage link valid for 60 seconds (with the file
  name `{Name}_{Company}_{Role}.pdf` on download). `/resumes/{id}/print`
  serves the stored HTML sandboxed (`Content-Security-Policy: sandbox
  allow-scripts allow-modals`), so its pagination script and print dialog
  work but it cannot act as David on Interndex.
- **Sidebar**: a "Resumes" item for the owner only. Other students' sidebars
  are unchanged (a test compares them).
- `/resumes` added to the protected routes list.

**Usage estimate.** Tokens are estimated as bytes / 4 of what Interndex tools
returned, per application and per tool (each tool is one step of the run).
It is shown as tokens, not dollars: David runs on a Claude plan, so tokens
are the unit his usage limits count.

**Tests.** Unit tests: 1,838 pass (20 new in `agent-web`,
`agent-resume-routes`, `agent-resume-ui`, `agent-resume-pages`). Database,
render, lint, typecheck, build and extension checks pass.

#### Step 9: docs, built (2026-11-13)

- Decision records 0008 to 0012 (server-printed PDFs with a fallback, two
  builds and rebuild in place, filling the base resume, `complete_run` as one
  database function, resume building as an owner-only exception to the
  README). With 0001 to 0007 this covers every decision the plan listed.
- `docs/mcp.md`: the owner-only agent server and all sixteen agent tools.
- `docs/database.md`: the agent tables, the private bucket and its policies,
  `complete_run`, and the agent pgTAP suites.
- `docs/testing.md`: the new render suite.

#### Import decisions applied (2026-11-13)

David ran the import phase in Claude Code with his 9 recent resumes and made
these calls. The library data itself stays out of the repo (it is resume
content); it is saved in the session transcript and goes in through
`import_library` once the agent connector is live on the preview.

- **Library is facts, not fixed text** (decision record 0013). The run step
  now says: reuse a variant as is, or write a new bullet from the story's
  facts in the posting's language, house style and stretch rules; employers,
  titles and dates always come from the library unchanged. Story summaries
  are fact sheets, and `search_stories` returns them (at most 700 characters).
- **`search_stories` cap raised from 9 KB to 12 KB.** With summaries, David's
  library measures about 10.2 KB at its largest, and an over-cap result is
  refused, not trimmed.
- **Academic standing** (decision record 0004, update). New nullable column
  `agent_profile.academic_standing` (migration `20261113000400`, pgTAP suite
  `010`). Year of study and standing can differ; the fit read shows both as
  plain info. The values live only in the database.
- **Data calls, saved as rules with `add_rule` after the import:** no
  "pull requests" counts; StraNexus screening is "40% faster" only; the
  Exacare wording is the preferred version of the Interndex launch and
  repositioning stories; Aritzia, the Early Graduate Outcomes research
  project and Student Ambassador never go on a resume or in the library.

| Check | Result |
| --- | --- |
| Unit tests (`npm run test`) | 1,842 pass (4 new: playbook decisions, story facts in results, academic standing) |
| Database tests (`npm run test:db`, local Docker) | 198 pass (4 new in `010_agent_profile_academic_standing.test.sql`) |
| Lint, typecheck | Pass (lint: 0 errors, only the existing warnings) |

#### Change 1: experiences come from the library (2026-11-13)

David's call: employers, titles, dates, locations and schools on a built
resume come from the story library; the base resume supplies only the
layout, section order and the @ variables header (decision record 0014).

- `lib/agent/resume/library-entries.ts`: `resolveSkeleton` writes each library
  experience in its template's heading format and date style, reverse
  chronological, and the school from the fit-read profile. Every rebuilt
  heading is read back; one that still shows a base employer, title,
  location or year is rejected before resume.lol is called. Base sections
  with entries the library cannot account for are left off.
- Empty library: the base resume's entries are used and logged
  (`resume_experiences`, `source: "base"`, also stored as
  `layout_report.experience_source`).
- Used by the build, `complete_run`, calibration's entry list and the
  template entries `get_playbook` shows, so a run writes bullets for the
  library's entries (keys like `marketing-analyst-intern`, `interndex`).
- Migration `20261113000500` (additive): `experiences.section`,
  `agent_profile.study_start`, `agent_profile.school_location`.
- The import payload needs those three facts: each experience's section,
  and the school's start month and location. Added in the session data.

| Check | Result |
| --- | --- |
| Unit tests | 1,862 pass (20 new: `agent-resume-library-entries`, 3 build tests) |
| Database tests | 203 pass (5 new in `011_library_resume_sources.test.sql`) |
| Lint, typecheck | Pass (only the 2 existing lint warnings) |

#### Change 2: two-line bullets (2026-11-13)

David's call: every bullet exactly two lines, the last at least 80% full;
one-line bullets only under the incoming IBM role and BTA, at least 80%
full (decision record 0015).

- **The one-line list David edits:** `lib/agent/config/one-line-experiences.ts`.
  Each entry is an organization from the library, with a title when only one
  role there is allowed.
- Chrome decides line count: `evaluateLayout` fails `one_line`, `widow`,
  `three_lines` and `short_line`. `check_bullets` reports character line
  fill as a warning and takes `one_line_ok` (bullet indexes); the playbook
  marks allowed entries `one_line_ok`.
- Fallback path only: `evaluateCharacterLines` estimates the same rules from
  the calibrated targets (`layout_report.line_check: "characters"`).
- Loosened ceiling: calibration's two-line maximum is twice the median full
  line (zero2sudo: about 265 instead of 260), never below twice the shortest.
- STANDARDS.md's line fill rule is updated to match, and the skill and
  served standards are regenerated.

| Check | Result |
| --- | --- |
| Unit tests | 1,872 pass (layout, checker, calibration, build and tool tests updated to the rule; 10 new) |
| Lint, typecheck | Pass (only the 2 existing lint warnings) |

#### Change 3: one full page (2026-11-13)

David's call: one page, no large empty space at the top or bottom (more
than 5% of the page height below the last line fails); a short page gets
the next best library bullet, a page that runs over loses its weakest
bullet (decision record 0016).

- The renderer measures `top_gap` and `bottom_gap` against the page height;
  `evaluateLayout` fails `page_not_full` and `top_gap` above 5%.
- `lib/agent/resume/page-fill.ts` chooses what to add (best story for the
  posting not yet on the page, under an experience on the page, best variant
  that passes the checks) and what to cut (least relevant bullet; never
  David's edits; an entry keeps its last bullet while others have two).
- The build loop: at most 3 adjustments, none started after 50 seconds, on
  the same resume.lol resume; an addition that runs over is undone. Not
  counted as builds. Reported as `page_adjustments` (with explain notes) and
  `adjust_stop`.
- STANDARDS.md has the page fill rule; the playbook tells the run to show
  added bullets with their notes.

| Check | Result |
| --- | --- |
| Unit tests | 1,887 pass (15 new: `agent-resume-page-fill`, gap rules, 4 build-loop tests) |
| Render tests (real Chrome) | 9 pass (1 new: top and bottom gap measured on a real page) |
| Lint, typecheck | Pass (only the 2 existing lint warnings) |

#### Step 10: preview database (2026-11-14)

- Preview project `interndex-preview` (us-east-1). All 10 migrations applied
  through the Supabase management API (this session cannot open database
  connections), each in its own transaction and recorded in
  `supabase_migrations.schema_migrations`, so `supabase db push` will not
  run them again. 14 public tables, all with RLS on; the private `resumes`
  bucket exists.
- David's preview account was created before the schema, so the sign-up
  trigger never made his `profiles` row. Backfilled once with the trigger's
  own name rule.
- pgTAP on the preview: 203 of 203 pass. One older assertion in
  `001_foundation_rls` counted every profile in the database and expected
  2, which only holds on an empty database; it now counts its own two test
  users, so the suite gives the same answer on the preview. Local: 203 pass.

#### Step 10: hosted checks and the import (2026-11-14)

David connected the preview as a second custom connector ("interndex
automate") with his preview account, after turning Deployment Protection
off, setting the preview Supabase Site URL and `NEXT_PUBLIC_SITE_URL` (Preview,
agent-specs) to the preview address.

| Check | Result |
| --- | --- |
| Owner's server | 21 tools: the 5 tracker tools plus all 16 agent tools |
| Non-owner's server (disposable preview user, deleted after) | Exactly the 5 tracker tools; instructions byte-identical to today's; `get_playbook`, `import_library`, `search_stories`, `complete_run` by name: "Tool not found"; tracker still works |
| RLS on David's real rows | The disposable user sees 0 rows in every agent table; David sees his; a rule written in his name is refused by the policy |
| OAuth metadata | The preview advertises its own `/api/mcp` and the preview Supabase as its authorization server |
| `import_library`, first run | 7 experiences, 22 stories, 94 variants added, profile saved; every field compared with the payload in the database: identical |
| `import_library`, second run (whole payload, one call) | 0 added, 94 existing; row counts unchanged (idempotent, test plan item 6) |
| `add_rule` | 5 rules saved: the Interndex rule was over the 500-character cap, so it is saved as two (launch, repositioning) with the same wording |
| `get_playbook` | Serves all 5 rules and the full profile (test plan item 5) |
| Saved rule as a blocklist | `check_bullets` now fails "pull requests" as filler |
| Size caps (`usage_log`) | Largest results: `get_playbook` 21 KB of 40, `search_stories` 8.2 KB of 12 |

**Not yet run (needs Claude in the Job Search project):** template
calibration (needs the two base resume ids in resume.lol), full runs on the
past postings, the skipped-posting fit read, a timed run, the build cap on a
real build, and the phone app. The build cap is covered on the preview
database by the pgTAP suite.

#### Step 10: Chrome on the preview (2026-11-14)

`calibrate_template` failed with `launch_failed` on the preview for both
templates. The tool only reported the reason, so it now also returns (and
logs) Chrome's first error line. That showed the cause: `Cannot find module
'/var/task/node_modules/playwright-core/browsers.json'`. playwright-core
reads that file by a computed path that build tracing does not follow, so it
was never copied into the function. `next.config.ts` now copies all of
playwright-core (13 MB) into `/api/mcp` next to the compressed Chrome, and
`tests/unit/agent-function-files.test.ts` keeps both includes. Not the cause:
memory, timeout, Node 24 or the Preview env vars.

Calibrated on the preview against David's base resumes (12 measured lines
each):

| Template | One line | Two-liners |
| --- | --- | --- |
| zero2sudo | 130 | 240 to 274 |
| jakes | 107 | 200 to 232 |

Both entry lists are the library's experiences, with the incoming IBM role
and BTA marked `one_line_ok`.

#### Still open for step 10

- **Preview Supabase project.** Needed before step 10. Once it exists, David's
  preview user id is needed for Vercel's Preview `OWNER_USER_ID`.

### 10. Spec 1: how to test it, and David's setup steps

**The local quality gate** (what every step above passed):

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run extension:check
npm run test:db
npm run test:render
```

`test:db` needs Docker (`supabase db start` is enough). `test:render` needs a
Chrome binary (see `docs/testing.md`). `build` needs the three public
`NEXT_PUBLIC_*` values, as in CI.

**Setup David does by hand, in order**

1. **Preview Supabase project.** Create a free second project (never
   production). In it, turn on the OAuth 2.1 server with consent path
   `/oauth/consent` and dynamic registration, as in `supabase/config.toml`.
   Share its URL and publishable key. I apply the migrations to it and run
   the pgTAP suite against it there first.
2. **Sign up on the preview** with David's email, then share that account's
   user id (Supabase dashboard, Authentication, Users). It differs from the
   production id.
3. **Vercel, Preview environment variables:** `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the preview project,
   `NEXT_PUBLIC_SITE_URL` as the branch alias URL, `OWNER_USER_ID` as the
   preview user id, `RESUMELOL_API_KEY` (mark it Sensitive), and
   `SUPABASE_SECRET_KEY` for the preview project (account deletion uses it).
   Do not set `CHROMIUM_EXECUTABLE_PATH`.
4. **Vercel Deployment Protection:** off for previews, so Claude's connector
   can reach the preview MCP URL.
5. **Claude:** add a custom connector at `{preview alias}/api/mcp`, sign in
   with the preview account, and use it in a Job Search project with only that
   connector and web search on. Add `docs/STANDARDS.md` as project knowledge
   and install the skill from `skill/interndex-pipeline/SKILL.md`.
6. **In that project, calibrate both templates** (see step 6's setup for the
   exact sentence and ids).
7. **Run the import.** The payload is prepared (see "Import decisions
   applied" above): `import_library`, then the four `add_rule` calls.
8. **At merge:** the same variables in Vercel Production, with the production
   `OWNER_USER_ID`, and the migrations pushed to production.

No Chrome extension reload is needed: Spec 1 does not change the extension.
