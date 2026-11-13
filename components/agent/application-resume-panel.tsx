import { ResumeActions } from "@/components/agent/resume-actions";
import { ResumeLayoutBadge } from "@/components/agent/resume-status";
import type { ApplicationAgentPanel } from "@/lib/agent/resumes-repository";
import { TEMPLATE_LABELS } from "@/lib/agent/web";

/**
 * The tailored resume for this application and what the run cost, on the
 * application page. Only ever rendered for the OWNER_USER_ID account.
 */
export function ApplicationResumePanel({ panel }: { panel: ApplicationAgentPanel }) {
  const { resume, usage } = panel;
  return (
    <section aria-labelledby="tailored-resume-heading" className="mt-8 border-t border-border pt-5">
      <h2 className="text-[15px] font-medium text-foreground" id="tailored-resume-heading">
        Tailored resume
      </h2>
      {resume ? (
        <div className="mt-3 space-y-2">
          <ResumeLayoutBadge check={resume.layout_check} />
          <p className="text-[13px] text-foreground-secondary">
            {resume.template ? `${TEMPLATE_LABELS[resume.template] ?? resume.template} template` : "Template not set"}
            {` · ${resume.builds_left} ${resume.builds_left === 1 ? "build" : "builds"} left`}
          </p>
          <ResumeActions resume={resume} />
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-foreground-secondary">No resume built for this posting yet.</p>
      )}

      {usage.calls ? (
        <div className="mt-5">
          <h3 className="text-[13px] font-medium text-foreground">
            Estimated usage: about {usage.estimated_tokens.toLocaleString("en-US")} tokens
          </h3>
          <p className="mt-0.5 text-[12px] text-foreground-secondary">
            From what Interndex tools returned in this posting&apos;s runs (bytes / 4).
          </p>
          <ul className="mt-2 space-y-0.5 text-[13px] text-foreground-secondary">
            {usage.by_tool.map((entry) => (
              <li className="flex justify-between gap-4" key={entry.tool}>
                <span>
                  {entry.tool}
                  {entry.calls > 1 ? ` (${entry.calls} calls)` : ""}
                </span>
                <span className="tabular-nums">{entry.estimated_tokens.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
