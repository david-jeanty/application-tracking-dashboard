import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = {
  title: "Support",
  description: "How to reach Interndex with a question, a bug report, or an access request.",
};

export default function SupportPage() {
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
            Support
          </p>
          <h1 className="mt-4 text-[32px] font-medium leading-tight tracking-tight text-foreground sm:text-[40px]">
            Reach a person, not a form.
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-foreground-secondary">
            Interndex is a small, independently run product. Every message
            goes to the person who builds it.
          </p>

          <div className="mt-10 space-y-10 text-[15px] leading-7 text-foreground-secondary">
            <section aria-labelledby="contact-support">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="contact-support"
              >
                Email
              </h2>
              <p className="mt-4">
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="mailto:support@interndex.dev"
                >
                  support@interndex.dev
                </a>
              </p>
              <p className="mt-3">
                Use it for a bug, a question about your account or data, a
                problem connecting an AI assistant, or a request to delete
                your account. Expect a reply within a few days.
              </p>
            </section>

            <section aria-labelledby="account-access">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="account-access"
              >
                Managing a connected AI assistant
              </h2>
              <p className="mt-4">
                Connecting, reviewing, and disconnecting an AI assistant
                (Claude, a ChatGPT connector, or another MCP client) is done
                from Settings inside Interndex — no email needed for that.
                Email us if a disconnect does not take effect, or if you see a
                connection you do not recognize.
              </p>
            </section>

            <section aria-labelledby="other-policies">
              <h2
                className="border-b border-border pb-2 text-[20px] font-medium text-foreground"
                id="other-policies"
              >
                Related pages
              </h2>
              <p className="mt-4">
                See{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="/privacy"
                >
                  Privacy
                </a>{" "}
                for how Interndex handles your data, and{" "}
                <a
                  className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                  href="/terms"
                >
                  Terms
                </a>{" "}
                for the agreement that governs using it.
              </p>
            </section>
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
