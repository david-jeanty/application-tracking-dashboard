"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createApplication,
  deleteArchivedApplication,
  setApplicationArchiveState,
  setApplicationNextAction,
  setApplicationStatus,
  updateApplication,
} from "@/lib/applications/repository";
import type { QuickUpdateResult } from "@/lib/applications/repository";
import {
  CATEGORY_PARAM,
  parsePipelineFilters,
  SEARCH_PARAM,
  toPipelineUrl,
  WORK_TERM_PARAM,
} from "@/lib/applications/search-params";
import type {
  ApplicationActionState,
  ArchiveOutcome,
  PipelineMoveOutcome,
  QuickUpdateOutcome,
} from "@/lib/applications/state";
import { createClient } from "@/lib/supabase/server";
import {
  applicationCreationSchema,
  applicationIdSchema,
  applicationUpdateSchema,
  quickNextActionSchema,
  quickStatusSchema,
} from "@/lib/validation/application";

/** Where an archive or restore always returns to. Never taken from the request. */
const APPLICATIONS_PATH = "/applications";

/** The board's own path. Fixed, like every other redirect target here. */
const PIPELINE_PATH = "/pipeline";

const DASHBOARD_PATH = "/dashboard";
const ANALYTICS_PATH = "/analytics";

/**
 * Every first-party surface a whole application is read by.
 *
 * A creation adds a record to all four at once, and a full edit can change any
 * field any of them reads — status, category, work term, deadline, next
 * action, date applied. Naming the set once is what stops a page being added
 * to one write's list and forgotten in another's.
 *
 * The detail and edit routes are deliberately not here: they are per-record,
 * so their callers pass the identifier themselves.
 */
const APPLICATION_SURFACES = [
  APPLICATIONS_PATH,
  PIPELINE_PATH,
  DASHBOARD_PATH,
  ANALYTICS_PATH,
] as const;

/** Refreshes every surface that reads whole applications. */
function revalidateApplicationSurfaces() {
  for (const path of APPLICATION_SURFACES) revalidatePath(path);
}

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function invalidState(
  fieldErrors: Record<string, string[] | undefined>,
): ApplicationActionState {
  return {
    status: "error",
    message: "Review the highlighted fields and try again.",
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).filter(
        (entry): entry is [string, string[]] => Boolean(entry[1]),
      ),
    ),
  };
}

export async function createApplicationAction(
  _state: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const parsed = applicationCreationSchema.safeParse(values(formData));
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) {
    return {
      status: "error",
      message: "Your session has expired. Sign in again before saving.",
    };
  }

  const { error } = await createApplication(supabase, parsed.data);
  if (error) {
    return {
      status: "error",
      message: `The application could not be saved. Database error ${error.code ?? "unknown"}.`,
    };
  }

  // A new application is a row on the list, a card in a column of the board, a
  // possible next action or deadline on the dashboard, and a record in every
  // analytics aggregate. Nothing about it is visible on only one of them.
  revalidateApplicationSurfaces();
  return {
    status: "success",
    message: "Application added successfully.",
  };
}

