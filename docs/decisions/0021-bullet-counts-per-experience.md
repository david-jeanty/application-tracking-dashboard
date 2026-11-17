# 0021: Bullet counts per experience follow David's layout

**Context.** Runs chose how many bullets each experience got, and the Ramp run gave BTA and Pro Bono fewer than David wants. His example sets the default layout.

**Decision.** `lib/agent/config/bullet-counts.ts` holds the counts David edits by hand: incoming IBM role 1, IRB 2, Fidus 3, StraNexus 2, Interndex 3, IBM Pro Bono 2 to 3, BTA 2; others 1 to 3. `complete_run` refuses a resume outside them, with the minimum lowered to the number of stories the library has for that experience. The playbook's entry list shows each range. Page fill adds only below an entry's maximum and cuts only above its minimum; if the page still runs over at the tightest line height, it cuts below a minimum, because one page comes first. This replaces the earlier "every entry gets at least one bullet" check, which the counts cover.

**Alternatives.** Counts in the playbook text only (the Ramp run did not follow the intent). Counts in the database (no screen to edit them yet).

**Why.** A predictable shape David has already approved, the same on every run.
