# 0005: A story library instead of one master resume

**Context.** David has nine recent resumes, each tailored, with different wordings and numbers for the same work. A tailored resume needs the right angle on each piece of work (operations, consulting, data, product) in the posting's vocabulary.

**Decision.** Work is stored as stories (one piece of work) with many variants (wordings), each tagged with style, angles, template fit, a gold flag and an explain note. `search_stories` ranks them deterministically for a posting's requirements, and new wordings that pass the checker are saved back.

**Alternatives.** One master resume the assistant rewrites each time (every run starts from scratch, uses more of David's Claude usage, and loses the wordings he approved).

**Why.** Reuse before writing: most runs should pick an approved variant instead of drafting a new one. Every variant carries the explain note that lets David defend the claim in an interview, and the library improves with each correction.