export async function updateApplicationAction(
  applicationId: string,
  _state: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  const validId = applicationIdSchema.safeParse(applicationId);
  if (!validId.success) {
    return {
      status: "error",
      message: "This application is unavailable.",
    };
  }

  const parsed = applicationUpdateSchema.safeParse(values(formData));
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) {
    return {
      status: "error",
      message: "Your session has expired. Sign in again before saving.",
    };
  }

  const result = await updateApplication(
    supabase,
    user.id,
    validId.data,
    parsed.data,
  );

  if (result.outcome === "conflict") {
    return {
      status: "conflict",
      message:
        "This application changed after you opened it. Reload the page, review the latest values, and try again.",
    };
  }
  if (result.outcome === "not_found") {
    return {
      status: "error",
      message: "This application is unavailable.",
    };
  }
  if (result.outcome === "error") {
    return {
      status: "error",
      message: `The application could not be updated. Database error ${result.code ?? "unknown"}.`,
    };
  }

  // The full form can change any field these pages read — status moves the
  // card to another column, category and source change the analytics
  // groupings, a next action or deadline changes what the dashboard asks for.
  // Refreshing all four unconditionally is both simpler and safer than
  // working out which fields actually changed and which page cares.
  revalidateApplicationSurfaces();
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/applications/${applicationId}/edit`);
  redirect(`/applications/${applicationId}?updated=1`);
}

/**
 * Moves one application across the archive line.
 *
 * Both directions share this: the only difference is the timestamp written.
 * Identity comes from the authenticated server session and is passed to an
 * owner-scoped update, so no `user_id` is accepted from the form and a crafted
 * post cannot reach another student's row. A missing application and one owned
 * by somebody else produce the same result, which is what keeps the response
 * from confirming that another user's record exists.
 *
 * The redirect target is a fixed internal path, never a value from the caller.
 */
async function setArchiveState(
  formData: FormData,
  archivedAt: string | null,
): Promise<never> {
  const outcome: ArchiveOutcome = archivedAt === null ? "restored" : "archived";
  const parsedId = applicationIdSchema.safeParse(
    String(formData.get("applicationId") ?? "").trim(),
  );

  if (!parsedId.success) redirect(`${APPLICATIONS_PATH}?archive=error`);

  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) redirect("/login?next=/applications");

  const result = await setApplicationArchiveState(
    supabase,
    user.id,
    parsedId.data,
    archivedAt,
  );

  if (result.outcome !== "updated") {
    redirect(`${APPLICATIONS_PATH}?archive=error`);
  }

  // Every surface that counts or lists applications is affected: the list,
  // board and dashboard lose or regain the row, the archive page gains or
  // loses it, and the detail page's archived banner flips.
  revalidatePath(APPLICATIONS_PATH);
  revalidatePath(PIPELINE_PATH);
  revalidatePath("/archive");
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(`/applications/${parsedId.data}`);

  redirect(`${APPLICATIONS_PATH}?archive=${outcome}`);
}

/** Archives one of the caller's own applications. Status is left untouched. */
export async function archiveApplicationAction(
  formData: FormData,
): Promise<void> {
  await setArchiveState(formData, new Date().toISOString());
}

/** Restores one of the caller's own applications. Status is left untouched. */
export async function restoreApplicationAction(
  formData: FormData,
): Promise<void> {
  await setArchiveState(formData, null);
}

/** Where a permanent deletion always returns to. Never taken from the request. */
const ARCHIVE_PATH = "/archive";

/**
 * Permanently deletes one archived application the caller owns.
 *
 * Identity comes from the authenticated server session, so no `user_id` is
 * accepted from the form. The repository additionally requires the record to
 * be archived already, which is what stops a crafted post from deleting an
 * active application — the rule is enforced by the statement, not by which
 * buttons the page happened to render.
 *
 * Status history is removed by the schema's `on delete cascade`, not here.
 *
 * Every failure — missing, owned by somebody else, still active, or a database
 * error — redirects with the same code, so the response never reveals which
 * of those it was.
 */
export async function deleteApplicationAction(
  formData: FormData,
): Promise<void> {
  const parsedId = applicationIdSchema.safeParse(
    String(formData.get("applicationId") ?? "").trim(),
  );

  if (!parsedId.success) redirect(`${ARCHIVE_PATH}?delete=error`);

  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) redirect("/login?next=/archive");

  const result = await deleteArchivedApplication(
    supabase,
    user.id,
    parsedId.data,
  );

  if (result.outcome !== "deleted") redirect(`${ARCHIVE_PATH}?delete=error`);

  // The record is gone from every surface that counted it: the archive loses
  // the row, analytics loses the application and its history, and the detail
  // route no longer resolves. The active list and dashboard are unaffected,
  // because only an archived application can reach this point.
  revalidatePath(ARCHIVE_PATH);
  revalidatePath(ANALYTICS_PATH);
  revalidatePath(`/applications/${parsedId.data}`);

  redirect(`${ARCHIVE_PATH}?delete=deleted`);
}

/**
 * The tail every quick update shares: authenticate, write, revalidate, return.
 *
 * Identity comes from the authenticated server session and is handed to an
 * owner-scoped mutation, so no `user_id` is accepted from the form and a
 * crafted post cannot reach another student's row. Row-level security applies
 * again underneath.
 *
 * Every rejected case — missing, owned by somebody else, archived, or a
 * database error — redirects with the same `quick=error`, so the response
 * never reveals which it was. Both redirect targets are built from the
 * already-validated identifier, never from a value in the request.
 */
async function applyQuickUpdate(
  applicationId: string,
  outcome: QuickUpdateOutcome,
  write: (
    supabase: SupabaseClient,
    authenticatedUserId: string,
  ) => Promise<QuickUpdateResult>,
): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) {
    redirect(`/login?next=/applications/${applicationId}`);
  }

  const result = await write(supabase, user.id);
  if (result.outcome !== "updated") {
    redirect(`/applications/${applicationId}?quick=error`);
  }

  // Status and next action both show on the list and drive the dashboard's
  // follow-up view, a status change moves the card to another column of the
  // board, and the edit form must not open with a stale copy of a field the
  // student just changed here.
  revalidatePath(APPLICATIONS_PATH);
  revalidatePath(PIPELINE_PATH);
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/applications/${applicationId}/edit`);

  // Analytics only when the status moved. A status change writes a
  // status-history event, which is what every figure on that page is drawn
  // from; saving or clearing a next action writes two columns no analytics
  // read selects, so refreshing it there would be work for a page that cannot
  // have changed.
  if (outcome === "status") revalidatePath(ANALYTICS_PATH);

  redirect(`/applications/${applicationId}?quick=${outcome}`);
}

