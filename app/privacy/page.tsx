import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { formatDocumentVersion, PRIVACY_VERSION } from "@/lib/legal/document-versions";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How Interndex handles account, application, and browser-capture data.",
};

export default function PrivacyPage() {
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
            Privacy
          </p>
          <h1 className="mt-4 text-[32px] font-medium leading-tight tracking-tight text-foreground sm:text-[40px]">
            Your application records stay yours.
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-foreground-secondary">
            This page describes the Interndex web app and the Interndex Capture
            browser extension, including what the extension reads, stores, and
            sends when installed from the Chrome Web Store or loaded locally as
            an unpacked developer build.
          </p>
          <p className="mt-3 text-[13px] text-foreground-muted">
            Effective date / last updated: {formatDocumentVersion(PRIVACY_VERSION)}.
          </p>

          <div className="mt-10 space-y-10 text-[15px] leading-7 text-foreground-secondary">
            <section aria-labelledby="operator-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="operator-privacy"
              >
                Who operates Interndex
              </h2>
              <p className="mt-4">
                Interndex is currently built and operated by an individual
                developer, not a registered company, based in Ontario,
                Canada.{" "}
                <em>
                  That is stated here as the operator&apos;s working
                  assumption, not a confirmed legal fact — it has not yet been
                  reviewed by a lawyer.
                </em>{" "}
                If Interndex incorporates, changes ownership, or moves, this
                page will say so and name the new operator.
              </p>
              <p className="mt-3">
                For anything about your privacy — a question, a correction, a
                deletion request, or a concern about how your data is
                handled — the person accountable is the same person who
                builds Interndex, reachable at{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>
                . There is no separate privacy team; every request goes to
                that inbox and gets a reply from a person.
              </p>
            </section>

            <section aria-labelledby="collection-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="collection-privacy"
              >
                What Interndex collects, and why
              </h2>
              <p className="mt-4">
                Each category below exists for one stated reason. Interndex
                does not collect anything beyond what that reason needs.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-accent">
                <li>
                  <strong className="text-foreground">Account data.</strong>{" "}
                  Your name, email address, and password (handled entirely by
                  Supabase, Interndex&apos;s authentication provider — see
                  &ldquo;Where your data is stored&rdquo; below). Used to
                  create your account, sign you in, and secure it.
                </li>
                <li>
                  <strong className="text-foreground">
                    Application data.
                  </strong>{" "}
                  The job records you save or edit yourself, that a connected
                  AI assistant saves or edits on your instruction, or that the
                  Interndex Capture extension saves after you confirm a
                  capture — company, title, status, dates, notes, and the
                  other tracker fields described in the app. Used to run the
                  tracker, pipeline, dashboard, and analytics you see.
                </li>
                <li>
                  <strong className="text-foreground">
                    Browser-capture data.
                  </strong>{" "}
                  What the Interndex Capture extension reads from a job
                  posting page, described fully below. Used only to fill in
                  the application record you confirm saving.
                </li>
                <li>
                  <strong className="text-foreground">
                    Technical data.
                  </strong>{" "}
                  Session cookies and tokens that keep you signed in, and the
                  ordinary connection information (like IP address) that any
                  website or its hosting provider logs to keep the service
                  running and secure. Interndex does not run any analytics,
                  advertising, or tracking script of its own — see
                  &ldquo;Cookies and local storage&rdquo; below for the full
                  picture.
                </li>
              </ul>
            </section>

            <section aria-labelledby="consent-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="consent-privacy"
              >
                Consent
              </h2>
              <p className="mt-4">
                Creating an account is how you consent to account and
                application data being collected as described here. Installing
                the Interndex Capture extension and granting its permissions
                is separate consent for browser-capture data, and connecting
                an AI assistant in Settings is separate consent for that
                assistant to read and write your application records.
              </p>
              <p className="mt-3">
                You can withdraw any of these independently: disconnect an AI
                assistant or the extension&apos;s access in Settings without
                closing your account, uninstall the extension without
                affecting your account, or close your account entirely by
                emailing{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>
                . Withdrawing consent for a feature stops that feature; it
                does not retroactively delete records already saved unless
                you also ask for those to be deleted.
              </p>
            </section>

            <section aria-labelledby="web-app-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="web-app-privacy"
              >
                The web app today
              </h2>
              <p className="mt-4">
                Interndex stores the account information needed to sign you in
                and the application records you choose to save. A connected AI
                assistant can work with those records only after you authorize
                its connection to your account. You can review and revoke
                connected clients in Settings.
              </p>
              <p className="mt-3">
                Your records are used to provide Interndex&apos;s tracker,
                pipeline, dashboard, analytics, and connected-assistant
                features. Interndex does not sell your application records or
                use them for personalized advertising. You can edit, archive,
                and delete tracked records through Interndex.
              </p>
            </section>

            <section aria-labelledby="ai-assistant-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="ai-assistant-privacy"
              >
                How a connected AI assistant fits in
              </h2>
              <p className="mt-4">
                Interndex does not run its own AI. It has no parser, no
                chatbot, and no model of its own, and it never sends your
                application data to an AI provider on its own initiative. When
                you connect an assistant like Claude or a ChatGPT connector,
                that assistant is your own tool, signed in as you, reading a
                job posting or a spreadsheet you gave it directly — Interndex
                never sees that posting or that file. The assistant only
                reaches Interndex when it calls one of a fixed set of
                documented actions (saving, listing, reading, or updating your
                own applications), authenticated as your account and limited
                to records that account can already reach.
              </p>
              <p className="mt-3">
                What that assistant does with a posting or a spreadsheet
                before it talks to Interndex — and whatever it stores or sends
                elsewhere — is between you and that assistant&apos;s own
                provider and their own privacy policy, not Interndex.
                Interndex only stores what the assistant sends it, the same
                way it stores what you type into the web app yourself.
              </p>
            </section>

            <section aria-labelledby="extension-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="extension-privacy"
              >
                The Interndex Capture browser extension
              </h2>
              <p className="mt-4">
                Interndex Capture is a manual capture tool, not an AI, discovery,
                or background-monitoring product. It does what its one button
                says: it saves the posting you are looking at into your own
                tracker.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-accent">
                <li>
                  Page data is read only after you open the extension on a page.
                  It registers no content script and holds no permission for job
                  sites, so it has no way to read a page you have not opened it
                  on.
                </li>
                <li>
                  What it reads is the posting&apos;s own published job details
                  and standard page metadata. The page&apos;s full contents are
                  never transmitted.
                </li>
                <li>
                  Extracted posting information is sent to your own Interndex
                  account, and only after you confirm it and choose to save.
                </li>
                <li>
                  Interndex does not continuously monitor browsing. Nothing runs
                  in the background between captures, and the extension keeps no
                  record of pages you visited.
                </li>
                <li>
                  Sign-in information is used only to connect your own Interndex
                  account. Credentials are held by the extension and are never
                  given to the job page.
                </li>
                <li>
                  Captured data is used only to provide Interndex functionality,
                  not sold or used for personalized advertising.
                </li>
                <li>
                  You can edit or delete captured records through Interndex, just
                  like records saved another way, and you can remove the
                  extension&apos;s access at any time in Settings.
                </li>
                <li>
                  The extension provides no AI of its own. It does not classify
                  jobs, match or tailor a resume, write applications, fill forms,
                  or apply on your behalf.
                </li>
              </ul>
            </section>

            <section aria-labelledby="limits-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="limits-privacy"
              >
                Deliberate limits
              </h2>
              <p className="mt-4">
                Interndex does not need to infer personal facts, continuously
                scrape job sites, detect submissions, or inspect unrelated
                browsing to store a posting. Unknown information remains
                unknown: when a posting does not state something, the extension
                leaves the field empty rather than guessing at it.
              </p>
              <p className="mt-3">
                All communication between the extension and Interndex, and
                between the extension and Supabase, happens over HTTPS. The
                extension does not sell captured data or use it for
                advertising, and it does not share it with any other
                third party.
              </p>
              <p className="mt-3">
                If an application has a company website saved, the web app
                asks{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="https://www.logo.dev"
                >
                  Logo.dev
                </a>{" "}
                to show that employer&apos;s logo. Your browser requests that
                image directly from Logo.dev using the company&apos;s domain,
                which is the only thing Logo.dev sees — never your name,
                email, or any other Interndex data. Leave the company website
                field empty and Interndex shows a plain lettermark instead,
                with no request to Logo.dev at all.
              </p>
            </section>

            <section aria-labelledby="cookies-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="cookies-privacy"
              >
                Cookies and local storage
              </h2>
              <p className="mt-4">
                The web app sets one kind of cookie: a session cookie from
                Supabase that keeps you signed in. It is strictly necessary —
                without it, Interndex could not tell it was still you on the
                next page — and it is not used to track you across other
                sites or to serve ads. Interndex runs no analytics,
                advertising, or third-party tracking script, so there is
                nothing else to opt out of.
              </p>
              <p className="mt-3">
                The Interndex Capture extension stores your sign-in tokens in
                Chrome&apos;s own extension storage rather than a cookie: the
                short-lived access token in memory (cleared when Chrome
                closes), and the longer-lived refresh token on disk so you
                are not asked to reconnect every session. Both are readable
                only by the extension itself, never by the pages you visit.
              </p>
            </section>

            <section aria-labelledby="transfers-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="transfers-privacy"
              >
                Where your data is stored
              </h2>
              <p className="mt-4">
                Interndex runs on two hosting providers: Vercel for the
                website and Supabase for the database and authentication.
                Both may process or store data outside Canada,
                including in the United States, depending on the region
                configured for the Interndex project.{" "}
                <em>
                  The exact region has not been confirmed in this document —
                  Interndex will state it precisely once verified against the
                  live deployment.
                </em>{" "}
                Optional company logos are requested directly from Logo.dev,
                described above.
              </p>
            </section>

            <section aria-labelledby="retention-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="retention-privacy"
              >
                How long we keep your data
              </h2>
              <p className="mt-4">
                Interndex keeps your application records for as long as your
                account exists, with no automatic expiry — a job search runs
                for months and the whole point of the tracker is a record
                that lasts as long as you need it to. You can archive an
                application at any time, and permanently delete an archived
                one yourself, right in the app, whenever you choose.
              </p>
              <p className="mt-3">
                Deleting your account today is a manual step rather than a
                self-service button: email{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>{" "}
                and ask. Once your account is deleted, your profile,
                application records, and status history are deleted with it —
                the database is built so that removing your account
                automatically removes everything tied to it, rather than
                leaving orphaned rows behind. A self-service &ldquo;delete my
                account&rdquo; control in Settings is planned but not built
                yet; until then, email is the only way.
              </p>
            </section>

            <section aria-labelledby="security-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="security-privacy"
              >
                Security
              </h2>
              <p className="mt-4">
                Every connection to Interndex — the web app, the extension,
                and a connected AI assistant — happens over HTTPS. Interndex
                itself never sees or stores your password; Supabase handles
                that. Every table that holds your data enforces row-level
                security in the database itself, so a request for another
                student&apos;s applications is rejected before it ever
                reaches application code, not just hidden by the interface.
                No component of Interndex holds a database key capable of
                bypassing that protection.
              </p>
            </section>

            <section aria-labelledby="rights-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="rights-privacy"
              >
                Your privacy rights
              </h2>
              <p className="mt-4">
                You can see everything Interndex holds about you by signing
                in and looking at your applications, your profile, and your
                Settings page — there is no hidden data. You can correct
                almost anything yourself by editing a record or your account
                details. For anything you cannot fix in the app — correcting
                account information, asking what data Interndex holds about
                you, or challenging how a request was handled — email{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>
                . Expect a reply within a few days.
              </p>
            </section>

            <section aria-labelledby="eligibility-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="eligibility-privacy"
              >
                Children and eligibility
              </h2>
              <p className="mt-4">
                Interndex is built for students old enough to be applying to
                internships and co-ops, and is not directed at young
                children. Signing up today does not ask for or verify your
                age. If you believe a child has created an Interndex account,
                email{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>{" "}
                and it will be removed.
              </p>
            </section>

            <section aria-labelledby="changes-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="changes-privacy"
              >
                Changes to this policy
              </h2>
              <p className="mt-4">
                If this policy changes in a way that matters — a new category
                of data, a new third party, or a different retention rule —
                the &ldquo;last updated&rdquo; date above will change and
                Interndex will tell you directly (an email or an in-app
                notice) rather than only updating this page silently. A minor
                wording or formatting fix may update the date without a
                separate notice.
              </p>
            </section>

            <section aria-labelledby="contact-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="contact-privacy"
              >
                Managing your data
              </h2>
              <p className="mt-4">
                You can review, edit, archive, and delete your application
                records at any time by signing in to Interndex. Settings is
                where Supabase, not the extension itself, is the source of
                truth about who still has access: revoking the Interndex
                Capture extension&apos;s connection there — or a connected AI
                assistant&apos;s — is independent of whatever the browser
                extension still has stored locally, and disconnecting from
                inside the extension does not by itself revoke that
                server-side access.
              </p>
              <p className="mt-3">
                This page works alongside{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="/terms"
                >
                  Interndex&apos;s Terms
                </a>
                , which cover the agreement for using the service rather than
                how your data is handled. Questions that aren&apos;t about
                privacy can also go through{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="/support"
                >
                  Support
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
