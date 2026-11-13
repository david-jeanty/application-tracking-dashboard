import Link from "next/link";
import { ResumeActions } from "@/components/agent/resume-actions";
import { ResumeLayoutBadge } from "@/components/agent/resume-status";
import type { ResumeListItem } from "@/lib/agent/resumes-repository";
import { TEMPLATE_LABELS } from "@/lib/agent/web";
import { dateOnlyFromTimestamp, formatDateOnly } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";

/** The owner's built resumes, newest first. */
export function ResumeList({ resumes }: { resumes: readonly ResumeListItem[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {resumes.map((resume) => (
        <li className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={resume.id}>
          <div className="min-w-0">
            <Link
              className="text-[15px] font-medium text-foreground hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              href={`/applications/${resume.application_id}`}
            >
              {resume.role}
            </Link>
            <p className="mt-0.5 text-[13px] text-foreground-secondary">
              {resume.company}
              {" · "}
              {formatDateOnly(dateOnlyFromTimestamp(resume.created_at, DEFAULT_TIME_ZONE))}
              {resume.template ? ` · ${TEMPLATE_LABELS[resume.template] ?? resume.template}` : ""}
              {resume.estimated_tokens ? ` · about ${resume.estimated_tokens.toLocaleString("en-US")} tokens` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <ResumeLayoutBadge check={resume.layout_check} />
            <ResumeActions resume={resume} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ResumeListEmptyState() {
  return (
    <p className="border-y border-border py-8 text-[15px] text-foreground-secondary">
      No resumes yet. Paste a job description into Claude in the Job Search project and the run builds one here.
    </p>
  );
}
