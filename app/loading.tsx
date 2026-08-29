import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-surface-muted text-foreground-secondary"
      role="status"
    >
      <div className="flex items-center gap-3">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        <span>Loading Interndex…</span>
      </div>
    </div>
  );
}
