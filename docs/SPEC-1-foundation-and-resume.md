# SPEC 1: Foundation and Resume Pipeline

## Goal

David pastes a job description into Claude. From that moment the agent runs on its own, in one go: fit read, tailored resume, resume.lol build, PDF saved to Interndex, then straight into the people step (Spec 2). David's only review is at the apply step, where the PDF, posting link and people list are already waiting.

This build also creates the foundation: the story library, learned rules, the run ledger, and a one-time import of David's history.

## Architecture

- **Interndex is the brain.** Storage, the playbook, standards, deterministic checks, scoring and resume.lol calls all live on the Interndex server and MCP server.
- **Claude is the runtime,** through the Interndex custom connector, in a "Job Search" project. Claude also runs the library sessions and builds Interndex in Claude Code.
- **The playbook is served by the server** through `get_playbook(phase)`, and a Claude skill (`skill/interndex-pipeline/SKILL.md`) generated from the same source triggers the run when David pastes a job description. Keeping the playbook on the server also keeps the tools assistant-agnostic for the future.
- **No LLM calls on the server.** All writing, judgment and web search happen in David's own Claude session.
- All new features gated to `OWNER_USER_ID`.

## Step 0: Claude setup checks (before building)

| Check | Status |
| --- | --- |
| Interndex MCP server connected to Claude as a custom connector | To check |
| A write tool (saving an application) works from Claude without repeated permission prompts (allow Interndex's tools when asked) | To check |
| Web search enabled in the Job Search project | To check |
| Same flow from the Claude phone app (secondary; David applies on his computer) | To check |

Earlier ChatGPT testing (Nov 2026) showed LinkedIn's app there returns only profile URLs to the model, so it adds no data; ChatGPT is not used.

**Batched saves.** The run reads and decides first, then saves in as few write calls as possible: `create_application_from_jd` at the start and a single `complete_run(application_id, payload)` at the end that stores the tailored resume content, triggers `build_resume`, and saves candidates, contacts and drafts in one transaction. Read tools are marked read-only.

## Data model (new tables, RLS by user)

- `experiences`: id, user_id, org, official_title, start, end, location, sort_order
- `stories`: id, experience_id, label, summary, tags (angles: product, ops, consulting, marketing, data)
- `story_variants`: id, story_id, text, style (`house` or `story_voice`), angles[], template_fit[], char_count, is_gold, source (`import`, `library_session`, `pipeline`, `edited`), explain_note, created_at
- `templates`: id, name (`jakes`, `zero2sudo`), resumelol_template_ref, use_for (role types), one_line_chars, two_line_min, two_line_max, header_config (json), calibrated_at
- `tailored_resumes`: id, application_id, template_id, content (json), mirrored_title (nullable), resumelol_resume_id, resumelol_url, pdf_path, status (`draft`, `built`, `edited`), created_at
- `edit_examples`: id, variant_id (nullable), before_text, after_text, note, created_at
- `rules`: id, scope (`bullets`, `outreach`, `all`), text, created_at
- `answer_bank`: id, question, answer, application_id (nullable), tags
- `run_ledger`: application_id, step, status, count, updated_at
- `usage_log`: application_id, tool, response_bytes, created_at
- Extend `applications` (additively): `jd_requirements` (json), `jd_text` (stored, never returned after creation), `source_url`, `job_id`, `location`, `partner_functions` (text[]), `tailored_resume_id`

## MCP tools (new)

Short, plain descriptions. Compact JSON responses, no prose.

**Playbook and state**
- `get_playbook(phase)`: phases `run`, `library_session`, `import`, `debrief`. Returns the steps plus the matching parts of STANDARDS.md and all saved `rules`.
- `get_run_state(application_id)`, `get_application_brief(application_id)` (under 300 words)

**Applications**
- `create_application_from_jd(company, title, location, job_id, source_url, jd_text, requirements[], partner_functions[])`: dedupe on company + title + job_id.

**Library**
- `search_stories(requirements[], angles[], template)`: at most 5 stories, best 2 variants each, deterministic scoring.
- `save_variant(story_id, text, style, angles[], explain_note)`
- `record_edit(before_text, after_text, note, variant_id?)`, `add_rule(scope, text)`

**Checker**
- `check_bullets(template, bullets[])`: failures only, per bullet and page-level. Pure function, unit tested against STANDARDS.md.

**resume.lol**
- `calibrate_template(template)`: one test build per template, measures the PDF, saves character targets.
- `build_resume(tailored_resume_id)`: one call with complete content, creates a new resume (never edits existing ones), named `David_Jeanty_{Company}_{Role}`. Fetches the PDF once and verifies on the server (one page, no widows, last lines at least 80% full). Max 2 builds per resume. Stores the PDF in Supabase Storage (private) and links it to the application.
- `rebuild_with_edits(tailored_resume_id, edits[])`: for edits David makes at apply time; counts toward the 2-build cap; records each edit with `record_edit`.

**Answers**
- `save_answer`, `search_answers`

## The run (phase `run`)

1. Load `get_playbook("run")` and `get_run_state`.
2. Extract fields and requirements; `create_application_from_jd`.
3. **Fit read**, shown at the top: first, only the posting's own stated requirements checked against David's profile (graduation window, degree level, year of study). If they rule him out, stop and say why. Otherwise: verdict (strong fit, stretch, long shot), requirements matched to stories, true gaps, words to mirror, template. Never mention work authorization, school terms, IBM or other applications.
4. **Tailor** with the Positioning playbook. Reuse library variants first; write new ones only where needed (at most 2 drafts each). Run `check_bullets` and fix every failure.
5. **Build** immediately with `build_resume`. No approval step.
6. Continue straight into the people step (Spec 2) in the same run.
7. **Finish with one summary:** fit read, PDF link, posting link, top people with drafts ready in the Outreach queue, and any follow-ups due.
8. If the posting has a cover letter or questions, draft them from the library and `search_answers` and include them in the summary.

David reviews the PDF while applying. If he changes anything, the assistant uses `rebuild_with_edits`, and the edits are saved as examples and rules.

## Library sessions (phase `library_session`, run in Claude)

Batch sessions where Claude writes and polishes story variants to the house standard: converting `story_voice` variants to `house` style, adding new stories (for example when the IBM internship starts), and filling angle gaps (consulting, PM, data versions of each story). Every variant passes `check_bullets` and gets an explain note before saving. Goal: during runs, the assistant mostly picks Claude-written variants instead of writing new ones.

## PDF storage and the Resumes tab

- Every built PDF lives in Supabase Storage (private, owner only).
- **Resumes tab** in the web app: newest first, company, role, date, template, Open and Download, link to the application. Each application page shows its resume.
- The resume.lol link is kept only for design tweaks.

## Templates

- `zero2sudo`: technical roles (PM, TPM, data, AI, solutions). `jakes`: consulting and business roles.
- Header and section order stored in `header_config`, confirmed with David during calibration.

## One-time import (phase `import`)

David's applications already live in Interndex, so there is no tracker import. The import only seeds what's new:

- `import_library(experiences[], stories[], variants[])`: from David's 9 recent resumes plus the STANDARDS.md gold set.
- `import_contacts(rows[])` and `import_interactions(rows[])`, with dedupe: only for people David names in the session, or contacts found in existing Interndex application notes. If Spec 2 tables don't exist yet, create them as defined there.

**Library seed:** group resume bullets into stories (about 25), tag `house` or `story_voice`, mark STANDARDS.md gold bullets `is_gold`.

**Explain notes:** the assistant drafts a one-line note for every number and shows them as one compact list per experience; David approves all or fixes lines. New numbers later get a drafted note saved with the variant.

## Usage guardrails (server-enforced, tested)

- Size caps on every tool result (see tools above). The full JD is never returned after creation.
- Run ledger: finished steps are not redone unless called with `force: true` at David's request.
- Build cap: 2 per resume.
- `usage_log`: response bytes per tool and application (estimated tokens = bytes / 4), shown in the web app as estimated cost per application and step.
- One run per posting; a new chat per posting starts from `get_application_brief`.

## Test plan (on a preview, before merging)

1. Run on 3 or 4 past postings (Tinder TPM, Pinterest Strategy & Operations, T-Mobile, exacare). Compare to David's approved resumes. Target: 2 or fewer edits per resume.
2. Include one posting David skipped; the fit read should match his call.
3. One calibration build per template: full lines, no widows, one page.
4. Time a full run at a low effort setting; target under a few minutes with no mid-run input.
Record results in `docs/BUILD-LOG.md`.

## Acceptance criteria

- Pasting a job description runs fit read, tailoring and build with no further input, ending in a PDF in the Resumes tab.
- Every resume passes `check_bullets` before building.
- At most 2 builds per resume; existing resume.lol resumes untouched.
- Works from Claude on the computer and the phone app.
- Rules saved with `add_rule` appear in `get_playbook` on the next run.
- The import is idempotent. Other Interndex users see no change. Unit tests pass.

## Out of scope

People, outreach and coffee chats (Spec 2). Auto-sending anything. Applying to jobs.
