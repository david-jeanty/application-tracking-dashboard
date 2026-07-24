import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import type {
  ApplicationFormValues,
  ApplicationRecord,
} from "@/lib/applications/types";
import type {
  ApplicationCreationInput,
  ApplicationUpdateInput,
} from "@/lib/validation/application";

export function toApplicationInsert(input: ApplicationCreationInput) {
  return {
    company_name: input.companyName,
    original_job_title: input.originalJobTitle,
    normalized_job_category: input.normalizedJobCategory,
    current_status: input.currentStatus,
    work_term_season: input.workTermSeason,
    location: input.location ?? UNSPECIFIED_DATABASE_VALUE,
    work_arrangement: input.workArrangement ?? "Unknown",
    application_url: input.applicationUrl ?? null,
    application_source:
      input.applicationSource ?? UNSPECIFIED_DATABASE_VALUE,
    job_description: input.jobDescription ?? null,
    application_deadline: input.applicationDeadline ?? null,
    date_applied: input.dateApplied ?? null,
    work_term_duration: input.workTermDuration ?? null,
    salary: input.salary ?? null,
    notes: input.notes ?? null,
    next_action: input.nextAction ?? null,
    next_action_due_date: input.nextActionDueDate ?? null,
  };
}

export function toApplicationUpdate(input: ApplicationUpdateInput) {
  return toApplicationInsert(input);
}

export function displayOptionalText(
  value: string | null | undefined,
): string | null {
  if (!value || value === UNSPECIFIED_DATABASE_VALUE) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function toApplicationFormValues(
  application: ApplicationRecord,
): ApplicationFormValues {
  return {
    companyName: application.company_name,
    originalJobTitle: application.original_job_title,
    normalizedJobCategory: application.normalized_job_category,
    currentStatus: application.current_status,
    workTermSeason: application.work_term_season,
    location: displayOptionalText(application.location) ?? "",
    workArrangement: application.work_arrangement,
    applicationUrl: application.application_url ?? "",
    applicationSource: displayOptionalText(application.application_source) ?? "",
    jobDescription: application.job_description ?? "",
    applicationDeadline: application.application_deadline ?? "",
    dateApplied: application.date_applied ?? "",
    workTermDuration: application.work_term_duration ?? "",
    salary: application.salary ?? "",
    notes: application.notes ?? "",
    nextAction: application.next_action ?? "",
    nextActionDueDate: application.next_action_due_date ?? "",
  };
}