/** The application this post names, or a redirect if it named nothing valid. */
function quickUpdateTarget(formData: FormData): string {
  const parsedId = applicationIdSchema.safeParse(
    String(formData.get("applicationId") ?? "").trim(),
  );

  // Without a usable identifier there is no detail page to report back on, so
  // this falls back to the list's own failure notice.
  if (!parsedId.success) redirect(`${APPLICATIONS_PATH}?archive=error`);
  return parsedId.data;
}

/**
 * Sets the status of one of the caller's own active applications.
 *
 * Only `current_status` is written. Nothing infers `date_applied`, touches the
 * next action, archives anything, or enforces an order on the statuses — a
 * student may move backward or skip ahead, because real searches do.
 */
export async function updateApplicationStatusAction(
  formData: FormData,
): Promise<void> {
  const applicationId = quickUpdateTarget(formData);

  const parsed = quickStatusSchema.safeParse(values(formData));
  if (!parsed.success) redirect(`/applications/${applicationId}?quick=error`);

  await applyQuickUpdate(applicationId, "status", (supabase, userId) =>
    setApplicationStatus(
      supabase,
      userId,
      applicationId,
      parsed.data.currentStatus,
    ),
  );
}

/**
 * Saves the next action of one of the caller's own active applications.
 *
 * Submitting an empty action clears the follow-up, and the mutation drops any
 * due date that came with it, so the two fields cannot disagree. The reported
 * outcome distinguishes the two results rather than calling both "updated".
 */
export async function updateNextActionAction(
  formData: FormData,
): Promise<void> {
  const applicationId = quickUpdateTarget(formData);

  const parsed = quickNextActionSchema.safeParse(values(formData));
  if (!parsed.success) redirect(`/applications/${applicationId}?quick=error`);

  const outcome: QuickUpdateOutcome = parsed.data.nextAction
    ? "next-action"
    : "next-action-cleared";

  await applyQuickUpdate(applicationId, outcome, (supabase, userId) =>
    setApplicationNextAction(supabase, userId, applicationId, {
      action: parsed.data.nextAction,
      dueDate: parsed.data.nextActionDueDate,
    }),
  );
}

