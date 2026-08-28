/**
 * What a connected AI assistant can and cannot do with a student's tracker.
 *
 * The AI-assistant part of Settings describes this. OAuth consent is
 * deliberately client-neutral because JobTrack now has more than one kind of
 * client and Supabase's grant metadata does not expose a reliable client type.
 *
 * These describe the tools actually registered in `lib/mcp/tools.ts`. If a tool
 * is ever added or removed, this list changes with it.
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
