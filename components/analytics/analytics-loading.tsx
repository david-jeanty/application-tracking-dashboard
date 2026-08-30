function Line({ className }: { className: string }) {
  return <div className={`rounded-control bg-surface-muted ${className}`} />;
}

/** Loading geometry that mirrors the final Analytics composition. */
export function AnalyticsLoading() {
  return (
    <div
      aria-label="Loading analytics"
      className="space-y-10 sm:space-y-12"
      role="status"
    >
      <div className="animate-pulse space-y-2">
        <Line className="h-9 w-44" />
        <Line className="h-4 w-72 max-w-full" />
      </div>

      <div className="overflow-hidden border-y border-border bg-surface xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <section className="animate-pulse px-4 py-5 sm:px-6 sm:py-6 lg:px-7">
          <Line className="h-5 w-24" />
          <div className="mt-3 border-t border-border pt-6">
            <div className="grid gap-5 sm:grid-cols-4">
              {[0, 1, 2, 3].map((stage) => (
                <div className="space-y-2" key={stage}>
                  <Line className="h-3 w-20 max-w-full" />
                  <Line className="h-7 w-10" />
                  <Line className="h-2.5 w-16 max-w-full" />
                </div>
              ))}
            </div>
            <div className="mt-6 grid max-w-xl grid-cols-2 border-t border-border pt-4">
              <Line className="h-9 w-24 max-w-full" />
              <Line className="ml-4 h-9 w-24 max-w-full" />
            </div>
          </div>
        </section>
        <section className="animate-pulse border-t border-border bg-accent-soft/35 px-4 py-5 sm:px-6 sm:py-6 xl:border-l xl:border-t-0 xl:px-7">
          <Line className="h-2.5 w-28" />
          <Line className="mt-3 h-4 w-44 max-w-full" />
          <Line className="mt-6 h-3 w-48 max-w-full" />
          <Line className="mt-3 h-8 w-36 max-w-full" />
          <Line className="mt-6 h-12 w-full" />
        </section>
      </div>

      {["matrix", "activity"].map((section) => (
        <section className="animate-pulse" key={section}>
          <div className="flex items-center justify-between border-b border-border pb-2">
            <Line className="h-5 w-40" />
            {section === "matrix" ? <Line className="h-8 w-32" /> : null}
          </div>
          <Line className="mt-4 h-3 w-80 max-w-full" />
          <Line className={`mt-5 w-full ${section === "matrix" ? "h-56" : "h-64"}`} />
        </section>
      ))}

      <span className="sr-only">Loading analytics…</span>
    </div>
  );
}
