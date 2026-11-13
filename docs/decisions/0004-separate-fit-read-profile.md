# 0004: A separate profile row for the fit read

**Context.** The fit read checks a posting's stated eligibility (graduation window, degree level, year of study) against David's profile. The agent runs in Claude, whose access token is an OAuth client token, and the database deliberately refuses client tokens any access to `profiles` (migrations from September 2026).

**Decision.** A new owner-scoped table, `agent_profile`, holds only the facts the fit read needs. It is filled during the one-time import and served inside `get_playbook`.

**Alternatives.** Let OAuth clients read `profiles` (reverses a security fix for every user). Hard-code David's facts in the playbook source (personal data in the repository, and a code change every time a fact changes).

**Why.** It keeps the existing security boundary exactly as it is and holds the minimum data the feature needs.
