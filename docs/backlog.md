# Backlog

This file records ideas without silently expanding the approved phase.

## Approved later phases

- Phase 2: application CRUD, archive/permanent delete distinction, search,
  filters, status, next actions, deadlines, source and work-term data
- Phase 3: shared analytics and accessible charts
- Phase 4: persistent pipeline with keyboard status alternative
- Phase 5: MCP server (`/api/mcp`) with `create_application`,
  `get_application`, `list_applications`, `update_application`,
  `add_application_note`, authenticated with a manual API key for V1
- Phase 6: Supabase-issued OAuth 2.1 for MCP ("Connect Claude" flow) replacing
  the manual API key, plus a Settings connect/revoke UI
- Phase 7: deployment and production-readiness reviews

## Decisions to revisit with evidence

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
