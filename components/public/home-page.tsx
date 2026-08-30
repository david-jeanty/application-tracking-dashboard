import Link from "next/link";
import { ApplicationRecords } from "@/components/applications/application-list";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { ButtonLink } from "@/components/ui/button";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { DEMO_BASE_PATH } from "@/lib/demo/paths";
import { demoToday } from "@/lib/demo/today";

/**
 * The statuses the preview shows, in the order it shows them.
 *
 * One record from each of four different stages rather than the first four in
 * the list. The point of the preview is the record anatomy — the employer's
 * mark, the role over the company, the lifecycle rail and what comes next — and
 * four applications that had all barely started would draw the same rail four
 * times and prove none of it.
 */
const PREVIEW_STATUSES = ["Offer", "Interview", "Applied", "Interested"] as const;

/**
 * One step of the Save → Track → Act sequence.
 *
 * The rail is the same idea as the lifecycle rail on a record above it — a
 * numbered node with a connector running to the next one — so the sequence
 * reads as one system rather than three separate write-ups. It runs down the
 * left edge on a phone and along the top on a wider screen, and the fact line
 * underneath each step names the same fields and stages a real record shows.
 */
function WorkflowStep({
  body,
  fact,
  factLabel,
  isLast = false,
  number,
  title,
}: {
  body: React.ReactNode;
  fact: React.ReactNode;
  factLabel: string;
  isLast?: boolean;
  number: number;
  title: string;
}) {
  return (
    <li className="flex gap-4 sm:flex-1 sm:flex-col sm:gap-0">
      <div className="flex flex-col items-center self-stretch sm:w-full sm:flex-row">
        <span
          aria-hidden="true"
          className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium text-accent-foreground"
        >
          {number}
        </span>
        {isLast ? null : (
          <span
            aria-hidden="true"
            className="my-1 w-px flex-1 bg-rail-track sm:my-0 sm:ml-3 sm:h-px sm:w-auto"
          />
        )}
      </div>

      <div className="pb-8 sm:flex-1 sm:pb-0 sm:pr-8 sm:pt-4 sm:last:pr-0">
        <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
        <p className="mt-2 text-[14px] leading-6 text-foreground-secondary">
          {body}
        </p>
        <dl className="mt-4 text-[12px] leading-5">
          <dt className="text-foreground-muted">{factLabel}</dt>
          <dd className="mt-1 font-medium text-foreground">{fact}</dd>
        </dl>
      </div>
    </li>
  );
}

const workflowLinkClassName =
  "rounded-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * A handful of a real record's fields, for the assistant section.
 *
 * Not an invented example — the same application the hero preview shows
 * first, restated as the plain fields Interndex actually keeps for it. The
 * point beside "your assistant is optional" is that the record underneath is
 * concrete and structured whether or not one is connected.
 */
function RecordField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[13px] font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * The public front door.
 *
 * Its job is to let somebody understand Interndex and then look at it, in that
 * order, without an account. So the demo is the loudest thing on the page —
 * the header button, the hero's primary action, the record beside it and the
 * one call to action at the foot — and creating an account is the quieter
 * option beside it every time.
 *
 * It reads no request, no cookie and no database. Everything below is either
 * static text or the demo fixture, which is why this page renders whether or
 * not the application is configured at all.
 */