/**
 * Clears the next action of one of the caller's own active applications.
 *
 * Deliberately ignores whatever the fields currently hold: this is the button
 * a student presses to be rid of the follow-up, so it clears both columns
 * through the same mutation rather than round-tripping the form values.
 */
export async function clearNextActionAction(
  formData: FormData,
): Promise<void> {
  const applicationId = quickUpdateTarget(formData);

  await applyQuickUpdate(applicationId, "next-action-cleared", (supabase, userId) =>
    setApplicationNextAction(supabase, userId, applicationId),
  );
}

/**
 * The board a move came from, rebuilt from values the request carried.
 *
 * The three filter fields are read by name and put back through the board's own
 * parser, so a crafted post gets the same treatment a crafted URL does: an
 * over-long or unrecognised value is dropped, and what survives is re-encoded
 * into a fresh query string against a fixed internal path. Nothing the request
 * sent reaches the redirect as raw text.
 */
function pipelineReturnUrl(
  formData: FormData,
  notice: PipelineMoveOutcome,
): string {
  const filters = parsePipelineFilters({
    [SEARCH_PARAM]: String(formData.get(SEARCH_PARAM) ?? ""),
    [WORK_TERM_PARAM]: String(formData.get(WORK_TERM_PARAM) ?? ""),
    [CATEGORY_PARAM]: String(formData.get(CATEGORY_PARAM) ?? ""),
  });

  return toPipelineUrl(filters, notice);
}

/**
 * Moves one of the caller's own active applications to another status.
 *
 * The same single-column write the detail page's quick update performs, and
 * deliberately the same one: a move on the board is a status change, not a
 * board-specific concept, so it reuses `setApplicationStatus` rather than
 * introducing a second way for a status to change. Nothing infers
 * `date_applied`, touches the next action, archives anything, or enforces an
 * order on the statuses — a student may move an application backward from
 * Interview to Applied, because real searches do.
 *
 * What differs from the quick update is only where the student ends up: back
 * on the board, with the filters they were looking at, rather than on the
 * application's detail page.
 *
 * Identity comes from the authenticated server session and is handed to an
 * owner-scoped mutation, so no `user_id` is accepted from the form. Every
 * rejected case — missing, owned by somebody else, archived, an invalid
 * status, or a database error — returns the same `move=error`, so the response
 * never reveals which it was.
 */
export async function moveApplicationStatusAction(
  formData: FormData,
): Promise<void> {
  const parsedId = applicationIdSchema.safeParse(
    String(formData.get("applicationId") ?? "").trim(),
  );
  if (!parsedId.success) redirect(pipelineReturnUrl(formData, "error"));

  const parsed = quickStatusSchema.safeParse(values(formData));
  if (!parsed.success) redirect(pipelineReturnUrl(formData, "error"));

  const supabase = await createClient();
  const {
    data: { user },
    error: authenticationError,
  } = await supabase.auth.getUser();

  if (authenticationError || !user) redirect(`/login?next=${PIPELINE_PATH}`);

  const result = await setApplicationStatus(
    supabase,
    user.id,
    parsedId.data,
    parsed.data.currentStatus,
  );

  if (result.outcome !== "updated") {
    redirect(pipelineReturnUrl(formData, "error"));
  }

  // The card changes column here, the list and dashboard show the new status,
  // and the edit form must not open with a stale copy of it. Analytics too:
  // the database's trigger has just written a status-history event, and every
  // figure on that page — the funnel, the conversion rates, source
  // performance — is drawn from that history.
  revalidatePath(PIPELINE_PATH);
  revalidatePath(APPLICATIONS_PATH);
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(ANALYTICS_PATH);
  revalidatePath(`/applications/${parsedId.data}`);
  revalidatePath(`/applications/${parsedId.data}/edit`);

  redirect(pipelineReturnUrl(formData, "moved"));
}
