# 0011: complete_run saves through one database function, then builds

**Context.** Spec 1 asks the end of a run to save the tailored resume, new variants and answers "in one transaction", and to keep write calls few. supabase-js has no transactions: each insert is its own request, so a failure halfway would leave half a run saved.

**Decision.** `complete_run` checks everything first in code (the content fits the template, the whole page passes `check_bullets`, every new number has an explain note), then calls one Postgres function, `public.complete_run`, that saves the fit read, the tailored resume, the variants, the answers and the ledger, or nothing. The function is SECURITY INVOKER, so row-level security still applies to every row it touches, and it also filters on `auth.uid()` itself. The resume.lol build cannot be inside a database transaction, so it runs after the save, and a failed build leaves a saved draft that `build_resume` picks up. An unbuilt draft is reused; a built resume is never overwritten.

**Alternatives.** Several supabase-js calls in a row (not atomic). A SECURITY DEFINER function (would bypass row-level security, so every ownership check would live in the function alone). The build inside the same call with a rollback on failure (resume.lol writes cannot be rolled back).

**Why.** A run is either saved or it is not, which is what makes "check get_run_state and continue" safe. The checks run before the save, so a page that breaks a rule never reaches the database.