export function HomePage() {
  // The real demo records, through the real list component. A screenshot would
  // be out of date the first time the interface changed; this cannot be.
  const demo = buildDemoDataset(demoToday());
  const preview = PREVIEW_STATUSES.map((status) =>
    demo.activeApplications.find(
      (application) =>
        application.current_status === status && application.company_domain,
    ),
  ).filter((application) => application !== undefined);
  // The same application the hero leads with, restated as fields further
  // down the page — one real record, referenced twice rather than invented.
  const recordSample = preview[0];

  return (
    <div className="min-h-screen bg-background">
      <a
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-foreground focus:translate-y-0"
        href="#main-content"
      >
        Skip to main content
      </a>

      <PublicHeader />

      <main id="main-content">
        {/* ------------------------------------------------------------ hero */}
        {/*
          The reason to look, then the reason to look now: what to do next
          leads, so a visitor on a phone reaches Try the demo and "No account
          required" without scrolling past a page of copy first. The record
          beside it is not a mockup — it is the same list component the
          product itself renders, holding four demo rows across four stages.
        */}
        <section className="border-b border-border bg-brand-soft">
          <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14 lg:grid lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:items-start lg:gap-14 lg:py-20">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
                Internship and co-op applications
              </p>
              <h1 className="mt-4 max-w-[20ch] text-[28px] font-medium leading-[1.15] tracking-tight text-foreground sm:mt-5 sm:text-[36px] sm:leading-[1.13] lg:text-[42px]">
                Find the role. Give it one place. Always know what&rsquo;s
                next.
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-7 text-foreground-secondary sm:text-[16px] sm:leading-8">
                Interndex holds the deadline, the status, and the next action
                for every application you&rsquo;re running — and the history
                of how each one actually went.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
                <ButtonLink className="min-h-11 px-5 text-[15px]" href="/demo">
                  Try the demo
                </ButtonLink>
                <ButtonLink
                  className="min-h-11 px-5 text-[15px]"
                  href="/signup"
                  variant="secondary"
                >
                  Create account
                </ButtonLink>
              </div>
              <p className="mt-3 text-[13px] leading-6 text-foreground-muted">
                No account required.{" "}
                <Link className={workflowLinkClassName} href="/login">
                  Already have an account? Sign in
                </Link>
              </p>
            </div>

            <div className="mt-10 lg:mt-0">
              {/*
                A real heading, not a caption: each record below is an `h3`,
                and without an `h2` here the page would skip a level the
                moment the preview rendered.
              */}
              <h2 className="text-[13px] font-normal text-foreground-muted">
                Your applications, as Interndex keeps them
              </h2>
              {/*
                The production list component, given four records out of the
                demo workspace. Not a picture of the product — the product.
              */}
              <div className="mt-4">
                <ApplicationRecords
                  applications={preview}
                  basePath={DEMO_BASE_PATH}
                  history={demo.statusEvents}
                  showSummary={false}
                />
              </div>
              <p className="mt-4 text-[12px] leading-6 text-foreground-muted">
                Sample applications from the demo workspace. They are
                fictional and shown for demonstration only; the employers
                named have no connection to Interndex.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- save, track, act */}
        <section aria-labelledby="workflow-heading" className="bg-background">
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20">
            <h2
              className="max-w-2xl text-[26px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px]"
              id="workflow-heading"
            >
              One workspace, from first application to offer.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-foreground-secondary">
              Save a role, track where it stands, and act on what it needs
              next — the same record, followed across four connected views.
            </p>

            <ol className="mt-10 flex flex-col sm:flex-row">
              <WorkflowStep
                body={
                  <>
                    Capture the role once — title, employer, deadline — and it
                    becomes a record in{" "}
                    <Link
                      className={workflowLinkClassName}
                      href="/demo/applications"
                    >
                      Applications
                    </Link>
                    .
                  </>
                }
                fact="Title · Employer · Deadline"
                factLabel="Every record starts with"
                number={1}
                title="Save"
              />
              <WorkflowStep
                body={
                  <>
                    See exactly where it stands on the{" "}
                    <Link className={workflowLinkClassName} href="/demo/pipeline">
                      Pipeline
                    </Link>{" "}
                    board, and what needs attention today on the{" "}
                    <Link className={workflowLinkClassName} href="/demo">
                      Dashboard
                    </Link>
                    .
                  </>
                }
                fact="Saved → Applied → Interview → Outcome"
                factLabel="Every record moves through"
                number={2}
                title="Track"
              />
              <WorkflowStep
                body={
                  <>
                    Do the next thing you set for yourself, then keep the
                    history.{" "}
                    <Link className={workflowLinkClassName} href="/demo/analytics">
                      Analytics
                    </Link>{" "}
                    turns it into a picture of how the search is actually
                    going.
                  </>
                }
                fact="Status history · Next action"
                factLabel="Every record keeps"
                isLast
                number={3}
                title="Act"
              />
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------- the assistant */}
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20 lg:grid lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:items-center lg:gap-12">
            <div>
              <h2 className="max-w-xl text-[20px] font-medium leading-snug tracking-tight text-foreground sm:text-[22px]">
                Interndex keeps the record. Your assistant is optional.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-foreground-secondary">
                Every application, status, deadline and next action lives in
                Interndex, for as long as you want it. If you already use a
                supported AI assistant, it can read and update those same
                records — saving a role, checking a status, moving something
                after an interview. Interndex does not include an assistant
                and does not require one; today this has been tested with
                Claude.
              </p>
            </div>

            {/*
              The same record from the hero, restated as fields: the record
              underneath is concrete and structured whether or not an
              assistant is ever connected to it.
            */}
            <div className="mt-8 lg:mt-0">
              <div className="rounded-surface border border-border bg-surface p-5 sm:p-6">
                <p className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
                  One record, kept in full
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  <RecordField
                    label="Role"
                    value={recordSample.original_job_title}
                  />
                  <RecordField label="Employer" value={recordSample.company_name} />
                  <RecordField label="Status" value={recordSample.current_status} />
                  <RecordField
                    label="Work term"
                    value={recordSample.work_term_season}
                  />
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- late CTA */}
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20">
            <div className="flex flex-col gap-6 rounded-surface border border-border bg-surface p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
              <div>
                <h2 className="text-[22px] font-medium leading-tight tracking-tight text-foreground sm:text-[26px]">
                  See what a real search looks like.
                </h2>
                <p className="mt-3 max-w-xl text-[14px] leading-6 text-foreground-secondary sm:text-[15px] sm:leading-7">
                  The demo is a full workspace holding a sample student
                  search: every pipeline stage, the analytics behind them, and
                  the details of each role. No account, nothing to sign up
                  for.
                </p>
              </div>
              <ButtonLink
                className="min-h-12 shrink-0 px-6 text-[15px] font-medium"
                href="/demo"
              >
                Try the demo
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
