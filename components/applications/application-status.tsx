import type { ApplicationStatus } from "@/lib/applications/constants";
import { cn } from "@/lib/utils";

/*
 * Status colour is semantic, not decorative: it never uses the chosen accent,
 * so "Rejected" reads the same in every theme.
 */
const statusClasses: Partial<Record<ApplicationStatus, string>> = {
  Interested: "border-border bg-surface-muted text-foreground",
  Preparing: "border-warning/30 bg-warning-soft text-warning",
  Applied: "border-status-applied/30 bg-status-applied-soft text-status-applied",
  Screening: "border-status-screening/30 bg-status-screening-soft text-status-screening",
  Assessment: "border-status-assessment/30 bg-status-assessment-soft text-status-assessment",
  Interview: "border-status-interview/30 bg-status-interview-soft text-status-interview",
  Offer: "border-success/30 bg-success-soft text-success",
  Accepted: "border-success/30 bg-success-soft text-success",
  Rejected: "border-danger/30 bg-danger-soft text-danger",
  Withdrawn: "border-border-strong bg-surface-muted text-foreground-secondary",
};

export function ApplicationStatusLabel({
  status,
}: {
  status: ApplicationStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusClasses[status],
      )}
    >
      <span className="sr-only">Status: </span>
      {status}
    </span>
  );
}
