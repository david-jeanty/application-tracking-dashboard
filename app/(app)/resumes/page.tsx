import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ResumeList, ResumeListEmptyState } from "@/components/agent/resume-list";
import { Notice } from "@/components/ui/notice";
import { isAgentOwner } from "@/lib/agent/owner";
import { listTailoredResumes } from "@/lib/agent/resumes-repository";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resumes" };

/**
 * The recruiting agent's built resumes. Owner only: for every other account
 * this page does not exist (404) and no query runs.
 */
export default async function ResumesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAgentOwner(user.id)) notFound();

  const { data, error } = await listTailoredResumes(supabase, user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Resumes
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-foreground-secondary">
          Every resume the agent built, newest first. Open a PDF to review it while you apply.
        </p>
      </div>

      {error ? (
        <Notice heading="Resumes could not be loaded" tone="error">
          Nothing has been lost. Refresh the page to try again.
        </Notice>
      ) : data?.length ? (
        <ResumeList resumes={data} />
      ) : (
        <ResumeListEmptyState />
      )}
    </div>
  );
}
