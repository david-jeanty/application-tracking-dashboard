/**
 * What a connected client can and cannot do with a student's tracker.
 *
 * The consent screen and the settings page both describe this, and they must
 * never disagree: one is the promise made while granting access, the other is
 * what the student reads afterwards to decide whether to keep it. Keeping the
 * wording in one place is why this file exists — it is a list of strings, not
 * an abstraction over them.
 *
 * These describe the tools actually registered in `lib/mcp/tools.ts`. If a tool
 * is ever added or removed, this list changes with it.
 *
 * The list is also what the consent screen shows the JobTrack Capture browser
 * extension, and that is accurate rather than convenient: an OAuth grant issues
 * an ordinary Supabase user token, and Supabase scopes affect what is inside an
 * identity token, not what the database will accept. Any authorized client
 * therefore holds this same authority whether or not it exercises all of it.
 * Narrowing that for the extension is a real piece of work — client-id-aware
 * policies — and `docs/browser-capture.md` records it as the open
 * least-privilege question rather than implying it is already solved.
 */

/**
 * Derived from the registered tools: list_jobs, get_job, save_job, import_jobs,
 * update_job.
 */
export const ASSISTANT_CAN = [
  "See the job applications in your tracker",
  "Add a new application",
  "Add several at once, such as a tracker you already keep elsewhere",
  "Update an application's details, dates, and status",
] as const;

/** Deliberately absent from the tool surface, and worth saying plainly. */
export const ASSISTANT_CANNOT = [
  "Delete an application",
  "Archive an application",
] as const;

/** The guarantee that matters most to a student granting access. */
export const ASSISTANT_OWNERSHIP_NOTE =
  "It can only ever see your own applications, never another student's.";
