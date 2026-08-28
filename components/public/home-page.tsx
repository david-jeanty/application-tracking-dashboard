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

/** One of the three things Interndex is for. A heading, a rule, and prose. */
function Explanation({
  body,
  title,
}: {
  body: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <span aria-hidden="true" className="mb-4 block h-0.5 w-8 bg-accent" />
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
 * Its job is to let somebody understand Interndex and then look at it, in that
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
        {/*
          Two panels: what Interndex is for on the accent ground, and what to do
          about it on the page's own cream. The split is the shape the product
          has always introduced itself with — it began life on the sign-in
          screen — but the right-hand side is no longer a form. Somebody who has
          just arrived is being asked to look at Interndex, not to join it.

          It stacks below `lg`, accent first, so a phone gets the same order and
          Try the demo is still near the top of the page.
        */}
        <section className="border-b border-border lg:grid lg:min-h-[540px] lg:grid-cols-[minmax(0,57fr)_minmax(0,43fr)]">
          {/*
            The inner padding lines the copy up with the wordmark in the header
            above it on a wide screen, and falls back to an ordinary gutter when
            there is no room for that.
          */}
          <div className="flex flex-col justify-between gap-8 bg-accent px-5 py-10 text-accent-foreground sm:gap-10 sm:px-8 sm:py-14 lg:py-16 lg:pl-[max(3.5rem,calc((100vw-1120px)/2+2rem))] lg:pr-14">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent-foreground/75">
                Internship and co-op applications
              </p>
              <h1 className="mt-5 max-w-[16ch] text-[30px] font-medium leading-[1.14] tracking-tight sm:mt-6 sm:text-[42px] sm:leading-[1.12] lg:text-[46px]">
                Keep your search organized and know what needs attention next.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-accent-foreground/85 sm:mt-6 sm:text-[16px] sm:leading-8">
                Every application in one place, with the deadline it closes on,
                the next action you set yourself, and the status history that
                shows how far each one actually got.
              </p>
            </div>
            <p className="text-[14px] text-accent-foreground/75">
              Built for students, one careful step at a time.
            </p>
          </div>

          <div className="flex flex-col justify-center bg-background px-5 py-10 sm:px-8 sm:py-14 lg:py-16 lg:pl-14 lg:pr-[max(3.5rem,calc((100vw-1120px)/2+2rem))]">
            <h2 className="text-[26px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px]">
              See Interndex in action
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-7 text-foreground-secondary">
              Explore a complete sample internship search — dozens of
              applications, every pipeline stage and the analytics behind them —
              before you decide whether to keep one of your own.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
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

            <p className="mt-5 text-[14px] leading-7 text-foreground-muted">
              The demo needs no account.
              <br />
              <Link
                className="rounded-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href="/login"
              >
                Already have an account? Sign in
              </Link>
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- preview */}
        <section
          aria-labelledby="preview-heading"
          className="border-t border-border bg-brand-soft"
        >
          <div className="mx-auto max-w-[1120px] px-5 py-12 sm:px-8 sm:py-16">
            {/*
              A real heading, not a caption: each record below is an `h3`, and
              without an `h2` between them and the hero the page would skip a
              level the moment the preview rendered.
            */}
            <h2 className="text-[13px] font-normal text-foreground-muted" id="preview-heading">
              Your applications, as Interndex keeps them
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
              connection to Interndex.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- what it is for */}
        <div className="mx-auto grid max-w-[1120px] gap-10 bg-background px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-3 lg:gap-12">
          <Explanation
            body={
              <p>
                Every application in one place, with the status it is at, the
                date it closes, and the one thing you said you would do next.
                Interndex keeps the history too, so you can see how far each one
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
                applications to Interndex — the spreadsheet itself never comes
                here.
              </p>
            }
            title="Bring your old tracker"
          />
        </div>

        {/* ---------------------------------------------------- the boundary */}
        <section className="border-y border-brand-strong bg-brand-strong text-brand-strong-foreground">
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20">
            <h2 className="max-w-2xl text-[26px] font-medium leading-tight tracking-tight sm:text-[30px]">
              AI does the reasoning. Interndex stores the truth.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-brand-strong-foreground/85">
              Interndex does not provide an AI and does not charge you for one.
              You bring an assistant you already have, and the two do different
              jobs.
            </p>

            <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-12">
              <div>
                <h3 className="border-b border-brand-strong-foreground/30 pb-2 text-[15px] font-medium">
                  Your assistant
                </h3>
                <ul className="mt-4 space-y-2 text-[15px] leading-7 text-brand-strong-foreground/85">
                  <li>Understands the conversation you are having with it</li>
                  <li>Reads job postings and messy spreadsheets</li>
                  <li>Works out what you meant, and asks when it cannot tell</li>
                </ul>
              </div>
              <div>
                <h3 className="border-b border-brand-strong-foreground/30 pb-2 text-[15px] font-medium">
                  Interndex
                </h3>
                <ul className="mt-4 space-y-2 text-[15px] leading-7 text-brand-strong-foreground/85">
                  <li>Stores your applications as structured records</li>
                  <li>Checks what goes in before it is saved</li>
                  <li>
                    Keeps statuses, deadlines, next actions and history, for as
                    long as you want them
                  </li>
                </ul>
              </div>
            </div>

            <p className="mt-10 max-w-2xl text-[15px] leading-7 text-brand-strong-foreground/85">
              You talk to your assistant. Your assistant works with Interndex.
              Interndex keeps the record.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- late CTA */}
        <section className="mx-auto max-w-[1120px] bg-background px-5 py-16 sm:px-8 sm:py-24">
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
            <ButtonLink className="min-h-12 px-6 text-[15px] font-medium" href="/demo">
              Try the demo
            </ButtonLink>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
