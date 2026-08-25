import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How JobTrack handles account, application, and planned browser-capture data.",
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
            This page describes the current JobTrack web app and the intended
            privacy boundary for a planned browser extension. The extension is
            not publicly released.
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
                JobTrack stores the account information needed to sign you in
                and the application records you choose to save. A connected AI
                assistant can work with those records only after you authorize
                its connection to your account. You can review and revoke
                connected clients in Settings.
              </p>
              <p className="mt-3">
                Your records are used to provide JobTrack&apos;s tracker,
                pipeline, dashboard, analytics, and connected-assistant
                features. JobTrack does not sell your application records or
                use them for personalized advertising. You can edit, archive,
                and delete tracked records through JobTrack.
              </p>
            </section>

            <section aria-labelledby="extension-privacy">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="extension-privacy"
              >
                The planned browser extension
              </h2>
              <p className="mt-4">
                The planned extension is a manual capture tool, not an AI,
                discovery, or background-monitoring product. Its intended
                behavior is limited to the posting the user explicitly asks it
                to save.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-accent">
                <li>
                  Page data will be accessed only after explicit user
                  invocation.
                </li>
                <li>
                  Extracted posting information will be transmitted to the
                  user&apos;s own JobTrack account.
                </li>
                <li>JobTrack will not continuously monitor browsing.</li>
                <li>
                  Authentication information will be used only to connect the
                  user&apos;s account.
                </li>
                <li>
                  Captured data will be used only to provide JobTrack
                  functionality, not sold or used for personalized advertising.
                </li>
                <li>
                  Users will be able to edit or delete captured records through
                  JobTrack, just like records saved another way.
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
                JobTrack does not need to infer personal facts, continuously
                scrape job sites, detect submissions, or inspect unrelated
                browsing to store a posting. Unknown information remains
                unknown. The extension&apos;s permissions and data handling will
                receive a separate review before any public release.
              </p>
            </section>
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
