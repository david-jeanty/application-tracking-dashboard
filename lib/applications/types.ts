import type {
  ApplicationStatus,
  ClassificationConfidence,
  JobCategory,
  WorkArrangement,
} from "@/lib/applications/constants";

export type ApplicationRecord = {
  id: string;
  company_name: string;
  /**
   * The employer's canonical domain, for brand lookup only. Null for every
   * application saved before the field existed, and for every one whose owner
   * never supplied it. Nothing infers it.
   */
  company_domain: string | null;
  original_job_title: string;
  normalized_job_category: JobCategory;
  classification_confidence: ClassificationConfidence | null;
  location: string;
  work_arrangement: WorkArrangement;
  application_url: string | null;
  application_source: string;
  job_description: string | null;
  application_deadline: string | null;
  date_applied: string | null;
  current_status: ApplicationStatus;
  work_term_season: string;
  work_term_duration: string | null;
  salary: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/**
 * The bounded projection every list read returns.
 *
 * Deliberately excludes `job_description` and `notes`: both are long free text
 * that no list surface renders, and the MCP `list_jobs` tool must stay concise
 * enough for Claude to scan many applications at once.
 */
export type ApplicationListItem = {
  id: string;
  company_name: string;
  /**
   * Present here, in the summary, because every list surface renders the
   * company's mark beside its name — the applications list, the archive, and
   * both dashboard sections. One short nullable hostname per row is what keeps
   * those surfaces from needing a second read per application.
   */
  company_domain: string | null;
  original_job_title: string;
  normalized_job_category: JobCategory;
  current_status: ApplicationStatus;
  location: string;
  work_arrangement: WorkArrangement;
  work_term_season: string;
  date_applied: string | null;
  application_deadline: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  created_at: string;
  archived_at: string | null;
};

/**
 * One immutable status event, projected to what analytics reads.
 *
 * The initial event a database trigger writes on creation carries the status
 * the application was created with, so an application saved directly as
 * `Applied` is correctly counted as having reached it.
 */
export type ApplicationStatusEvent = {
  application_id: string;
  new_status: ApplicationStatus;
};

/**
 * One status event with the moment it happened.
 *
 * `previous_status` is null for exactly one event per application — the
 * creation event a trigger writes, guaranteed unique by a partial index. That
 * makes it a reliable marker for "this application was saved" rather than
 * "this application moved", which is what lets recent activity show one entry
 * per real moment instead of two for a creation.
 */
export type ApplicationTimelineEvent = {
  application_id: string;
  previous_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changed_at: string;
};

export type ApplicationFormValues = {
  companyName: string;
  companyDomain: string;
  originalJobTitle: string;
  normalizedJobCategory: JobCategory | "";
  currentStatus: ApplicationStatus | "";
  workTermSeason: string;
  location: string;
  workArrangement: WorkArrangement | "";
  applicationUrl: string;
  applicationSource: string;
  jobDescription: string;
  applicationDeadline: string;
  dateApplied: string;
  workTermDuration: string;
  salary: string;
  notes: string;
  nextAction: string;
  nextActionDueDate: string;
};
