# 0012: Resume building is an owner-only exception to "no resume generator"

**Context.** `README.md` and `PROJECT_SPEC.md` tell students that Interndex has no resume generator and does no tailoring. The recruiting agent builds tailored resumes on resume.lol and stores PDFs, which is exactly that.

**Decision.** Resume building exists only for the `OWNER_USER_ID` account: the tools are on the owner's MCP server alone, the Resumes page and the application panel render only for the owner, and every other student sees no new tool, page, query or nav item. The public README and product spec stay as they are, because they remain true for every student. The core rule still holds for the owner: the server never calls an LLM; Claude writes, and the server stores, checks and calls resume.lol.

**Alternatives.** Update the README to mention resume building (would describe a feature no student can use). Ship it to every user (resume.lol keys, base resumes and storage are personal to one account, and the specs say other users must see no change).

**Why.** The product's public promise stays accurate, and the owner gets the agent. If resume building ever opens to students, this record and the README change together.
