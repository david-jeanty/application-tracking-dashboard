# 0013: The story library is a source of facts, not fixed text

**Context.** The import seeded 22 stories with 94 wordings from David's nine resumes. Postings each use their own vocabulary, and a saved wording rarely matches it word for word. The first playbook said to write a new bullet only where no variant fits, which pushes runs toward reusing a close-but-wrong wording.

**Decision.** For each bullet the run either reuses a variant as is, or writes a new bullet from the story's facts, mirroring the posting's language and following the house style and the stretch rules in `docs/STANDARDS.md`. Every claim must trace to the story's facts. Employers, titles and dates always come from the library unchanged. Each story's summary is its fact sheet, and `search_stories` now returns it (at most 700 characters) with the variants, so the run has the facts in front of it.

**Alternatives.** Variants as fixed text with writing only as a fallback (bullets miss the posting's words and fit reads worse). Free rewriting from the whole resume history (claims drift away from what happened, and explain notes stop matching).

**Why.** The facts are what David has to defend in an interview, so they stay fixed; the wording is what has to fit the posting, so it is free. The checker still blocks every house-style failure before a build, and new numbers still need an explain note. The bigger result raised the `search_stories` size cap from 9 KB to 12 KB: David's library measures about 10.2 KB at its largest.
