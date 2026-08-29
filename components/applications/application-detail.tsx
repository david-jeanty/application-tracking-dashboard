import type { ComponentType, ReactNode } from "react";
import { CompanyLogo } from "@/components/branding/company-logo";
import {
  Archive,
  Banknote,
  CalendarDays,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Monitor,
  Tag,
} from "lucide-react";
import {
  displayOptionalText,
  safeExternalUrl,
} from "@/lib/applications/mapper";
import { ButtonLink } from "@/components/ui/button";
import type { ApplicationRecord } from "@/lib/applications/types";
import { formatDateOnly } from "@/lib/dates/date-only";
import { formatDateTime } from "@/lib/dates/date-time";

/**
 * Long-form text keeps a readable measure even though the page spans the
 * workspace. A line of prose 1,100 pixels wide is hard to track back from;
 * a field value in a two-column list is not.
 */
const PROSE_WIDTH = "max-w-[72ch]";

const headingClassName =
  "border-b border-border pb-2 text-[17px] font-medium text-foreground";

function NotSet() {
  return <span className="text-foreground-muted">Not set</span>;
}

/**
 * One field of the record.
 *
 * The icon is there to make a long list scannable at a glance, so it is thin,
 * neutral and never boxed — the values are what the eye should land on.
 */
function Row({
  children,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="flex items-center gap-2 text-[13px] text-foreground-muted">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
        {label}
      </dt>
      <dd className="min-w-0 break-words text-[14px] text-foreground">
        {children}
      </dd>
    </div>
  );
}

function OptionalValue({ value }: { value: string | null | undefined }) {
  return displayOptionalText(value) ?? <NotSet />;
}

