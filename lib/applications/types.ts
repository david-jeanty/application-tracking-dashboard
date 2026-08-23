import type {
  ApplicationStatus,
  ClassificationConfidence,
  JobCategory,
  WorkArrangement,
} from "@/lib/applications/constants";

export type ApplicationRecord = {
  id: string;
  company_name: string;
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

export type ApplicationFormValues = {
  companyName: string;
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
