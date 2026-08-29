import Link from "next/link";
import { InterndexLogo } from "@/components/branding/interndex-logo";
import { ButtonLink } from "@/components/ui/button";

/**
 * The public site's header.
 *
 * Three actions and a wordmark. There is no navigation menu because there are
 * no other public pages to navigate to — a header of About, Blog and Resources
 * would be furniture for a site that does not exist.
 *
 * The order is the order a first-time visitor should consider them in: look at
 * the product, then sign in if you already have a workspace, then make one.
 * Try demo carries the filled button because seeing Interndex is the thing this
 * page most wants to happen; Create account follows it as the quieter outline.
 */
export function PublicHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          aria-label="Interndex"
          className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          href="/"
        >
          <InterndexLogo size="medium" />
        </Link>

        <nav aria-label="Public navigation">
          <ul className="flex items-center gap-2 sm:gap-4">
            <li className="hidden sm:block">
              <Link
                className="rounded-sm px-1 text-[14px] text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                href="/login"
              >
                Sign in
              </Link>
            </li>
            <li>
              <ButtonLink href="/demo">Try demo</ButtonLink>
            </li>
            <li>
              <ButtonLink href="/signup" variant="secondary">
                Create account
              </ButtonLink>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
