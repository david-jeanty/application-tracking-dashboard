export type ApplicationActionState = {
  status: "idle" | "error" | "conflict" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialApplicationState: ApplicationActionState = {
  status: "idle",
};

/**
 * What the applications list reports after an archive or restore.
 *
 * This lives here rather than beside the actions because a `"use server"`
 * module may only export async functions.
 */
export type ArchiveOutcome = "archived" | "restored" | "error";

/**
 * What the archive page reports after a permanent deletion.
 *
 * Lives here for the same reason as `ArchiveOutcome`: a `"use server"` module
 * may only export async functions.
 */
export type DeleteOutcome = "deleted" | "error";

/**
 * What the detail page reports after a quick status or next-action update.
 *
 * Lives here for the same reason as `ArchiveOutcome`: a `"use server"` module
 * may only export async functions.
 */
export type QuickUpdateOutcome =
  | "status"
  | "next-action"
  | "next-action-cleared"
  | "error";
