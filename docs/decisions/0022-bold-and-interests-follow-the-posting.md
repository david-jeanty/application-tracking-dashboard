# 0022: Bold and the interests line follow the posting

**Context.** Runs bolded every number, which tells a recruiter skimming against the posting nothing. The base resume's interests line appeared on every resume, taking a line the experience could use.

**Decision.** A **bold** phrase must share a word with the posting's requirements or the fit read's mirror words; a bold number with no words passes only in a bullet that speaks to one of the requirements (`lib/agent/checks/bold.ts`, enforced in `complete_run`). The interests line is off by default: it is dropped from the base resume's skills and from skills the run writes, and comes from the profile (`agent_profile.interests`) only when the run sets `include_interests` because the culture fits, or when the build finds the page still short after the bullets.

**Alternatives.** No bold at all (loses the skim value David wants). A fixed bold budget per bullet (does not tie bold to the posting).

**Why.** Bold and every optional line earn their place by matching the posting.
