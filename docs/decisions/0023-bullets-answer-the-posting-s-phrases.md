# 0023: Bullets answer the posting's phrases, not its keywords

**Context.** Bold and bullet choice followed single keywords. A posting that asked for "led a group project" got the noun "team" bolded, and the story that only shared the word "project" could outrank the one that showed David leading a group. Close experience (structuring an engagement and proposing client workstreams) was left in its own words instead of the posting's.

**Decision.**
- Each requirement carries 1 to 3 phrases copied from the posting, 2 to 6 words, never one word (`requirementSchema.phrases`, stored in `jd_requirements`, so no migration). `complete_run` refuses a posting with no phrases.
- `lib/agent/library/phrases.ts` decides whether a text answers a phrase: all its words (or close neighbours such as team for group, led for lead) inside one short window is a direct answer, at least half is a partial one. `search_stories` and page fill rank direct answers above keyword overlap and say which phrases each story and variant answers.
- Bold must be a span that answers a phrase on its own, 8 words at most, 5 spans per resume (`lib/agent/checks/bold.ts`). An isolated noun or a bare number holds one word of a phrase at most, so it fails.
- Bridging is a playbook move: reword close experience in the posting's language, inferring freely. The one part code can check is enforced: every number in a run's bullets must come from a story of the same experience (`lib/agent/checks/numbers.ts`, within 10% for confident rounding).
- Loosely related bridges are listed in `complete_run`'s `loose_bridges`. After the build they come back with a ready revert edit (the library wording), minus any the build cut. They are not saved to the library unless David accepts one.

**Alternatives.** Let Claude judge phrases with no server check (the old keyword rule shows it drifts). Semantic matching with embeddings (an AI cost on the server, against decision 0001). Block loose bridges (David asked for them, with a chance to revert).

**Why.** A recruiter skims for the posting's own phrases. Matching on phrases in code keeps bold and selection consistent from run to run, and the number check keeps aggressive reframing from turning into invented facts.
