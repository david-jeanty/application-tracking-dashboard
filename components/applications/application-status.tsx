import type { ApplicationStatus } from "@/lib/applications/constants";
import { cn } from "@/lib/utils";

const statusClasses: Partial<Record<ApplicationStatus, string>> = {
  Interested: "border-slate-200 bg-slate-100 text-slate-800",
  Preparing: "border-amber-200 bg-amber-50 text-amber-900",
  Applied: "border-blue-200 bg-blue-50 text-blue-800",
  Screening: "border-violet-200 bg-violet-50 text-violet-800",
  Assessment: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  Interview: "border-purple-200 bg-purple-50 text-purple-800",
  Offer: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Accepted: "border-green-200 bg-green-50 text-green-800",
  Rejected: "border-red-200 bg-red-50 text-red-800",
  Withdrawn: "border-slate-300 bg-slate-100 text-slate-700",
};

export function ApplicationStatusLabel({
  status,
}: {
  status: ApplicationStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusClasses[status],
      )}
    >
      <span className="sr-only">Status: </span>
      {status}
    </span>
  );
}
