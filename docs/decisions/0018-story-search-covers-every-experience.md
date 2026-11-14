# 0018: Story search covers every experience, and matches the posting's words

**Context.** On the Legrand run `search_stories` matched none of the posting's 12 requirements. A story matched a requirement only if it held half of the requirement's words, and postings write long requirements ("Develop catalogs, sell sheets, product bulletins and promotional campaigns with sales and marcomm teams"). The 5 results were simply the wordiest stories, so the Fidus campaign work was missed and the run needed a second search for the IRB dashboard, StraNexus and IBM. The incoming IBM role and BTA, which no posting names, got no story at all, so the run left them as headings without bullets. Separately, page fill never fired: the zero2sudo page holds an empty block that stretches to the bottom, and the gap was measured from elements, so every page looked full (the Legrand page was 9.3% empty).

**Decision.**
- A requirement matches when a third of its words (at least two) appear in the story, counting a short list of related words David's stories use for the same work (`RELATED` in `lib/agent/library/scoring.ts`: campaigns and outreach and audiences, collateral and content and case studies, metrics and KPIs and dashboards). Real gaps such as forecasting, pricing, inventory and SO&P have no related words, so they stay gaps.
- `search_stories` returns up to 8 ranked stories (2 wordings each), then the best story of every experience not yet shown (1 wording), in one call. Its size cap rose to 24 KB; David's library measures about 16 KB for a 12-requirement posting.
- `complete_run` refuses an entry left without bullets when the library has a story for it; one-line bullets are fine where the experience allows them.
- Page fill measures the gap from the first and last lines of text, and can add from any story whose experience is on the page, not only stories that share words with the posting.

**Alternatives.** Embeddings or an LLM for matching (server AI cost stays at $0, decision 0001). Returning the whole library every time (about 60 KB per run).

**Why.** One search gives the run material for every entry, and the deterministic matcher now finds what a reader would.
