# 0007: The bullet checker blocks some rules and warns on others

**Context.** STANDARDS.md marks rules as [checked]. Some are unambiguous (filler words, first person, em dashes, one sentence, repeated openers, line fill). Others need judgment: the standards themselves say an unlisted opening verb is "flagged for review" and a believability issue is a "warning not block".

**Decision.** `check_bullets` returns failures, which must be fixed before a resume is built, and warnings, which the assistant reviews. Hard rules are failures. Review rules (opener not on the result-verb list, numbers too large for an intern, the same metric with two values, approximate numbers, effort metrics, Claude named as the actor) are warnings. Saved rules of the form Never use "word" extend the blocklist.

**Alternatives.** Block on everything (good bullets blocked by heuristics, endless rewrites). Warn on everything (a draft breaking a hard rule could reach David).

**Why.** David should never see a draft that breaks a rule, and should never be stuck in back and forth over a heuristic. Every gold bullet in STANDARDS.md passes and every negative example is caught; the tests read both from the standards file.
