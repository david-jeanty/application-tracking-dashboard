import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms that govern using Interndex and the Interndex Capture extension.",
};

export default function TermsPage() {
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
        <article className="mx-auto max-w-[760px] px-5 py-12 sm:px-8 sm:py-16">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
            Terms
          </p>
          <h1 className="mt-4 text-[32px] font-medium leading-tight tracking-tight text-foreground sm:text-[40px]">
            The agreement for using Interndex.
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-foreground-secondary">
            These terms cover the Interndex web app, the Interndex Capture
            browser extension, and any AI assistant you connect to your
            account. Creating an account means you accept them.
          </p>
          <p className="mt-3 text-[13px] text-foreground-muted">
            Last updated September 1, 2026.
          </p>

          <div className="mt-10 space-y-10 text-[15px] leading-7 text-foreground-secondary">
            <section aria-labelledby="what-interndex-is">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="what-interndex-is"
              >
                What Interndex is
              </h2>
              <p className="mt-4">
                Interndex is a personal application tracker for internship and
                co-op searches: a tracker, pipeline, dashboard, and analytics
                built on records you create. It does not find jobs, apply on
                your behalf, write application materials, or guarantee any
                outcome from your search.
              </p>
              <p className="mt-3">
                Interndex is provided &ldquo;as is,&rdquo; without warranty of
                any kind, and is not affiliated with any employer, job board,
                or applicant-tracking system whose postings you may reference
                while using it.
              </p>
            </section>

            <section aria-labelledby="your-account">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="your-account"
              >
                Your account
              </h2>
              <p className="mt-4">
                You are responsible for the accuracy of what you store in
                Interndex and for keeping your sign-in credentials secure. Do
                not share your account, and tell us if you believe it has been
                accessed without your permission.
              </p>
              <p className="mt-3">
                You may use Interndex only for your own job search records.
                Do not use it to store data you do not have the right to
                store, to attempt to access another student&apos;s account or
                records, or to disrupt or overload the service.
              </p>
            </section>

            <section aria-labelledby="connected-assistant">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="connected-assistant"
              >
                Connecting an AI assistant
              </h2>
              <p className="mt-4">
                You may authorize an AI assistant (for example, Claude or a
                ChatGPT connector) to read and write your own application
                records on your behalf. That connection acts as you: it can
                only reach data your own account already has access to, and
                only after you approve it on the consent screen. You can
                review and revoke a connected assistant&apos;s access at any
                time in Settings.
              </p>
              <p className="mt-3">
                Interndex does not control what a connected assistant says or
                decides. Reasoning about a job posting, a status, or how to
                categorize an application is the assistant&apos;s, not
                Interndex&apos;s — Interndex stores what it is given and
                validates it against the same rules the web app enforces.
                Review what a connected assistant saves or changes; you remain
                responsible for your own records.
              </p>
            </section>

            <section aria-labelledby="acceptable-use">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="acceptable-use"
              >
                Acceptable use
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-accent">
                <li>No attempting to bypass authentication or row-level security.</li>
                <li>
                  No scraping, automated bulk extraction, or reverse engineering of
                  Interndex beyond what is needed for your own connected assistant
                  to use the documented MCP tools.
                </li>
                <li>No reselling, sublicensing, or operating Interndex as a service for others.</li>
                <li>No uploading unlawful content or content that infringes someone else&apos;s rights.</li>
              </ul>
            </section>

            <section aria-labelledby="termination">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="termination"
              >
                Termination
              </h2>
              <p className="mt-4">
                You may stop using Interndex and delete your data at any time.
                We may suspend or terminate access for a violation of these
                terms, including the acceptable-use rules above.
              </p>
            </section>

            <section aria-labelledby="liability">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="liability"
              >
                Limitation of liability
              </h2>
              <p className="mt-4">
                Interndex is offered without charge, on a best-effort basis.
                To the fullest extent the law allows, Interndex is not liable
                for indirect, incidental, or consequential damages arising
                from your use of it, including a missed deadline or an
                inaccurate record entered by you or by a connected assistant
                you authorized.
              </p>
            </section>

            <section aria-labelledby="changes-terms">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="changes-terms"
              >
                Changes to these terms
              </h2>
              <p className="mt-4">
                If these terms change materially, the &ldquo;last updated&rdquo;
                date above will change with them. Continuing to use Interndex
                after a change means you accept the updated terms.
              </p>
            </section>

            <section aria-labelledby="contact-terms">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="contact-terms"
              >
                Contact
              </h2>
              <p className="mt-4">
                Questions about these terms can go to{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
