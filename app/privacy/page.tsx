import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

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
            This page describes the Interndex web app and the locally testable
            Interndex Capture browser extension. The extension is not currently
            distributed through the Chrome Web Store.
          </p>
          <p className="mt-3 text-[13px] text-foreground-muted">
            Last updated August 25, 2026.
          </p>

          <div className="mt-10 space-y-10 text-[15px] leading-7 text-foreground-secondary">
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

            <section aria-labelledby="extension-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="extension-privacy"
              >
                The browser extension
              </h2>
              <p className="mt-4">
                Interndex Capture is a manual capture tool, not an AI, discovery,
                or background-monitoring product. It handles only the posting
                the user explicitly asks it to save.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-accent">
                <li>
                  The current page is accessed only after the user explicitly
                  invokes Interndex Capture.
                </li>
                <li>
                  Extracted posting information is transmitted to the
                  user&apos;s own Interndex account.
                </li>
                <li>The extension does not continuously monitor browsing.</li>
                <li>
                  Access and refresh tokens are used only to authenticate the
                  user&apos;s Interndex connection.
                </li>
                <li>
                  Page and job data is used only to provide Interndex
                  functionality, not sold or used for personalized advertising.
                </li>
                <li>
                  Users can edit, archive, or delete captured records through
                  Interndex, just like records saved another way.
                </li>
                <li>The extension does not use built-in AI.</li>
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
                unknown. Chrome Web Store packaging, submission, and its broader
                compliance review remain separate future work.
              </p>
            </section>
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
