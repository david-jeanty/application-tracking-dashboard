import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-slate-50 text-slate-600"
      role="status"
    >
      <div className="flex items-center gap-3">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        <span>Loading JobTrack…</span>
      </div>
    </div>
  );
}
