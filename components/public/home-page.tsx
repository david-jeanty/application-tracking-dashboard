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

/** One of the three things JobTrack is for. A heading, a rule, and prose. */
function Explanation({
  body,
  title,
}: {
  body: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h2 className="border-b border-border pb-2 text-[17px] font-medium text-foreground">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-[15px] leading-7 text-foreground-secondary">
        {body}
      </div>
    </section>
  );
}

/**
 * The public front door.
 *
 * Its job is to let somebody understand JobTrack and then look at it, in that
 * order, without an account. So the demo is the loudest thing on the page —
 * the header button, the hero's primary action, the preview in the middle and
 * the one call to action at the foot — and creating an account is the quieter
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
        <section className="mx-auto max-w-[1120px] px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20">
          <h1 className="max-w-3xl text-[36px] font-medium leading-[1.1] tracking-tight text-foreground sm:text-[52px]">
            A job tracker your AI assistant can actually use.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-8 text-foreground-secondary">
            Keep your applications, statuses, deadlines and next actions in one
            structured workspace. Connect an AI assistant you already use, and it
            can work with those same records instead of making you retype what
            you just told it.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink className="min-h-11 px-5 text-[15px]" href="/demo">
              Try demo
            </ButtonLink>
            <ButtonLink
              className="min-h-11 px-5 text-[15px]"
              href="/signup"
              variant="secondary"
            >
              Create account
            </ButtonLink>
          </div>
          <p className="mt-4 text-[14px] text-foreground-muted">
            The demo needs no account.{" "}
            <Link
              className="rounded-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              href="/login"
            >
              Already have one? Sign in
            </Link>
          </p>
        </section>

        {/* --------------------------------------------------------- preview */}
        <section
          aria-labelledby="preview-heading"
          className="border-t border-border bg-surface"
        >
          <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 sm:py-16">
            {/*
              A real heading, not a caption: each record below is an `h3`, and
              without an `h2` between them and the hero the page would skip a
              level the moment the preview rendered.
            */}
            <h2 className="text-[13px] font-normal text-foreground-muted" id="preview-heading">
              Your applications, as JobTrack keeps them
            </h2>
            {/*
              The production list component, given four records out of the demo
              workspace. Not a picture of the product — the product.
            */}
            <div className="mt-5">
              <ApplicationRecords
                applications={preview}
                basePath={DEMO_BASE_PATH}
                history={demo.statusEvents}
                showSummary={false}
              />
            </div>
            <p className="mt-5 text-[13px] leading-6 text-foreground-muted">
              Sample applications from the demo workspace. They are fictional and
              shown for demonstration only; the employers named have no
              connection to JobTrack.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- what it is for */}
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-3 lg:gap-12">
          <Explanation
            body={
              <p>
                Every application in one place, with the status it is at, the
                date it closes, and the one thing you said you would do next.
                JobTrack keeps the history too, so you can see how far each one
                actually got.
              </p>
            }
            title="Track the search"
          />
          <Explanation
            body={
              <p>
                Connect an MCP-compatible AI assistant and it can read and update
                the same records you see here — saving a posting, finding what you
                applied to at one employer, moving a status after an interview.
                Claude is the assistant this has been tested with.
              </p>
            }
            title="Use the same records with AI"
          />
          <Explanation
            body={
              <p>
                Already keeping a spreadsheet? Export it as a CSV and give the
                file to your connected assistant. It reads the columns, works out
                what your statuses and dates meant, and checks the parts it is
                unsure about with you. Once you confirm, it sends finished
                applications to JobTrack — the spreadsheet itself never comes
                here.
              </p>
            }
            title="Bring your old tracker"
          />
        </div>

        {/* ---------------------------------------------------- the boundary */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20">
            <h2 className="max-w-2xl text-[26px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px]">
              AI does the reasoning. JobTrack stores the truth.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-foreground-secondary">
              JobTrack does not provide an AI and does not charge you for one.
              You bring an assistant you already have, and the two do different
              jobs.
            </p>

            <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-12">
              <div>
                <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">
                  Your assistant
                </h3>
                <ul className="mt-4 space-y-2 text-[15px] leading-7 text-foreground-secondary">
                  <li>Understands the conversation you are having with it</li>
                  <li>Reads job postings and messy spreadsheets</li>
                  <li>Works out what you meant, and asks when it cannot tell</li>
                </ul>
              </div>
              <div>
                <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">
                  JobTrack
                </h3>
                <ul className="mt-4 space-y-2 text-[15px] leading-7 text-foreground-secondary">
                  <li>Stores your applications as structured records</li>
                  <li>Checks what goes in before it is saved</li>
                  <li>
                    Keeps statuses, deadlines, next actions and history, for as
                    long as you want them
                  </li>
                </ul>
              </div>
            </div>

            <p className="mt-10 max-w-2xl text-[15px] leading-7 text-foreground-secondary">
              You talk to your assistant. Your assistant works with JobTrack.
              JobTrack keeps the record.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- late CTA */}
        <section className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="max-w-2xl text-[26px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px]">
            See what a real search looks like.
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-foreground-secondary">
            The demo is a full workspace holding a sample student search: dozens
            of fictional internship and co-op applications, every pipeline stage,
            the analytics behind them, and the details of each role. No account,
            nothing to sign up for.
          </p>
          <div className="mt-8">
            <ButtonLink className="min-h-11 px-5 text-[15px]" href="/demo">
              Try the demo
            </ButtonLink>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
