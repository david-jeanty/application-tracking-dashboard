/**
 * Server-wide guidance handed to a connecting model at `initialize`, in the
 * MCP protocol's own `instructions` field — the one place this server can
 * influence *when* a tool is called at all, as opposed to what a tool does
 * once called. Every other file here only reacts to a tool call that has
 * already been decided on.
 *
 * This exists because of a specific, observed failure mode: a student's
 * request that needed one `list_jobs` call instead produced several tool
 * calls and a long visible wait, even though server-side processing for each
 * call was measured at well under 100ms (see `lib/mcp/telemetry.ts`). The
 * gap was in the connecting model's own orchestration — deciding to call a
 * tool for a greeting, or to re-verify a `list_jobs` result with a `get_job`
 * per row — and each such round trip costs seconds of model "thinking" time
 * that this server cannot see or control. `instructions` is the one lever
 * MCP gives a server to reduce how often that happens; it does not, and
 * cannot, make a host's own turn-taking instant.
 *
 * Kept short and imperative on purpose: this text rides along on every
 * turn of the conversation, so it competes for the same attention as
 * everything else the model is holding. Each sentence corresponds to one
 * concrete, previously-observed unnecessary call, not general advice.
 */
export const MCP_SERVER_INSTRUCTIONS = `Interndex tracks a student's own job-search applications. Call an Interndex tool only when the student is actually asking about their tracker — saving a job, listing or checking applications, or updating one. A greeting, thanks, or a question unrelated to their job search needs no tool call at all.

list_jobs already returns status, work term, location, date_applied, and deadline for every application in one call, so it answers "which ones this week" or "since June" style questions by itself — do not call get_job once per application just to check a date or a status already in that list. Call get_job only when you need the full job description, notes, or a field list_jobs does not carry, or right before quoting one of those fields back to the student.

save_job, import_jobs, and update_job already return what changed in their own result, as ready-to-show Markdown you should use as the final confirmation. Do not call get_job or list_jobs again immediately afterward just to confirm the write worked, to check for duplicates, or to display the tracker — only call list_jobs when the student explicitly asks to browse, search, or review their saved applications.

When list_jobs renders its own list to the student, keep your reply short and do not restate the applications one by one in prose — the rendered list already shows them.`;
