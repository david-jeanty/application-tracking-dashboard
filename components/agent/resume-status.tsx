import { layoutStatus } from "@/lib/agent/web";
import { cn } from "@/lib/utils";

const toneClass = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-surface-muted text-foreground-secondary",
} as const;

/** The layout check result for one built resume, in words, not color alone. */
export function ResumeLayoutBadge({ check }: { check: string | null }) {
  const status = layoutStatus(check);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium", toneClass[status.tone])}>
      {status.label}
    </span>
  );
}
