# 0014: Resume headings come from the story library, not the base resume

**Context.** Decision 0010 kept every heading of David's base resume verbatim, so the employers, titles and dates on a built resume were whatever that base resume said. The library now holds David's checked facts (decision 0013), and a base resume can lag behind it or show an experience the library leaves out on purpose.

**Decision.** Employers, titles, dates, locations and schools on a built resume come from the story library: experiences from `experiences`, the school from the fit-read profile. The base resume supplies only the layout (CSS and page settings), the @ variable header, the section order, and how a heading is written in that template. `resolveSkeleton` (`lib/agent/resume/library-entries.ts`) writes each library experience in the format of the base entry it matches, or of the first entry in its section, in the base's date style, in reverse-chronological order. Every rebuilt heading is read back and compared with the library; a heading that still shows a base employer, title, location or any year the library did not supply is rejected before resume.lol is called. When the library has no experiences yet, the base resume's entries are used and a `resume_experiences` log line says so. The same skeleton is used by `complete_run`, the build and the entry list `get_playbook` shows.

Two facts the base used to supply now live in the library: each experience's resume section (`experiences.section`), and the school's first month and location (`agent_profile.study_start`, `agent_profile.school_location`). All three columns are additive.

`mirrored_title` stays the one exception: it changes the title shown only when David asks for it, and the record keeps the official title.

**Alternatives.** Keep the base headings and check them against the library (a base that differs would block every build until David edits it in resume.lol). Generate headings from a fixed format in code (every template would look the same, and David's designs would be lost).

**Why.** One source of truth for facts an interviewer can verify. The base resume stays a design David edits in resume.lol, and a fact fixed once in the library is right on every later resume.
