"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createApplication,
  setApplicationArchiveState,
  updateApplication,
} from "@/lib/applications/repository";
import type {
  ApplicationActionState,
  ArchiveOutcome,
} from "@/lib/applications/state";
import { createClient } from "@/lib/supabase/server";
import {
  applicationCreationSchema,
  applicationIdSchema,
  applicationUpdateSchema,
} from "@/lib/validation/application";

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

  revalidatePath("/applications");
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

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/applications/${applicationId}/edit`);
  redirect(`/applications/${applicationId}?updated=1`);
}

/** Where an archive or restore always returns to. Never taken from the request. */
const APPLICATIONS_PATH = "/applications";

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

  // Every surface that counts or lists applications is affected: the list and
  // dashboard lose or regain the row, the archive page gains or loses it, and
  // the detail page's archived banner flips.
  revalidatePath(APPLICATIONS_PATH);
  revalidatePath("/archive");
  revalidatePath("/dashboard");
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
