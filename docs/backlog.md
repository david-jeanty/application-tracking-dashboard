# Backlog

This file records ideas without silently expanding the approved phase.

## Approved later phases

- Phase 2: application CRUD, archive/permanent delete distinction, search,
  filters, status, next actions, deadlines, source and work-term data
- Phase 3: shared analytics and accessible charts
- Phase 4: persistent pipeline with keyboard status alternative (built; the
  status menu is the only way to move a card, not a fallback behind a drag —
  see the implementation log for why no drag-and-drop dependency was added)
- Phase 5: MCP server (`/api/mcp`) with `create_application`,
  `get_application`, `list_applications`, `update_application`,
  `add_application_note`, authenticated with a manual API key for V1
- Phase 6: Supabase-issued OAuth 2.1 for MCP ("Connect Claude" flow) replacing
  the manual API key, plus a Settings connect/revoke UI
- Phase 7: deployment and production-readiness reviews

## Decisions to revisit with evidence

- **Stage-to-stage conversion on the analytics funnel.** Every share on the page
  is out of applications ever submitted, and that is deliberate: it is one
  denominator a reader can hold in their head, and it is the definition the
  metrics module already shares with the dashboard. "Of the applications that
  got a response, how many interviewed" is a different and plausibly useful
  question, but it needs its own labels and its own explanation of which
  denominator each row uses — adding it silently behind the existing labels
  would make two different metrics look like one. Phase 3B deliberately did not
  build it.
- Structured salary fields (currency, amount/range, pay period) if salary
  analytics becomes a real requirement
- Profile IANA timezone for consistent multi-device date presentation
- Trigram search index only after query measurements justify it
- Third-party error monitoring after a privacy and maintenance review
- `delete_application` MCP tool, once the read/update tools are proven
- Whether the reduced status set from early MCP drafts (interested, preparing,
  applied, interview, offer, rejected, withdrawn) should ever replace the
  existing 10-value `application_status` enum — no; MCP tools accept the
  full existing enum so the web UI and Claude never disagree on state

## Out of MVP scope

A hand-built deterministic JD/title classifier (Claude does this
conversationally instead), resume tailoring or cover-letter generation, an
in-app chatbot, arbitrary job-board scraping, automatic job discovery, browser
extensions, job recommendations, collaboration/social features, inbox/calendar
synchronization, notifications, billing, native apps, employer/university
accounts, and public profiles.

## Post-MVP capture pivot (added 2026-08-25)

The line above records the original MVP boundary and is intentionally retained.
Since then, the tracker, dashboard, pipeline, analytics, and MCP AI connection
have shipped. The remaining manual transfer from a posting into JobTrack is a
significant source of duplicate work, so one narrow browser feature is now
approved: an extension that saves the posting the student is currently viewing
after an explicit user action.

The approved work is capture only. Arbitrary or background scraping, autofill,
auto-apply, submission detection, built-in AI, job classification, resume
matching, recommendations, and automatic job discovery remain out of scope.
See [`browser-capture.md`](browser-capture.md) for the server foundation,
extension responsibilities, release review, and deferred work.
