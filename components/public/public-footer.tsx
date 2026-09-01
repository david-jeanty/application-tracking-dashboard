import Link from "next/link";
import { InterndexLogo } from "@/components/branding/interndex-logo";

/**
 * The foot of the public site.
 *
 * One line about what Interndex is for, the links the header already offers,
 * and the Privacy, Terms and Support pages for somebody who read to the
 * bottom. Careers stays absent because that page does not exist.
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-baseline sm:justify-between sm:px-8">
        <div>
          <InterndexLogo size="small" />
          <p className="mt-2 text-[13px] text-foreground-muted">
            Built for students managing internship and co-op searches.
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          {[
            { href: "/demo", label: "Demo" },
            { href: "/login", label: "Sign in" },
            { href: "/signup", label: "Create account" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/support", label: "Support" },
          ].map((link) => (
            <li key={link.href}>
              <Link
                className="rounded-sm text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
