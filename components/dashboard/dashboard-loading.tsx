function Line({ className }: { className: string }) {
  return <div className={`rounded-control bg-surface-muted ${className}`} />;
}

/** A stable stand-in for the shared authenticated and demo dashboard geometry. */
export function DashboardLoading() {
  const metricDividers = [
    "border-b border-r sm:border-b-0",
    "border-b sm:border-b-0 sm:border-r",
    "border-r",
    "",
  ];

  return (
    <div
      aria-label="Loading dashboard"
      className="space-y-6 sm:space-y-7"
      role="status"
    >
      <div className="flex h-[50px] items-end justify-between">
        <div className="space-y-2">
          <Line className="h-2.5 w-24" />
          <Line className="h-7 w-40" />
        </div>
        <Line className="h-3 w-24" />
      </div>

      <div className="grid min-h-20 grid-cols-2 overflow-hidden rounded-surface border border-border bg-surface sm:min-h-24 sm:grid-cols-4">
        {[0, 1, 2, 3].map((metric) => (
          <div
            className={`animate-pulse space-y-2 border-border px-4 py-4 sm:px-5 ${metricDividers[metric]}`}
            key={metric}
          >
            <Line className="h-5 w-10" />
            <Line className="h-2.5 w-16" />
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-surface border border-border bg-surface">
        <div className="border-l-4 border-accent bg-accent-soft/65 px-4 py-3 sm:px-5">
          <Line className="h-4 w-24" />
          <Line className="mt-2 h-2.5 w-64 max-w-full" />
        </div>
        <div className="grid px-4 sm:px-5 md:grid-cols-2 md:px-0">
          {[0, 1, 2, 3].map((item) => (
            <div
              className="flex animate-pulse gap-3 border-b border-border py-4 md:px-5"
              key={item}
            >
              <div className="size-8 shrink-0 rounded-control bg-surface-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <Line className="h-3 w-28" />
                <Line className="h-2.5 w-44 max-w-full" />
                <Line className="h-2.5 w-36 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-10">
        <section className="animate-pulse rounded-surface border border-border bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <Line className="h-4 w-36" />
            <Line className="h-3 w-24" />
          </div>
          <div className="mt-3 border-t border-border pt-4">
            <Line className="h-3 w-56 max-w-full" />
            <div className="mt-4 space-y-4">
              {[0, 1, 2].map((item) => (
                <div className="flex gap-3" key={item}>
                  <div className="size-8 shrink-0 rounded-control bg-surface-muted" />
                  <div className="flex-1 space-y-2">
                    <Line className="h-3 w-3/4" />
                    <Line className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="min-h-72 animate-pulse rounded-surface border border-border bg-surface p-5 sm:p-6">
          <Line className="h-4 w-28" />
          <div className="mt-3 border-t border-border pt-5">
            <Line className="h-48 w-full" />
          </div>
        </section>
      </div>

      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}
