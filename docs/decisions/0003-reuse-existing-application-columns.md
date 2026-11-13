# 0003: Reuse the existing application columns

**Context.** Spec 1 asks to add `location`, `source_url` and `jd_text` to `applications`. The table already has `location`, `application_url` and `job_description`, and every page, the extension and the tracker tools read them.

**Decision.** `create_application_from_jd` writes the posting link to `application_url` and the job description to `job_description`. Only the truly new fields were added: `jd_requirements`, `job_id`, `partner_functions` and `tailored_resume_id`, all nullable with no backfill.

**Alternatives.** Add the columns as the spec names them (one fact with two homes that drift apart, and a posting saved by the agent would look empty to the web app).

**Why.** Additive changes only, and no duplicated truth. The spec's real requirement is that the full job description is never returned after creation; every agent tool enforces that, and the playbook tells the assistant not to call the older `get_job` during a run. `get_job` itself is unchanged because other students depend on it.
