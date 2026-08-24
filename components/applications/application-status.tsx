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

/**
 * The quiet form, coloured only where the colour means something.
 *
 * The stages an application passes through on the way — applied, screening,
 * interview — are progress, and the rail beside them already shows progress.
 * Colouring those too would turn a list of thirty applications into a rainbow
 * and leave nothing for the outcomes to stand out against. So only the
 * statuses that carry a verdict take a semantic colour, and they take the same
 * one in every theme.
 */
const statusTextClasses: Partial<Record<ApplicationStatus, string>> = {
  Interested: "text-foreground-secondary",
  Preparing: "text-warning",
  Applied: "text-foreground-secondary",
  Screening: "text-foreground-secondary",
  Assessment: "text-foreground-secondary",
  Interview: "text-foreground-secondary",
  Offer: "text-success",
  Accepted: "text-success",
  Rejected: "text-danger",
  Withdrawn: "text-foreground-muted",
};

/**
 * One application's exact status.
 *
 * `chip` is the prominent form, used where the status is a headline — the
 * detail hero. `text` is the quiet form for a dense list, where a row of
 * pills would fight the company names for attention. Both carry the same
 * semantic colour, so a rejection is recognisable either way.
 */
/**
 * The quiet detail-page presentation: a semantic dot and the status in words.
 *
 * A filled pill would compete with the employer's mark for the loudest thing
 * in the hero, and the status is already the one fact the lifecycle beneath it
 * is summarising.
 */
export function ApplicationStatusDot({ status }: { status: ApplicationStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[14px]", statusTextClasses[status])}>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full bg-current"
      />
      <span className="sr-only">Status: </span>
      {status}
    </span>
  );
}

export function ApplicationStatusLabel({
  status,
  variant = "chip",
}: {
  status: ApplicationStatus;
  variant?: "chip" | "text";
}) {
  if (variant === "text") {
    return (
      <span className={cn("text-[13px]", statusTextClasses[status])}>
        <span className="sr-only">Status: </span>
        {status}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs",
        statusClasses[status],
      )}
    >
      <span className="sr-only">Status: </span>
      {status}
    </span>
  );
}
