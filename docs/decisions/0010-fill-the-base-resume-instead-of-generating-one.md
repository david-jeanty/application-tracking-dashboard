# 0010: Fill David's base resume instead of generating a resume from scratch

**Context.** resume.lol has no templates in its API. Jake's and zero2sudo exist only as David's own resumes: markdown with @ variables, CSS and @page settings. STANDARDS.md locks employers, dates, degrees, schools and certifications.

**Decision.** Each Interndex template points at one base resume by its resume.lol id (`templates.resumelol_template_ref`, set once with `calibrate_template`, not hard-coded). Calibration parses the base into a skeleton: the variable header (with @REDACTED forced to false), every heading verbatim, the spacers between sections, and the skills format. Tailored content can only supply bullets, skills lines, the section order, which entries to leave out, and a mirrored role title. Entries keep the base order inside each section, and an entry that had bullets must be filled or left out on purpose.

**Alternatives.** Generate the whole markdown from structured fields: every heading and date would pass through the assistant, so a locked fact could change. Store the template's markdown in the repository: it would hold David's contact details and drift from what he edits in resume.lol.

**Why.** The locked facts are enforced by code, not by a prompt. The resume looks exactly like the design David built. When he changes a base resume, one calibration picks it up.
