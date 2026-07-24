import type {
  ApplicationStatus,
  JobCategory,
  WorkArrangement,
} from "@/lib/applications/constants";

export type ApplicationListItem = {
  id: string;
  company_name: string;
  original_job_title: string;
  normalized_job_category: JobCategory;
  current_status: ApplicationStatus;
  location: string;
  work_arrangement: WorkArrangement;
  date_applied: string | null;
  application_deadline: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  created_at: string;
};
