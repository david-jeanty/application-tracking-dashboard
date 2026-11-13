# 0006: One source for the playbook and the skill

**Context.** The run's steps must reach Claude two ways: from the server through `get_playbook`, and as a Claude skill that starts the run when David pastes a job description. Two hand-written copies would drift.

**Decision.** The steps live in `lib/agent/playbook/phases.ts`. `npm run agent:playbook` renders them into `skill/interndex-pipeline/SKILL.md` and splits `docs/STANDARDS.md` into `standards.generated.ts`. A unit test fails if either generated file is out of date, and the checker tests read their fixtures from `docs/STANDARDS.md` directly.

**Alternatives.** Read `docs/STANDARDS.md` from disk at runtime (a serverless deployment may not ship the docs folder). Keep the skill as a separate document (it would drift from what the server serves).

**Why.** David edits one Markdown file and one steps file; everything that depends on them is regenerated or fails a test.
