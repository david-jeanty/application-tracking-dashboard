# STANDARDS.md: How David's resumes and outreach are written

This file is the source of truth for writing. The pipeline skill copies these rules into its instructions, and the server checkers (`check_bullets`, `check_message`) enforce every rule marked **[checked]** in code.

---

## Part 1: How to work with David (applies to every step)

The biggest failure in the past was endless back and forth: David correcting the same things over and over. Avoid it:

- **Run every check before showing anything.** David should never see a draft that breaks a rule in this file.
- **No approval gates.** The run goes from job description to built PDF and drafted outreach without stopping. David reviews only at the apply step. Never offer a menu of options; one recommended version, with one alternate available on request.
- **No explanations unless asked.** Show the output, not the reasoning.
- **When David corrects something, apply it exactly.** Do not argue, do not soften it, and do not reintroduce the corrected pattern later.
- **Never warn about conflicts.** No mentions of work authorization (David is a U.S. citizen), school semesters or terms, IBM, or other applications, anywhere in the pipeline. David knows what he's applying to.
- **Save every correction.** Call `record_edit` (before and after) for bullet changes and `add_rule` for any general instruction ("don't mention X", "always do Y"). Saved rules are loaded at the start of every run and override defaults.

### Usage rules (keep David's Claude usage low)

- **One run per posting, one chat per posting.** Returning to a posting later starts a new chat from `get_application_brief`, never from old history.
- **Check `get_run_state` first** and never redo a finished step unless David asks.
- **Reuse before writing.** Library variants first. At most 2 drafts per new bullet.
- **Short outputs.** One summary at the end of the run. No restating, no explanations unless asked.
- **Search only in the people step.** At most 4 web queries per run, snippets only, never open full pages. No research on posting details Interndex already has. Stop as soon as the shortlist is full. Run at a low effort setting.
- **Run in the Job Search project** (STANDARDS.md as cached project knowledge) with only Interndex and web search on. Turn off unrelated connectors; they add cost to every message.
- **Low effort setting** for runs; the work is step-by-step, not deep reasoning.

---

## Part 2: Resume bullets

### The house style (the Accenture Song style)

**Formula:** [Result verb] [what changed, with the number] by/through [2 to 3 concrete actions], [enabling/establishing the impact].

Rules:
- **Result first.** The opening verb is the outcome (Reduced, Eliminated, Cut, Identified, Improved, Standardized, Launched, Grew, Designed, Rescoped, Traced), not the activity. **[checked: opening verb from allowed list or flagged for review]**
- **One sentence per bullet.** No "It showed... so the Director..." narrative. Semicolons are allowed for a short trailing clause ("; still in use"). **[checked]**
- **No first person.** No I, my, me, our, we. **[checked]**
- **Concrete nouns.** Name the system, tool, scale and object: FootPrints, Power BI Premium, SQL snapshots, 130+ pages, 5M+ records. Never "various tools", "key stakeholders", "multiple projects".
- **Actions in a tight parallel list.** "assessing..., recommending..., and redesigning..."
- **Purpose ending when there is room.** "enabling leadership to track migration KPIs", "establishing clear criteria for prioritizing university partnerships".
- **One idea per bullet.** Bullets within the same role must not repeat the same story.
- **Varied openers.** No two bullets on one page start with the same verb. **[checked]**
- **Outcome and usage numbers beat effort numbers.** 100 sign-ups beats 70+ pull requests.
- **Don't name Claude as the actor** ("with Claude" as the doer reads weak). "Claude-assisted workflow" or "three-stage Claude workflow" as an object is fine.
- No em dashes, never the adverb formed from "genuine" + "ly". **[checked]**

### Filler blocklist **[checked: any hit blocks the draft]**

helped, assisted, supported (as the main verb), various, multiple (without a number), successfully, effectively, utilized, responsible for, worked on, in order to, robust, seamless, actionable, ensuring, showcasing, leveraged, a variety of, key stakeholders, cutting-edge, dynamic, passionate.

Saved rules from `add_rule` can extend this list.

### Numbers and claims

