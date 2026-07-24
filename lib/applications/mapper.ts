import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import type { ApplicationCreationInput } from "@/lib/validation/application";

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
