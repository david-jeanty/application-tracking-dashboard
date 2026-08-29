import Link from "next/link";

/**
 * What this workspace is, at the top of every page of it.
 *
 * An environment indicator, not an advertisement: one hairline-bounded strip
 * with a sentence and two quiet links. It says the data is sample data in
 * words rather than with a coloured badge, because "read-only demo" is
 * information a visitor needs whatever they can see.
 *
 * The disclosure about the employers sits here rather than beside every record.
 * Repeating it on all 56 rows would make the fiction the loudest thing in a
 * workspace whose whole job is to look like the real one — and a visitor reads
 * the top of the page once, which is exactly when it matters.
 */
export function DemoBanner() {
  return (
    <div className="border border-border bg-surface-muted px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p className="text-[14px] leading-6 text-foreground">
          <span className="font-medium">Demo workspace</span>
          <span className="text-foreground-secondary">
            {" "}
            — you&rsquo;re exploring Interndex with sample data.
          </span>
        </p>
        <p className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
          <Link
            className="rounded-sm text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href="/signup"
          >
            Create your own workspace
          </Link>
          <Link
            className="rounded-sm text-foreground-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            href="/"
          >
            Back to Interndex
          </Link>
        </p>
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-foreground-muted">
        Sample applications are fictional and shown for demonstration only.
        Nothing here can be changed.
      </p>
    </div>
  );
}
