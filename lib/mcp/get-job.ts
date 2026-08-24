import { displayOptionalText } from "@/lib/applications/mapper";
import type { ApplicationRecord } from "@/lib/applications/types";
import type { GetJobInput, JobDetail } from "@/lib/validation/mcp";

export type GetJobOutcome =
  | { outcome: "found"; job: JobDetail }
  | { outcome: "not_found" }
  | { outcome: "error"; code?: string };

/**
 * The one repository call this tool needs, injected so the not-found and
 * not-owned paths are testable without a database. It is bound to the
 * authenticated user before it reaches here.
 */
export type GetJobDependencies = {
  readApplication: (applicationId: string) => Promise<{
    data: ApplicationRecord | null;
    error: { code?: string } | null;
  }>;
};

/**
 * Presents a stored application in the vocabulary the tools use.
 *
 * Everything a student put in comes back, including the full job description
 * and notes. What does not come back is the row's bookkeeping: `user_id` is
 * never selected in the first place, and `classification_confidence` belongs
 * to a classifier this product dropped. `created_at` and `updated_at` stay
 * because "when did I save this" and "when did this last change" are things a
 * student asks; nothing here is a version token Claude must send back, since
 * `update_job` reads the record's version itself when it writes.
 */
export function toJobDetail(application: ApplicationRecord): JobDetail {
  return {
    application_id: application.id,
    company: application.company_name,
    company_domain: application.company_domain,
    job_title: application.original_job_title,
    status: application.current_status,
    category: application.normalized_job_category,
    work_arrangement: application.work_arrangement,
    location: displayOptionalText(application.location),
    work_term: displayOptionalText(application.work_term_season),
    duration: application.work_term_duration,
    job_url: application.application_url,
    source: displayOptionalText(application.application_source),
    job_description: application.job_description,
    deadline: application.application_deadline,
    date_applied: application.date_applied,
    salary: application.salary,
    notes: application.notes,
    next_action: application.next_action,
    next_action_due_date: application.next_action_due_date,
    archived: application.archived_at !== null,
    created_at: application.created_at,
    updated_at: application.updated_at,
  };
}

/**
 * Reads one application the caller owns, in full.
 *
 * Missing and not-owned are the same outcome by design: the read is scoped to
 * the authenticated user and row-level security applies again, so another
 * student's application is indistinguishable from one that was never saved.
 * Nothing about it — not its existence, not its company — reaches the caller.
 */
export async function runGetJob(
  args: GetJobInput,
  dependencies: GetJobDependencies,
): Promise<GetJobOutcome> {
  const { data, error } = await dependencies.readApplication(
    args.application_id,
  );

  if (error) return { outcome: "error", code: error.code };
  if (!data) return { outcome: "not_found" };

  return { outcome: "found", job: toJobDetail(data) };
}
