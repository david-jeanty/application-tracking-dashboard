import type { ReactNode } from "react";
import { Archive, ExternalLink } from "lucide-react";
import {
  displayOptionalText,
  safeExternalUrl,
} from "@/lib/applications/mapper";
import type { ApplicationRecord } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { formatDateTime } from "@/lib/dates/date-time";

/**
 * A flat section: a heading, a rule, and its content.
 *
 * Whitespace and a hairline do the separating that a stack of bordered cards
 * used to, so the page reads as one record rather than seven unrelated panels.
 */
function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="pt-6">
      <h2 className="border-b border-border pb-2 text-base font-semibold text-foreground">
        {title}
      </h2>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function NotSet() {
  return <span className="text-foreground-muted">Not set</span>;
}

/** One label/value pair in the overview list. */
function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="text-[13px] text-foreground-muted sm:w-44 sm:shrink-0">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function OptionalValue({ value }: { value: string | null | undefined }) {
  return displayOptionalText(value) ?? <NotSet />;
}

function DateValue({ value }: { value: string | null }) {
  return value ? formatDateOnly(value) : <NotSet />;
}

function LongText({ value }: { value: string | null }) {
  const text = displayOptionalText(value);

  return text ? (
    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground-secondary">
      {text}
    </p>
  ) : (
    <p className="text-sm text-foreground-muted">Not set</p>
  );
}

export function ApplicationDetail({
  application,
}: {
  application: ApplicationRecord;
}) {
  const externalUrl = safeExternalUrl(application.application_url);

  return (
    <div>
      {application.archived_at ? (
        <div className="flex gap-2 rounded-record border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          This application is archived. It remains stored and can still be
          reviewed or edited.
        </div>
      ) : null}

      <Section title="Overview">
        <dl>
          <Row label="Location">
            <OptionalValue value={application.location} />
          </Row>
          <Row label="Work arrangement">
            {application.work_arrangement === "Unknown" ? (
              <NotSet />
            ) : (
              application.work_arrangement
            )}
          </Row>
          <Row label="Category">{application.normalized_job_category}</Row>
          <Row label="Source">
            <OptionalValue value={application.application_source} />
          </Row>
          <Row label="Date applied">
            <DateValue value={application.date_applied} />
          </Row>
          <Row label="Deadline">
            <DateValue value={application.application_deadline} />
          </Row>
          <Row label="Work term">{application.work_term_season}</Row>
          <Row label="Duration">
            <OptionalValue value={application.work_term_duration} />
          </Row>
          <Row label="Salary">
            <OptionalValue value={application.salary} />
          </Row>
          <Row label="Job posting">
            {externalUrl ? (
              <a
                className="inline-flex items-center gap-1.5 break-all font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:text-accent-hover"
                href={externalUrl}
                rel="noreferrer noopener"
                target="_blank"
              >
                Open posting
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              </a>
            ) : (
              <span className="text-foreground-muted">
                {application.application_url ? "Unavailable" : "Not set"}
              </span>
            )}
          </Row>
        </dl>
      </Section>

      <Section title="Notes">
        <LongText value={application.notes} />
      </Section>

      <Section title="Job description">
        <LongText value={application.job_description} />
      </Section>

      {/*
        Provenance rather than content: when the record was written, and how
        confident the category behind it is. Last, and quiet, because it is
        the least of what a student comes to this page for.
      */}
      <Section title="Record details">
        <dl className="text-[13px]">
          <Row label="Created">{formatDateTime(application.created_at)}</Row>
          <Row label="Last updated">
            {formatDateTime(application.updated_at)}
          </Row>
          <Row label="Archive state">
            {application.archived_at
              ? `Archived ${formatDateTime(application.archived_at)}`
              : "Active"}
          </Row>
          <Row label="Category confidence">
            <OptionalValue value={application.classification_confidence} />
          </Row>
        </dl>
      </Section>
    </div>
  );
}
