# 0009: At most two builds per resume, and a rebuild updates the same resume

**Context.** Each build is a resume.lol write, a render and a PDF upload. Spec 1 caps builds at 2 per resume and says a build creates a new resume and never edits existing ones. David's edits at apply time need a second build.

**Decision.** The first build creates a new resume named `{Name}_{Company}_{Role}` (the name comes from the base resume's @NAME variable). `rebuild_with_edits` updates that same resume in place, sending only the markdown, so styling tweaks David made in resume.lol survive. Before it writes, it compares the resume's current content with what Interndex last sent (a SHA-256 of the markdown) and refuses if David changed it there; resume.lol's `expected_updated_at` guard catches a change in the moment between. The cap is held in the database (`build_count` between 0 and 2) and in code. A build is reserved before resume.lol is called and released if resume.lol fails, so a failed call does not use one up. The resume.lol client has no list, delete or share-link calls and refuses to write a template's base resume.

**Alternatives.** A new resume on every rebuild: two near-identical resumes per posting in David's account and lost styling tweaks. No cap: an assistant stuck in a fix loop could rebuild without limit.

**Why.** One resume per posting is what David wants to find in resume.lol. The content check means Interndex can never overwrite his own edit, and the cap keeps a run bounded.
