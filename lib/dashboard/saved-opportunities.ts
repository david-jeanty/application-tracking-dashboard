import type { ApplicationListItem } from "@/lib/applications/types";
import { UNSUBMITTED_STATUSES } from "@/lib/dashboard/definitions";
import { compareDateOnly } from "@/lib/dates/date-only";

/** The application fields the saved-opportunities shortlist reads. */
export type SavedOpportunityApplication = ApplicationListItem & {
  /** The calendar day `created_at` falls on in the workspace timezone. */
  savedOn: string;
};

export type SavedOpportunity = {
  applicationId: string;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
  location: string;
  workTerm: string;
  deadline: string | null;
  savedOn: string;
};

/** A dashboard shortlist, not a second Applications page. */
export const SAVED_OPPORTUNITIES_LIMIT = 4;

/**
 * Jobs that were saved but have not been submitted, in useful working order.
 *
 * The status vocabulary is the product's existing pre-submission set. Archived
 * records are outside the active worklist, and a posting whose recorded
 * deadline has passed is no longer promoted as an opportunity to apply.
 * Date-only values compare directly through the shared helper, so a deadline
 * on `today` remains eligible at every timezone boundary.
 *
 * Dated postings come first, nearest deadline first. Undated postings follow,
 * oldest save first, which is what stops an older opportunity being buried as
 * newer postings are added. `savedOn` is derived from `created_at` by the
 * dashboard loader; `updated_at` is never part of this calculation.
 */
export function savedOpportunities(
  applications: readonly SavedOpportunityApplication[],
  today: string,
  limit: number = SAVED_OPPORTUNITIES_LIMIT,
): SavedOpportunity[] {
  return applications
    .filter(
      (application) =>
        application.archived_at === null &&
        UNSUBMITTED_STATUSES.some(
          (status) => status === application.current_status,
        ) &&
        (!application.application_deadline ||
          compareDateOnly(application.application_deadline, today) >= 0),
    )
    .sort((first, second) => {
      const firstDeadline = first.application_deadline;
      const secondDeadline = second.application_deadline;

      if (firstDeadline && secondDeadline) {
        const byDeadline = compareDateOnly(firstDeadline, secondDeadline);
        if (byDeadline !== 0) return byDeadline;
      } else if (firstDeadline) {
        return -1;
      } else if (secondDeadline) {
        return 1;
      }

      const bySavedOn = compareDateOnly(first.savedOn, second.savedOn);
      if (bySavedOn !== 0) return bySavedOn;

      const byCompany = first.company_name.localeCompare(second.company_name);
      if (byCompany !== 0) return byCompany;

      return first.id.localeCompare(second.id);
    })
    .slice(0, limit)
    .map((application) => ({
      applicationId: application.id,
      companyName: application.company_name,
      companyDomain: application.company_domain,
      jobTitle: application.original_job_title,
      location: application.location,
      workTerm: application.work_term_season,
      deadline: application.application_deadline,
      savedOn: application.savedOn,
    }));
}
