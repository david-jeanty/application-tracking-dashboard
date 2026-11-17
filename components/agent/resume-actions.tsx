import type { ResumeListItem } from "@/lib/agent/resumes-repository";

const linkClass =
  "text-[13px] text-accent underline-offset-4 hover:text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/**
 * Open and Download for the PDF, or Print for the stored HTML when the server
 * could not print it, plus the resume.lol link for design tweaks.
 */
export function ResumeActions({ resume }: { resume: ResumeListItem }) {
  const record = `${resume.role} at ${resume.company}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {resume.has_pdf ? (
        <>
          <a aria-label={`Open the resume PDF for ${record}`} className={linkClass} href={`/resumes/${resume.id}/pdf`} rel="noreferrer" target="_blank">
            Open
          </a>
          <a aria-label={`Download the resume PDF for ${record}`} className={linkClass} href={`/resumes/${resume.id}/pdf?download=1`}>
            Download
          </a>
        </>
      ) : resume.has_html ? (
        <a aria-label={`Open the printable resume for ${record}`} className={linkClass} href={`/resumes/${resume.id}/print`} rel="noreferrer" target="_blank">
          Open to print
        </a>
      ) : null}
      {resume.resumelol_url ? (
        <a className={linkClass} href={resume.resumelol_url} rel="noreferrer" target="_blank">
          Edit design in resume.lol
        </a>
      ) : null}
    </div>
  );
}
