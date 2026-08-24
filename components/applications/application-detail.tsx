import type { ReactNode } from "react";
import { Archive, ExternalLink } from "lucide-react";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { Card } from "@/components/ui/card";
import {
  displayOptionalText,
  safeExternalUrl,
} from "@/lib/applications/mapper";
import type { ApplicationRecord } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { formatDateTime } from "@/lib/dates/date-time";

function Value({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">{children}</dd>
    </div>
  );
}

function OptionalValue({ value }: { value: string | null | undefined }) {
  return displayOptionalText(value) ?? (
    <span className="text-foreground-muted">Not set</span>
  );
}

function DateValue({ value }: { value: string | null }) {
  return value ? (
    formatDateOnly(value)
  ) : (
    <span className="text-foreground-muted">Not set</span>
  );
}

function TextSection({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-foreground-secondary">
        {displayOptionalText(value) ?? (
          <span className="text-foreground-muted">Not set</span>
        )}
      </p>
    </Card>
  );
}

export function ApplicationDetail({
  application,
}: {
  application: ApplicationRecord;
}) {
  const externalUrl = safeExternalUrl(application.application_url);

  return (
    <div className="space-y-5">
      {application.archived_at ? (
        <div className="flex gap-2 rounded-record border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          This application is archived. It remains stored and can still be
          reviewed or edited.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-foreground">Application</h2>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <Value label="Status">
              <ApplicationStatusLabel status={application.current_status} />
            </Value>
            <Value label="Normalized category">
              {application.normalized_job_category}
            </Value>
            {application.classification_confidence ? (
              <Value label="Classification confidence">
                {application.classification_confidence}
              </Value>
            ) : null}
            <Value label="Application source">
              <OptionalValue value={application.application_source} />
            </Value>
            <Value label="Application URL">
              {externalUrl ? (
                <a
                  className="inline-flex items-center gap-1.5 break-all font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:text-accent-hover"
                  href={externalUrl}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Open job posting
                  <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                </a>
              ) : (
                <span className="text-foreground-muted">
                  {application.application_url ? "Unavailable" : "Not set"}
                </span>
              )}
            </Value>
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-foreground">Work term</h2>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <Value label="Season">{application.work_term_season}</Value>
            <Value label="Duration">
              <OptionalValue value={application.work_term_duration} />
            </Value>
            <Value label="Location">
              <OptionalValue value={application.location} />
            </Value>
            <Value label="Work arrangement">
              {application.work_arrangement === "Unknown" ? (
                <span className="text-foreground-muted">Not set</span>
              ) : (
                application.work_arrangement
              )}
            </Value>
            <Value label="Salary">
              <OptionalValue value={application.salary} />
            </Value>
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-foreground">Dates</h2>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <Value label="Date applied">
              <DateValue value={application.date_applied} />
            </Value>
            <Value label="Application deadline">
              <DateValue value={application.application_deadline} />
            </Value>
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-foreground">Next action</h2>
          <dl className="mt-4 grid gap-5 sm:grid-cols-2">
            <Value label="Action">
              <OptionalValue value={application.next_action} />
            </Value>
            <Value label="Due date">
              <DateValue value={application.next_action_due_date} />
            </Value>
          </dl>
        </Card>
      </div>

      <TextSection
        title="Job description"
        value={application.job_description}
      />
      <TextSection title="Notes" value={application.notes} />

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold text-foreground">Record details</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-3">
          <Value label="Created">{formatDateTime(application.created_at)}</Value>
          <Value label="Last updated">
            {formatDateTime(application.updated_at)}
          </Value>
          <Value label="Archive state">
            {application.archived_at
              ? `Archived ${formatDateTime(application.archived_at)}`
              : "Active"}
          </Value>
        </dl>
      </Card>
    </div>
  );
}