- **The latest resume is the source of truth.** Use the numbers in the most recent resumes. Do not flag differences between versions; different numbers across resumes are expected.
- **Believability check only** **[checked, warning not block]:** flag (1) a number implausible for an intern's scope in that role and company, (2) two different values for the same metric on the same page.
- **Every number carries a talking point.** Each story stores a one-line "how I'd explain this" note for interviews. Claude drafts every note itself from the resumes and the story's context. David approves them in one batch during the import (approve all, or fix one). When a tailored resume uses a new number, its drafted note appears next to that bullet in the normal review. No dictation, no separate interview.
- **Mirroring is expected.** Mirror the posting's nouns and skills in bullets and the skills section. The role title can be mirrored when David asks; the record keeps the official title alongside the mirrored one.

### Positioning playbook (make David the strongest candidate)

The goal of every tailored resume is to make David the best possible match for the posting. Tailor aggressively. The one gate: **every claim must have an explain note David can say in two sentences.** If he can explain it, it can go on the resume.

**Moves to use on every resume**
1. **Translate the work into the posting's vocabulary.** Same work, their words. IRB ticket triage becomes "program operations" for TPM, "stakeholder requirements gathering" for consulting, "data operations" for data roles.
2. **Use the widest true scope.** Lead with the biggest frame: records, sites, pages, institutions, users.
3. **Own the outcome of team wins,** with David's specific contribution in the bullet ("by recommending...", "by building...").
4. **Round confidently.** "~40%" becomes "40%"; "about 100" becomes "100".
5. **Mirror the posting's nouns, skills and, when David asks, the role title.**
6. **Promote the strongest match.** Projects (Interndex) can outrank jobs when they fit the posting better.
7. **Find the hidden match.** Before calling anything a gap, search the whole story library for adjacent proof and frame it in the requirement's terms.

**Where to stretch, and how far**

| Area | How far | Rule |
| --- | --- | --- |
| Bullet framing and vocabulary | Furthest | Reframe freely in the posting's language as long as the underlying work happened. |
| Scope and numbers | Far | Widest true frame, confident rounding, latest resume numbers. Explain note required. |
| Skills section | Far | Mirror the posting. Include tools David has used, even lightly, if he can describe one real use in two sentences. |
| Team outcomes | Moderate | Claim the result with David's specific part named. |
| Role title | Moderate | Mirror when David asks; the official title is always stored on the record. |
| Summary line (if the template has one) | Moderate | Position David as the role's ideal profile using true facts. |

**When to stretch**
- **Must-have requirements:** stretch the most. Find the closest real story and frame it directly in the requirement's words.
- **Nice-to-haves:** cover them in the skills section or a single phrase inside a bullet, not a whole bullet.
- **Requirements with no adjacent story at all:** leave them. A forced claim with no story behind it is the one that collapses in an interview.

**Locked (never changed)**
Employers, employment dates, degrees, schools, certifications, and outcomes that did not happen. These are what verification checks and what costs an offer when caught.

### Layout rules

- Reverse-chronological order within each section, always.
- Typical bullet counts: 2 to 3 per role, 2 for Interndex. The page must be fully used.
- **Templates:** zero2sudo for technical roles (PM, TPM, data, AI), Jake's for consulting and business roles.
- **Line fill [checked]:** every bullet is exactly two lines, with the last line at least 80% full. One-line bullets are allowed only under the experiences on the one-line list (`lib/agent/config/one-line-experiences.ts`: the incoming IBM role and BTA), and must fill at least 80% of their line. No widows, never three lines. The Chrome layout check decides line count; character targets, calibrated per template and stored (see SPEC-1), are a guide and the check only when Chrome cannot render. Seed values from past measurements, to be confirmed by calibration: one template fits about 108 to 110 characters per line with two-liners at 199 to 220; the wider one fits about 138 per line with two-liners at 250 to 275.

### Gold set (house style, use these as examples)

