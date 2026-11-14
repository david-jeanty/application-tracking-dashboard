# 0017: One build per run: calibrated line fill blocks before the first build

**Context.** On the first real run (Legrand, Product Management Intern) the run built, saw Chrome's line-fill failures, and fixed them with `rebuild_with_edits`. That used the second of the two builds, so David had none left for his own edits at the apply step. Decision 0015 had made the character line-fill check a warning, which is why nothing stopped the run before the first build. Most library wordings are 190 to 230 characters: two lines on the older resumes, widows on zero2sudo's wider line (240 to 274 once calibrated).

**Decision.** Once a template is calibrated, its targets come from David's real page, and `check_bullets` and `complete_run` fail a bullet outside them (two lines with the last at least 80% full, or one line where the experience allows it). Every line fix happens before the first build. The playbook says a run uses exactly one build: after it, failures Chrome still finds are listed in the summary for David, and the second build is his. Chrome keeps the final word at the build; the character estimate is still the check when Chrome cannot render.

**Alternatives.** Keep the warning and trust the run to fix first (the run did not). A third build (the cap protects David's resume.lol account and his usage). Fix line fill inside the build by swapping in other wordings (works only for bullets that came from the library unchanged).

**Why.** The second build exists for David. A gate in code holds whatever model or effort setting runs the playbook.
