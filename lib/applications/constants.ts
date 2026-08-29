export const APPLICATION_STATUSES = [
  "Interested",
  "Preparing",
  "Applied",
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
  "Accepted",
] as const;

/**
 * The four broad status groups shown above the Applications index.
 *
 * Rejected and Withdrawn intentionally belong to no group: the strip is a
 * quick view of active progression, while All remains the truthful total.
 */
export const APPLICATION_STATUS_SUMMARIES = [
  {
    key: "saved",
    label: "Saved",
    queryValue: "summary:saved",
    statuses: ["Interested", "Preparing"],
  },
  {
    key: "applied",
    label: "Applied",
    queryValue: "summary:applied",
    statuses: ["Applied", "Screening", "Assessment"],
  },
  {
    key: "interview",
    label: "Interview",
    queryValue: "summary:interview",
    statuses: ["Interview"],
  },
  {
    key: "offer",
    label: "Offer",
    queryValue: "summary:offer",
    statuses: ["Offer", "Accepted"],
  },
] as const;

export const JOB_CATEGORIES = [
  "Marketing",
  "Marketing Operations",
  "Sales",
  "Revenue Operations",
  "Business Analysis",
  "Strategy and Operations",
  "Project Management",
  "Product Management",
  "Data and Analytics",
  "Finance",
  "Accounting",
  "Human Resources",
  "Consulting",
  "Information Technology",
  "Software Engineering",
  "Other",
] as const;

export const WORK_ARRANGEMENTS = [
  "Remote",
  "Hybrid",
  "On-site",
  "Unknown",
] as const;

export const CLASSIFICATION_CONFIDENCES = ["High", "Medium", "Low"] as const;

export const UNSPECIFIED_DATABASE_VALUE = "Not specified";

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type ApplicationStatusSummary =
  (typeof APPLICATION_STATUS_SUMMARIES)[number]["key"];
export type JobCategory = (typeof JOB_CATEGORIES)[number];
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type ClassificationConfidence =
  (typeof CLASSIFICATION_CONFIDENCES)[number];
