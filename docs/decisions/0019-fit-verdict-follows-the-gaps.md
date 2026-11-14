# 0019: The fit read's verdict follows from the must-have gaps

**Context.** The Legrand run rated the posting a Strong fit while listing SO&P, forecasting, pricing, inventory and Excel as gaps, the core of the role. Two things caused it: the run marked every responsibility nice_to_have and only the listed qualifications must_have, and the verdict was left to judgment.

**Decision.** The run marks must_have every required qualification and every main responsibility; nice_to_have only what the posting calls preferred, a plus or a bonus. The fit read names its gaps by requirement number (`gap_requirements`). The verdict follows a fixed rule over the must-have requirements that are gaps: none is Strong fit, up to half is Moderate fit, more than half is Long shot (`lib/agent/fit.ts`). `complete_run` refuses a verdict stronger than the rule allows and says what it may be. The verdicts are now strong_fit, moderate_fit and long_shot.

**Alternatives.** A weighted score per requirement (more knobs, same outcome on real postings). Leaving it to the playbook text (it was in the playbook already).

**Why.** A verdict David can predict from the gaps, the same on every model and effort setting.
