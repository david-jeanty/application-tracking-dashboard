# CLAUDE.md: Interndex Recruiting Agent

You are extending Interndex, a live internship tracker (web app, Chrome extension, Supabase backend, MCP server) with real student users. Interndex is becoming a recruiting agent that runs in Claude through the Interndex connector: the playbook, standards, checks and data live on the server, so the MCP tools stay assistant-agnostic. The owner, David, is not a programmer and does not review diffs. Your job is to build correctly the first time and leave the codebase easy to keep working on.

## Read first, every session

1. Read this file, then `docs/STANDARDS.md`, then the spec you were asked to build (`docs/SPEC-1-foundation-and-resume.md` or `docs/SPEC-2-people-and-outreach.md`).
2. Explore the repo before writing code: framework, folder structure, Supabase schema and migrations, the existing MCP server and its tools, the Chrome extension, and any existing resume.lol integration. Match existing patterns. Do not introduce a new framework, ORM or state library.
3. Write a short plan in `docs/BUILD-LOG.md` (what you found, what you will change) before editing code.

## How to work

- **One branch and one PR per spec.** No sprawl of small PRs.
- **Additive changes only.** New tables, new columns, new tools. Never drop or rename existing columns or tools that current users depend on. If something existing must change, stop and explain why in `docs/BUILD-LOG.md`.
- **Owner-only feature flag.** Every agent feature in these specs is gated to `OWNER_USER_ID` (env var). Other Interndex users must see no change. Contacts and coffee chat notes are personal data about third parties; they are never exposed to other users.
- **Row-level security** on every new table, scoped to the owning user.
- **Secrets** (`RESUMELOL_API_KEY`, Supabase service keys) live in env vars only. Never commit them, never log them, never return them from a tool.
- **AI cost stays at $0 on the server.** Interndex never calls an LLM API itself. All writing, judgment and web search happen in the user's own Claude session through the MCP tools and the playbook served by `get_playbook`. Server code is deterministic: storage, checks, scoring, query building, resume.lol calls.
- **Deterministic logic gets unit tests.** The bullet checker, message checker, X-ray query builder, ranking and line calibration must have tests with real fixtures from `docs/STANDARDS.md`.
- **Keep it lean.** Build what the spec asks. If you think something is missing, write it under "Suggestions" in `docs/BUILD-LOG.md` instead of building it.
- **Test on a preview, never on live Interndex.** Deploy the branch to a preview environment, run the spec's test plan there, and only then open the PR for merge. Database migrations must be tested on the preview database first.
- **Keep decision records.** For each meaningful choice, add a short file in `docs/decisions/` (context, decision, alternatives, why). Examples: why server AI cost stays at $0, why X-ray search, why a story library instead of one master resume, why at most 2 resume.lol builds. These become David's portfolio case study.
- Finish by updating `docs/BUILD-LOG.md` with what was built, how to test it, and any manual setup steps David must do (env vars, installing the skill, extension reload).

## Writing rules that apply to everything you generate

Any user-facing text you write (UI copy, tool descriptions, skill text, seed content, docs) follows these:

- No em dashes. Use commas, colons, periods or parentheses.
- Never use the adverb formed from "genuine" + "ly".
- Plain, specific English. No filler, no hype words.

The full resume and outreach standards are in `docs/STANDARDS.md`. The checkers must enforce them in code, not just in prompts.
