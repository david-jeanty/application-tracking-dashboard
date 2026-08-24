import { Card } from "@/components/ui/card";

export default function ApplicationDetailLoading() {
  return (
    <div aria-label="Loading application" className="space-y-5" role="status">
      <div className="h-24 animate-pulse rounded-surface bg-surface-muted" />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <Card
            className="h-44 animate-pulse bg-surface-muted"
            key={item}
          />
        ))}
      </div>
      <span className="sr-only">Loading application…</span>
    </div>
  );
}
