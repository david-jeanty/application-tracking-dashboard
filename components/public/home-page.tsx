import Link from "next/link";
import { ApplicationRecords } from "@/components/applications/application-list";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { ButtonLink } from "@/components/ui/button";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { DEMO_BASE_PATH } from "@/lib/demo/paths";
import { demoToday } from "@/lib/demo/today";
import {
  ASSISTANT_CAN,
  ASSISTANT_CANNOT,
  ASSISTANT_OWNERSHIP_NOTE,
} from "@/lib/mcp/capabilities";

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
 * What a student asks their AI, and what that does to the record.
 *
 * Each line here is one of the registered MCP tools stated as a sentence
 * somebody would actually say: `save_job`, `list_jobs`, `list_jobs` narrowed to
 * what is due, and `update_job`. Nothing in this panel describes an action the
 * connection cannot perform, which is the whole reason the second half of each
 * row exists — the ask is the visitor's language, the effect is Interndex's.
 */
const ASSISTANT_EXCHANGES = [
  {
    ask: "Save this posting to Interndex.",
    effect: "Adds a record with the title, employer, and deadline.",
  },
  {
    ask: "Show jobs I have applied to.",
    effect: "Reads your applications, filtered by stage.",
  },
  {
    ask: "Which applications need a follow-up this week?",
    effect: "Reads the deadline and next action on each one.",
  },
  {
    ask: "Update this application to Interview.",
    effect: "Moves the record and keeps the status history.",
  },
] as const;

