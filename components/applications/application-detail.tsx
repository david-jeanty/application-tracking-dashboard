import type { ReactNode } from "react";
import { Archive, ChevronRight, ExternalLink } from "lucide-react";
import {
  displayOptionalText,
  safeExternalUrl,
} from "@/lib/applications/mapper";
import type { ApplicationRecord } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { formatDateTime } from "@/lib/dates/date-time";

/**
 * Long-form text keeps a readable measure even though the page spans the
 * workspace. A line of prose 1,100 pixels wide is hard to track back from;
 * a field value in a two-column list is not.
 */
const PROSE_WIDTH = "max-w-[74ch]";

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

/**
 * A section that starts closed.
 *
 * Notes and a saved job description are both arbitrarily long, and neither is
 * what a student opens this page to read — they came for the status and the
 * next action. A native `<details>` keeps them one keystroke away without any
 * JavaScript, any state to persist, or any focus management to get wrong: the
 * summary is focusable and operable by keyboard because the browser makes it
 * so, and assistive technology announces the expanded state for free.
 */
function DisclosureSection({
  children,
  title,
  hint,
}: {
  children: ReactNode;
  title: string;
  /** Said on the closed summary, so an empty section need not be opened. */
  hint?: string;
}) {
  return (
    <details className="group pt-6">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 border-b border-border pb-2 [&::-webkit-details-marker]:hidden">
        {/*
          A real heading inside the summary, so these sections appear in the
          document outline alongside Overview and Record details and can be
          reached by heading navigation even while collapsed.
        */}
        <h2 className="text-base font-semibold text-foreground">
          {title}
          {hint ? (
            <span className="ml-3 text-[13px] font-normal text-foreground-muted">
              {hint}
            </span>
          ) : null}
        </h2>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 self-center text-foreground-muted transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

function NotSet() {
  return <span className="text-foreground-muted">Not set</span>;
}

/** One label/value pair in a detail list. */
function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="text-[13px] text-foreground-muted sm:w-44 sm:shrink-0">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Detail rows pair up once there is width for it, so a wide workspace does not
 * leave a column of short values beside a column of nothing.
 */
function RowList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-12 xl:grid-cols-2">{children}</dl>
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
    <p
      className={`whitespace-pre-wrap break-words text-sm leading-7 text-foreground-secondary ${PROSE_WIDTH}`}
    >
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
  const notes = displayOptionalText(application.notes);
  const jobDescription = displayOptionalText(application.job_description);

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
        <RowList>
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
        </RowList>
      </Section>

      {/*
        Notes before the job description: notes are the student's own record of
        what happened, and the description is the posting they saved.
      */}
      <DisclosureSection hint={notes ? undefined : "No notes"} title="Notes">
        <LongText value={application.notes} />
      </DisclosureSection>

      <DisclosureSection
        hint={jobDescription ? undefined : "Not saved"}
        title="Job description"
      >
        <LongText value={application.job_description} />
      </DisclosureSection>

      {/*
        Provenance rather than content: when the record was written, and how
        confident the category behind it is. Last, and quiet, because it is
        the least of what a student comes to this page for.
      */}
      <Section title="Record details">
        <RowList>
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
        </RowList>
      </Section>
    </div>
  );
}