function DateValue({ value }: { value: string | null }) {
  return value ? formatDateOnly(value) : <NotSet />;
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
  invitation,
}: {
  children: ReactNode;
  title: string;
  /** What is behind the summary, said plainly rather than as a chevron alone. */
  invitation: string;
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {/*
          A real heading inside the summary, so these sections appear in the
          document outline alongside the rest and can be reached by heading
          navigation even while collapsed.
        */}
        <h2 className={headingClassName}>{title}</h2>
        <span className="flex items-center justify-between gap-4 pt-3 text-[14px] text-foreground-secondary group-hover:text-foreground">
          {invitation}
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-foreground-muted transition-transform group-open:rotate-90"
            strokeWidth={1.5}
          />
        </span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

function LongText({ value }: { value: string | null }) {
  const text = displayOptionalText(value);

  return text ? (
    <p
      className={`whitespace-pre-wrap break-words text-[14px] leading-7 text-foreground-secondary ${PROSE_WIDTH}`}
    >
      {text}
    </p>
  ) : (
    <p className="text-[14px] text-foreground-muted">Not set</p>
  );
}

/**
 * The employer, the role, and the two or three facts that place it.
 *
 * The employer leads on this page, where there is one record and the question
 * is which company it is — the reverse of the list, where the role leads
 * because the student is choosing between many.
 *
 * Extracted so the authenticated record and the public demo's record are the
 * same hero rather than two that have to be kept in step. It renders identity
 * only: whatever actions belong beside it are the page's to place, which is
 * what lets the demo show a record with no write controls without this
 * component knowing the demo exists.
 */
export function ApplicationIdentity({
  application,
}: {
  application: ApplicationRecord;
}) {
  const location = displayOptionalText(application.location);
  const context = [location, application.work_term_season]
    .concat(
      application.work_arrangement === "Unknown"
        ? []
        : [application.work_arrangement],
    )
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 items-start gap-5">
      <CompanyLogo
        companyName={application.company_name}
        domain={application.company_domain}
        size="lg"
      />
      <div className="min-w-0">
        <h1 className="min-w-0">
          <span className="block text-[30px] font-medium leading-tight tracking-tight text-foreground">
            {application.company_name}
          </span>{" "}
          <span className="mt-1 block break-words text-[19px] leading-snug text-foreground-secondary">
            {application.original_job_title}
          </span>
        </h1>
        {context ? (
          <p className="mt-3 text-[13px] text-foreground-muted">{context}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The link out to the posting the record came from, beside the record's own
 * actions.
 *
 * It is also a row in the Application list below, and that repetition is the
 * point rather than an oversight. The row is the stored field — it says whether
 * a URL is set, and shows "Not set" when one is not. This is the action a
 * student reaches for while reviewing an application, and it was previously
 * only reachable by reading down a list of fourteen fields to a link labelled
 * "Open posting". Testing found people concluding the link did not exist.
 *
 * It renders nothing at all unless a safe external URL exists, so a record with
 * no posting shows no dead control — the "Not set" answer stays in the field
 * list, where a missing value belongs.
 */
export function ApplicationOriginalPosting({
  application,
}: {
  application: ApplicationRecord;
}) {
  const externalUrl = safeExternalUrl(application.application_url);
  if (!externalUrl) return null;

  return (
    <ButtonLink
      href={externalUrl}
      rel="noreferrer noopener"
      target="_blank"
      variant="secondary"
    >
      View original posting
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
    </ButtonLink>
  );
}

/**
 * Provenance: when the record was written, and how confident the category
 * behind it is. Quiet, and last, because it is the least of what a student
 * comes to this page for.
 */
export function ApplicationRecordMeta({
  application,
}: {
  application: ApplicationRecord;
}) {
  return (
    <section aria-labelledby="record-heading" className="pt-10">
      <h2 className={headingClassName} id="record-heading">
        Record
      </h2>
      <dl className="pt-3">
        <Row icon={Clock} label="Created">
          {formatDateTime(application.created_at)}
        </Row>
        <Row icon={Clock} label="Updated">
          {formatDateTime(application.updated_at)}
        </Row>
        <Row icon={Archive} label="Archive state">
          {application.archived_at
            ? `Archived ${formatDateTime(application.archived_at)}`
            : "Active"}
        </Row>
        <Row icon={Tag} label="Category confidence">
          <OptionalValue value={application.classification_confidence} />
        </Row>
      </dl>
    </section>
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
    <div className="space-y-10">
      {application.archived_at ? (
        <div className="flex gap-2 border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          This application is archived. It remains stored and can still be
          reviewed or edited.
        </div>
      ) : null}

      <section aria-labelledby="application-heading">
        <h2 className={headingClassName} id="application-heading">
          Application
        </h2>
        <dl className="grid gap-x-8 pt-3 lg:grid-cols-2">
          <Row icon={MapPin} label="Location">
            <OptionalValue value={application.location} />
          </Row>
          <Row icon={CalendarDays} label="Work term">
            {application.work_term_season}
          </Row>
          <Row icon={Tag} label="Category">
            {application.normalized_job_category}
          </Row>
          <Row icon={Globe} label="Source">
            <OptionalValue value={application.application_source} />
          </Row>
          <Row icon={CalendarDays} label="Date applied">
            <DateValue value={application.date_applied} />
          </Row>
          <Row icon={CalendarDays} label="Application deadline">
            <DateValue value={application.application_deadline} />
          </Row>
          <Row icon={Monitor} label="Work arrangement">
            {application.work_arrangement === "Unknown" ? (
              <NotSet />
            ) : (
              application.work_arrangement
            )}
          </Row>
          <Row icon={Clock} label="Duration">
            <OptionalValue value={application.work_term_duration} />
          </Row>
          <Row icon={Banknote} label="Salary">
            <OptionalValue value={application.salary} />
          </Row>
          {/*
            Kept, deliberately, alongside the promoted action above. This is
            the stored field: it reports what the record holds, including that
            it holds nothing.
          */}
          <Row icon={ExternalLink} label="Job posting">
            {externalUrl ? (
              <a
                className="inline-flex items-center gap-1.5 break-all text-accent underline decoration-accent/40 underline-offset-4 hover:text-accent-hover"
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
      </section>

      {/*
        Notes before the job description: notes are the student's own record of
        what happened, and the description is the posting they saved.
      */}
      <DisclosureSection
        invitation={notes ? "View notes" : "No notes"}
        title="Notes"
      >
        <LongText value={application.notes} />
      </DisclosureSection>

      <DisclosureSection
        invitation={jobDescription ? "View saved posting" : "No saved posting"}
        title="Job description"
      >
        <LongText value={application.job_description} />
      </DisclosureSection>
    </div>
  );
}