**IRB, Information Management Analyst Intern**
- Reduced the open ticket backlog by 35% and average resolution time by 25% by assessing ticketing platforms, recommending Azure DevOps over legacy tools, and redesigning service request triage.
- Reduced the open service ticket backlog by 35% and average request resolution time by 25% by assessing legacy ticketing platforms, recommending Azure DevOps as the replacement, and redesigning how incoming service requests are categorized and triaged.
- Eliminated manual weekly migration summaries by developing a Power BI Premium dashboard over 5M+ records across 50+ regional sites, with scheduled SQL snapshots enabling leadership to track migration KPIs.
- Translate stakeholder requests from a 250+ ticket monthly queue into requirements for SharePoint Online libraries, access permissions, and site architecture across an organization-wide migration.

**Fidus Systems, Marketing Analyst Intern**
- Spearheaded Fidus's AI visibility strategy, targeting Reddit (a key LLM source) by company vertical and designing a three-stage Claude workflow to triage threads, draft replies, and repurpose case studies.
- Cut tracked search and AI-answer visibility issues (SEO, GEO/AEO) by 95% through a recurring monthly audit of 130+ pages' metadata and alt text, co-developed with Fidus's SEO consultant and still in use.
- Cut tracked SEO and AI-search (GEO/AEO) issues by 95% across eight audit runs by co-developing a recurring audit with Fidus's SEO consultant that merged crawl, Search Console, and PageSpeed data for 130+ pages into one prioritized issue backlog; still in use.
- Standardized Fidus's YouTube presence by redesigning the video evaluation model with quantitative scoring and an AI-readiness framework, setting consistent title, description, and transcript standards.
- Traced repeated LinkedIn Matched Audience upload rejections to data quality issues in ~4,000 HubSpot contact records, including stray emails in the wrong fields and placeholder company names, then cleaned and re-segmented them to LinkedIn's upload schema.

**StraNexus, Business Development & Strategy Intern**
- Identified 16 strategic recruiting pipelines for StraNexus's Apprentice Consultant program by analyzing curricula at 30+ universities through a Claude-assisted research workflow, reducing evaluation time by 40%.
- Improved outreach response efficiency by 35% across 15 priority academic programs by leading cold calls and emails to university contacts and implementing a centralized partnership tracker with automated follow-ups.
- Formulated a targeting framework aligning client sector demand with program specializations across 4 core practice areas, establishing clear criteria for prioritizing university partnerships.

**Interndex, Founder & Product Lead**
- Grew Interndex to 100 student sign-ups and 20+ monthly active users by building a Chrome extension and web app that saves job postings in one click, replacing manual spreadsheet tracking.
- Launched an internship tracker now used by 20+ students to replace manual Google Sheets tracking, which required copy-pasting job descriptions and salaries and failed to retain full application details.
- Designed an MCP integration that lets users save and query applications in plain language inside Claude, eliminating manual data entry by embedding tracking in the AI tools students already use for job searches.
- Rescoped product requirements around what could ship reliably after a feasibility study showed 95% full-record AI parsing accuracy was unattainable on a free architecture, and eliminated shared AI costs by routing processing through users' own accounts.
- Dropped automated job-posting parsing after Python extraction misread test postings, moving interpretation to each user's own AI assistant through an MCP integration that improved accuracy and kept the product's AI costs at $0 per user.

**IBM Pro Bono, Pro-Bono Consultant**
- Structured the engagement by drafting the project scope and proposing that the team split into client-aligned workstreams, including Donation & CRM and Governance & People Practices, improving client scheduling and clarifying deliverable ownership across client stakeholders.
- Assessed the client's donation CRM and governance policies, identifying 20 gaps in how donor and participant data is handled.

### Negative examples (never write like this)

