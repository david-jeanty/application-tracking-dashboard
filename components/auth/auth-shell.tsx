import Link from "next/link";
import type { ReactNode } from "react";
import { InterndexLogo } from "@/components/branding/interndex-logo";

/**
 * The quiet accent link every signed-out footer uses.
 *
 * Regular weight, as the rest of the product's links are: the old
 * `font-semibold` here was the only place a body link shouted.
 */
export const authLinkClassName =
  "rounded-sm text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

type AuthShellProps = {
  children: ReactNode;
  title: string;
  description: string;
  footer: ReactNode;
};

/**
 * The frame around every signed-out form.
 *
 * One narrow column on the ordinary page ground, and nothing else. What used to
 * be here was a split screen with an accent-filled marketing panel down the
 * left, a briefcase in a rounded box, and the form inside a card — a shape from
 * before the product had a public homepage, and one that explained Interndex to
 * somebody who had already decided to sign in.
 *
 * The homepage does the explaining now. This page has one job: take four fields
 * and get out of the way. So it is a wordmark that goes home, a heading, a
 * sentence, the form, and the two or three links that belong under it.
 *
 * Every route beneath it also offers the demo, because somebody who arrived
 * straight at `/signup` from a link has not seen the homepage and would
 * otherwise have to make an account to find out what they were making it for.
 */
export function AuthShell({
  children,
  title,
  description,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            aria-label="Interndex"
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            data-testid="brand"
            href="/"
          >
            <InterndexLogo size="medium" />
          </Link>
          <Link
            className="rounded-sm text-[14px] text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            href="/demo"
          >
            Explore the demo
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-12 sm:px-8 sm:py-16">
        <div className="w-full max-w-[420px]">
          <h1 className="text-[28px] font-medium leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-[15px] leading-7 text-foreground-secondary">
            {description}
          </p>

          {/* A rule rather than a card: the form is the page, not an object on it. */}
          <div className="mt-8 border-t border-border pt-8">{children}</div>

          <div className="mt-6 text-[14px] leading-7 text-foreground-secondary">
            {footer}
          </div>
        </div>
      </main>
    </div>
  );
}
