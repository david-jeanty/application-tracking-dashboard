"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createApplication,
  updateApplication,
} from "@/lib/applications/repository";
import type { ApplicationActionState } from "@/lib/applications/state";
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
