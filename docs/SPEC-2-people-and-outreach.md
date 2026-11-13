# SPEC 2: People Finder, Outreach and Coffee Chats

## Goal

Inside the same run as Spec 1, before David applies, the agent finds the right people for the posting, ranks them, drafts checked messages, and fills the Outreach queue. Afterwards Interndex tracks every contact, message and coffee chat. Requires Spec 1. All features gated to `OWNER_USER_ID`.

## The flow (continues the Spec 1 run)

1. After the resume is built, the assistant loads `get_playbook("run")` people steps.
2. **Discovery by X-ray search:** run the queries from `generate_xray_queries` (at most 4, one batch) with the assistant's web search, snippets only, no page fetches. Keep only candidates whose snippet headline names the company as their current employer.
3. Server ranks candidates into a shortlist of 8 to 10.
4. Drafts for every shortlisted person, checked by `check_message`, saved to the Outreach queue.
5. The run ends with Spec 1's summary. David applies, then sends from the queue whenever he likes.

## Search categories

From the application: company and aliases (parent company where known), exact posting title, team or product keywords, posting city, partner functions.

1. **Recruiters:** university, campus, early careers, talent acquisition at the company.
2. **Team:** people with the posting's title or team keywords, in the posting's city, plus one level up (Senior, Manager, Director of that function).
3. **Cross-functional partners in the posting's city:** the partner functions named in the JD, or defaults by role type:
   - TPM: Engineering Manager, Software Engineer, Product Manager, Data Scientist
   - PM: Software Engineer, Product Designer, Data Scientist, Product Marketing Manager
   - Strategy and BizOps: Finance, Sales Operations, Product Manager
   - Marketing and growth: Product Marketing, Sales, Designer, Content
4. **Alumni:** University of Ottawa or Telfer School of Management, any role at the company.
5. **Past interns** of the same program or function.

`generate_xray_queries(application_id)` builds the fallback queries for the same categories (deterministic, unit tested), with at most 4 marked `auto` and the rest returned as Google links.

## Data model (new tables, RLS by user)

- `companies`: id, user_id, name, aliases[], notes
- `contacts`: id, user_id, company_id, name, current_title, location, linkedin_url, school (nullable), headline, work_highlights (json: roles and moves from the snippet), mutual_connections (int, nullable, filled by the extension when available), contact_type (`recruiter`, `team`, `cross_functional`, `alumni`, `past_intern`, `other`), source (`xray`, `extension`, `import`, `manual`), verified_at
- `application_contacts`: application_id, contact_id, reason, rank_score, stage (`candidate`, `drafted`, `messaged`, `connected`, `chat_booked`, `chat_done`, `thanked`, `referral_asked`, `referred`, `closed`), stage_updated_at
- `search_runs`: id, application_id, company_id, method (`xray`), created_at
- `messages`: id, contact_id, application_id, channel (`linkedin_invite`, `linkedin_message`, `email`), text, char_count, status (`draft`, `sent`), sent_at, reply_received
- `coffee_chats`: id, contact_id, application_id (nullable), scheduled_at, prep, notes, thank_you_message_id, referral_message_id

Dedupe contacts on linkedin_url. A contact can link to many applications.

## Tools

- `save_candidates(application_id, method, candidates[])`: rejects beyond the per-run cap.
- `rank_candidates(search_run_id)`: deterministic, unit tested.
- `check_message(channel, contact_type, text)`: enforces STANDARDS.md Part 3 in code.
- `save_message`, `mark_sent`, `mark_reply`, `update_stage`
- `list_contacts`, `get_contact`, `get_company(company_id)`
- `get_followups()`: contacts `messaged` 7+ days with no reply, and `chat_done` without a thank-you.
- `save_coffee_chat`, `prep_coffee_chat`, `save_chat_notes`

## Ranking

Weights, highest first: alumni, team match, cross-functional partner in the posting's city, past intern, recruiter. **Mutual connections add a strong boost when known** (captured by the extension; not available from search). Penalties: seniority far above (VP and up) for cold chats. Excluded: snippet shows the person left the company or a 'former' title. Already contacted for another application: flagged, not hidden. Category caps keep the list mixed (for example at most 3 cross-functional, at most 2 recruiters). Each row: name, title, category, one-line reason, profile link.

## Outreach drafting

- Playbooks by contact type and hook rules from STANDARDS.md Part 3. Career moves first, from snippet headline and experience data. Never personal posts.
- A Telfer professor or anyone outside the company is drafted on their own terms (their work), never framed as a route to someone else.
- One recommended draft per person in the queue, with one alternate on tap.

## Outreach queue (web app, phone-friendly)

Each row: person, reason, draft with Copy button, profile link, and a Sent button.

Candidates, contacts and drafts are saved through Spec 1's single `complete_run` call, not one write per person, to keep confirmation prompts to a minimum.

## Chrome extension: automatic sent tracking

When David opens a queued contact's LinkedIn profile, the extension:
- compares the visible title and company with the record and shows "Matches" or "Changed: [what]" (mismatch flags the row for a redraft);
- marks the message sent automatically when David clicks LinkedIn's Send or Connect button on that profile, matching the queued draft.

It reads only the page David is viewing. No background collection, bulk capture or automated page visits. Reply tracking is out of scope.

## Follow-ups that ride along

Each new run calls `get_followups()` and ends its summary with one line ("3 people haven't replied in 7+ days, follow-ups drafted") plus the checked drafts. One follow-up per contact, ever.

## Coffee chats

- **Prep** (`prep_coffee_chat`): 30 to 45 second intro ending with a question about them, conversational questions about their path and the team, the resume sent for that application.
- **Debrief** (phase `debrief`): David says "just finished my chat with [name]". The assistant asks at most three questions (what you talked about, anything you promised, whether a referral came up), saves notes, updates the stage, drafts the thank-you, and a referral ask with job link, job ID and paste-ready lines when it fits. Must work by voice from the phone.

## Web app views

- **Contacts:** filter by company, type, stage.
- **Companies:** per company, applications, contacts, alumni, chats held, next step.
- Contacts panel on each application.

## Usage guardrails (server-enforced)

- Candidate cap per run; only snippet data saved.
- Company-level cache: a search run for the same company in the last 30 days is reused and re-ranked unless David asks for a fresh search.
- Counts toward the run ledger and `usage_log` from Spec 1.

## Test plan (on a preview)

1. Measure the people step: at most 4 web queries, no page fetches, under 60 seconds at a low effort setting.
2. Run on a past application where David did outreach by hand (Tinder TPM). It should find his people plus useful ones he missed.
3. Compare drafts to messages he sent and liked.
4. Confirm saved titles come from search snippet headlines, not the assistant's own summary text, and that former employees are excluded.
5. Extension: open a queued profile, click Send, confirm the message is marked sent.
Record results in `docs/BUILD-LOG.md`.

## Acceptance criteria

- The run from Spec 1 ends with a ranked, mixed shortlist and checked drafts in the queue, with no input from David mid-run.
- Every draft passes `check_message`.
- Sent messages are marked automatically through the extension or with one tap.
- Follow-ups appear at the end of each new run.
- Coffee chat debriefs work from the phone.
- Other Interndex users see no change. Unit tests pass for query building, ranking and the message checker.

## Out of scope

Auto-sending messages, reply tracking, inbox and calendar sync.
