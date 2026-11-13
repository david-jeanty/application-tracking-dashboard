# 0001: Server AI cost stays at $0

**Context.** The recruiting agent writes resume bullets, judges fit and drafts outreach. Each of those needs a language model. Interndex has real student users and no revenue, and an earlier feasibility study showed full AI parsing of postings was not reliable on a free architecture.

**Decision.** Interndex never calls an LLM API. All writing, judgment and web search happen in David's own Claude session, through the Interndex MCP tools and the playbook served by `get_playbook`. Server code is deterministic: storage, checks, scoring, query building and resume.lol calls.

**Alternatives.** Call a model from the server for tailoring (cost per run, a second set of prompts to maintain, an API key to protect). Run a small open model (hosting cost, lower quality than the model David already uses).

**Why.** The model David already pays for is the best one available to him, and it is already in the conversation. Keeping the server deterministic means every rule that matters (the bullet checker, line fill, the 2-build cap, the size caps) is code with unit tests, not a prompt that might be ignored. It is the same rule the product was built on: AI does the reasoning, Interndex stores the truth.