/**
 * One step of the Capture → Track → Connect sequence.
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
 * The public front door.
 *
 * Its job is to say what Interndex is in one line — the job tracker your AI can
 * use — and then show it: the real application list, the things a connected
 * assistant can be asked about it, and the demo, none of which need an account
 * to look at. Creating an account is the primary action because connecting an
 * assistant needs a workspace to connect to; the demo stays beside it at every
 * height of the page.
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
          One claim, the two things it depends on, and somewhere to go. The
          visual beside it is not a mockup of an assistant: it is the product's
          own list component holding four demo records, with the asks a
          connected AI can actually serve stated underneath them.
        */}
        <section className="border-b border-border bg-brand-soft">
          <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14 lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:items-center lg:gap-14 lg:py-20">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
                Your AI&rsquo;s job-search context
              </p>
              <h1 className="mt-4 max-w-[16ch] text-[30px] font-medium leading-[1.12] tracking-tight text-foreground sm:mt-5 sm:text-[40px] sm:leading-[1.1] lg:text-[46px]">
                The job tracker your AI can use.
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-7 text-foreground-secondary sm:text-[16px] sm:leading-8">
                Save every posting and application in one place. Connect
                Interndex to ChatGPT, Claude, or another MCP-compatible AI so
                it can find, update, and remember your job-search context.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
                <ButtonLink className="min-h-11 px-5 text-[15px]" href="/signup">
                  Connect your AI
                </ButtonLink>
                <ButtonLink
                  className="min-h-11 px-5 text-[15px]"
                  href="/demo"
                  variant="secondary"
                >
                  Explore the demo
                </ButtonLink>
              </div>
              {/*
                The compatibility line sits directly under the actions because
                it answers the question the primary button raises — which AI? —
                before a visitor has to scroll to find out.
              */}
              <p className="mt-4 text-[13px] font-medium leading-6 text-foreground">
                Works with ChatGPT · Claude · MCP-compatible AI
              </p>
              {/*
                Two lines rather than one sentence: at a phone width a single
                line broke after "Sign", leaving "in" alone on the next row.
              */}
              <p className="mt-1.5 text-[13px] leading-6 text-foreground-muted">
                The demo needs no account.
              </p>
              <p className="mt-0.5 text-[13px] leading-6 text-foreground-muted">
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
                Your applications in Interndex, and what your AI can ask of them
              </h2>

              <div className="mt-4 overflow-hidden rounded-surface border border-border bg-surface">
                {/*
                  The production list component, given four records out of the
                  demo workspace. Not a picture of the product — the product,
                  and the dominant half of this visual.
                */}
                <ApplicationRecords
                  applications={preview}
                  basePath={DEMO_BASE_PATH}
                  history={demo.statusEvents}
                  showSummary={false}
                />

                {/*
                  The connection, shown as what it does to the records above
                  rather than as a chat window floating beside them. Each ask
                  is one registered tool; each effect is what that tool changes
                  or reads in the list directly above it.
                */}
                <div className="bg-surface-muted/60 px-4 py-4 sm:px-5 sm:py-5">
                  <p className="text-[11px] uppercase tracking-[0.07em] text-foreground-muted">
                    Asked in ChatGPT or Claude, answered from these records
                  </p>
                  <ul className="mt-3 space-y-3">
                    {ASSISTANT_EXCHANGES.map((exchange) => (
                      <li key={exchange.ask}>
                        <p className="text-[13px] font-medium leading-5 text-foreground">
                          &ldquo;{exchange.ask}&rdquo;
                        </p>
                        <p className="mt-0.5 flex gap-2 text-[12px] leading-5 text-foreground-secondary">
                          <span aria-hidden="true" className="text-accent">
                            &rarr;
                          </span>
                          <span>{exchange.effect}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-4 text-[12px] leading-6 text-foreground-muted">
                Sample applications from the demo workspace. They are
                fictional and shown for demonstration only; the employers
                named have no connection to Interndex.
              </p>
            </div>
          </div>
        </section>

        {/* -------------------------------------- capture, track, connect */}
        <section aria-labelledby="workflow-heading" className="bg-background">
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20">
            <h2
              className="max-w-2xl text-[26px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px]"
              id="workflow-heading"
            >
              Save the posting. Track the process.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-foreground-secondary">
              Everything about a role stays in one record — and that record is
              what your AI reads when you ask it about your search.
            </p>

            <ol className="mt-10 flex flex-col sm:flex-row">
              <WorkflowStep
                body={
                  <>
                    Save a posting from the web — title, employer, deadline —
                    and it becomes a record in{" "}
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
                title="Capture"
              />
              <WorkflowStep
                body={
                  <>
                    Keep stages, notes, deadlines and history in order. The{" "}
                    <Link className={workflowLinkClassName} href="/demo/pipeline">
                      Pipeline
                    </Link>{" "}
                    shows where each one stands, the{" "}
                    <Link className={workflowLinkClassName} href="/demo">
                      Dashboard
                    </Link>{" "}
                    what needs you today, and{" "}
                    <Link className={workflowLinkClassName} href="/demo/analytics">
                      Analytics
                    </Link>{" "}
                    how the search is going.
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
                    Ask ChatGPT, Claude, or another compatible AI about the
                    applications already in Interndex — and let it save and
                    update them while you talk.
                  </>
                }
                fact="Status history · Next action"
                factLabel="Every record keeps"
                isLast
                number={3}
                title="Connect"
              />
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------- connect your AI */}
        <section
          aria-labelledby="connect-heading"
          className="border-t border-border bg-background"
        >
          <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 sm:py-20 lg:grid lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] lg:items-start lg:gap-14">
            <div>
              <h2
                className="max-w-xl text-[26px] font-medium leading-tight tracking-tight text-foreground sm:text-[30px]"
                id="connect-heading"
              >
                Your applications stay in Interndex. Your AI gets the context.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-foreground-secondary">
                Interndex holds the record — every posting you saved, the stage
                it is at, the dates and notes around it. Connect the AI you
                already use and it can read those applications and make the
                updates you ask for, so you stop retyping what you just
                discussed with it.
              </p>
              <p className="mt-4 max-w-xl text-[14px] leading-7 text-foreground-secondary">
                The connection uses MCP, the open standard ChatGPT, Claude and
                other clients use to reach outside tools. You approve it once
                from Settings, and you can remove it there at any time.
                Interndex does not include an assistant and does not require
                one; today this has been tested with Claude, and other
                MCP-compatible clients connect at the same address.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <ButtonLink className="min-h-11 px-5 text-[15px]" href="/signup">
                  Connect your AI
                </ButtonLink>
                <Link className={`text-[14px] ${workflowLinkClassName}`} href="/demo">
                  Explore the demo first
                </Link>
              </div>
            </div>

            {/*
              The permissions, stated on the public page in the same words the
              consent screen and Settings use — one list, imported rather than
              re-written, so a homepage claim cannot outrun the tool surface.
            */}
            <div className="mt-10 lg:mt-0">
              <div className="rounded-surface border border-border bg-surface p-5 sm:p-6">
                <h3 className="text-[15px] font-medium text-foreground">
                  What a connected AI can do
                </h3>
                <ul className="mt-3 space-y-1 text-[14px] leading-6 text-foreground-secondary">
                  {ASSISTANT_CAN.map((capability) => (
                    <li key={capability}>{capability}</li>
                  ))}
                </ul>
                <h3 className="mt-5 text-[15px] font-medium text-foreground">
                  What it cannot do
                </h3>
                <ul className="mt-3 space-y-1 text-[14px] leading-6 text-foreground-secondary">
                  {ASSISTANT_CANNOT.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
                <p className="mt-4 text-[13px] leading-6 text-foreground-muted">
                  {ASSISTANT_OWNERSHIP_NOTE}
                </p>
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
                Explore the demo
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