| Draft | What's wrong |
| --- | --- |
| Built and launched Interndex solo in 70+ pull requests: a Chrome extension, web app and Supabase backend that saves job postings in one click, replacing spreadsheet tracking for its first 20 student sign-ups. | Effort metric (pull requests) instead of growth; doesn't read as initiative. |
| Used Claude to build a research process comparing curricula across 30+ universities, cutting review time per school by ~40% and shortlisting 16 programs to prioritize for recruiting outreach. | Too plain; activity first; Claude as the actor. |
| Analyzed feedback from 15 early adopters and mapped competitors like Simplify and Huntr. Their view that it added nothing new led me to reposition it for AI-native students, making saving a job a one-line Claude request. | Two sentences, narrative, first person, weak opener. |
| Built the IT directorate's first operations dashboard in Power BI (5M+ records, 50+ sites). It showed SharePoint requests were the top category, so the Director moved staff onto the queue. | Older story voice: two sentences and "so" narrative. Convert to house style. |

---

## Part 3: Outreach messages

### Hard limits **[checked]**

- LinkedIn connection invite notes: 300 characters max. Other LinkedIn messages: 250 max.
- Count every character including punctuation. **Never cut punctuation to fit; cut words.**
- Use the space: aim for 85% to 100% of the limit with specific wording, not vague lines.
- No em dashes, never the adverb formed from "genuine" + "ly".

### Structure

- **For a role David applied to:** open with "I just applied to [exact posting title], [location]", then who he is, then why he's reaching out. Proof points come from the actual job description, not generic strengths.
- **Who he is:** spell out what the reader won't know: "University of Ottawa" (never just "uOttawa" to outsiders), the full role title, and a short plain explanation of MCP if mentioned ("an AI app that connects to Claude").
- **Recruiters:** no ask and no task. Close warmly, for example "Happy to connect!"
- **Each message stands on its own reason.** Never use one contact as a route to another.
- Prefer "passion" over "involvement" when complimenting someone's work.

### The hook (what makes a message work)

The "stood out" reason must be something the person did in their work. Drafts are written from search snippet headlines (current title and company) without waiting on David. Never use facts from an assistant's own summary text, which can be stale. The Chrome extension re-checks the live profile at send time, and any mismatch triggers a redraft. If the available info shows no real hook, use the role, partner-function or shared-school hook instead of inventing one.

**Good hooks, in order of strength:**
1. **A career move or path:** "Your move from LinkedIn to Tinder", "Your campus recruiting path from Paramount to Tinder". This has worked best for David.
2. **Their role or team as it relates to the posting:** "the posting says this role partners closely with engineering, and you lead..."
3. **Something they built, wrote or spoke about that relates to the role.**
4. **A shared school:** University of Ottawa or Telfer School of Management.
5. **Their work in early careers or campus recruiting** (for recruiters).

**Never use:** personal posts (trips, vacations, life updates), reposts, likes, work anniversaries, follower counts, generic company praise, or anything not tied to their work. If no good hook exists, use the role or shared-school hook instead of inventing one.

### Not AI-sounding **[checked: phrase blocklist]**

Blocked: "I hope this message finds you well", "I came across your profile", "pick your brain", "resonated with me", "I was fascinated", "truly", "I'm reaching out because", "I'd be thrilled", "keen to", "synergy". Short, plain, direct. Sounds like David talking.

### Patterns that worked (names removed)

- Recruiter: "Hi [Name], I just applied to Tinder's Technical Program Management Intern role in LA. I'm David, an incoming IBM intern from the University of Ottawa who built an AI app with MCP, connecting it to Claude and other tools. Your passion for early careers at Tinder stood out. Happy to connect!"
- Career-move hook: "...Your campus recruiting path from Paramount to Tinder stood out. Happy to connect!"
- Coffee chat from a career move (pattern): "Hi [Name], I'm David, a Business Technology Management student at the University of Ottawa and incoming IBM intern. Your move from [Company A] to [Company B] caught my eye, and I'd love to hear how you made that jump. Open to a 20-minute coffee chat?"
- Warm follow-up after a chat: thank them for the specific thing discussed, then one clear ask (resume skim against the job description, or interview tips), with an offer to send what they need.

### Coffee chats

- Intro is 30 to 45 seconds, ends with a question about them.
- Talking points sound conversational, never scripted or resume-like.
- Thank-you within 24 hours naming one specific thing they said.
- Referral asks come after a conversation, never in a first message, and include the job link, job ID, resume, and two or three paste-ready lines about David.
