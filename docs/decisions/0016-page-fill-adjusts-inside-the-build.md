# 0016: The build fills the page itself: add from the library, cut the weakest

**Context.** STANDARDS.md said the page must be fully used, but only as a warning (under 90% of the content height). A short page or a page that ran over meant another build, and builds are capped at two per resume.

**Decision.** One page, with no more than 5% of the page height empty below the last line (or above the first): `evaluateLayout` fails `page_not_full` and `top_gap`, from gaps the Chrome renderer now measures against the page height. Inside the same build call, when the page is short the build adds the next best library bullet for the posting; when it runs over, it cuts the weakest bullet. Then it updates the same resume.lol resume, fetches the HTML again and re-checks.

- "Next best" uses the `search_stories` ranking against the posting's requirements: the best story not already on the page (by wording or by most of its words), whose experience is on the page, written with its best variant that passes `check_bullets` and the line rules by character estimate.
- "Weakest" is the bullet least relevant to the requirements. An entry keeps its last bullet while another has two, and David's own edits are never cut.
- At most 3 adjustments per build, and none starts after 50 seconds, so the build ends inside the MCP time limit. An addition that runs over a page is undone (resume.lol is put back to the last checked page) and the build reports the short page.
- Adjustments do not count toward the 2-build cap. They are listed in the result and in `layout_report.page_adjustments`, with explain notes for added bullets. The saved fingerprint is of what resume.lol holds at the end, so a later rebuild still works.

**Alternatives.** Report the gap and let the assistant fix it with `rebuild_with_edits` (spends David's second build, and edits cannot add a bullet). Stretch spacing in CSS to fill the page (changes David's design and hides a thin resume).

**Why.** Page fill is a measurement only Chrome can make, so the fix belongs next to the measurement. Choosing from the library keeps every added claim one David has already approved, with its explain note.
