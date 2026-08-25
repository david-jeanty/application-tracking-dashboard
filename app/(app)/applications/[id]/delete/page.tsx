import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CompanyLogo } from "@/components/branding/company-logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { deleteApplicationAction } from "@/lib/applications/actions";
import { getApplicationById } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation/application";

export const metadata: Metadata = { title: "Delete application" };

/**
 * The confirmation step for permanent deletion.
 *
 * This is a route rather than a dialog because the codebase has no modal
 * primitive, and a server-rendered page needs no client JavaScript, no focus
 * trap, and no new dependency to be accessible. It also lets the company and
 * job title be read from the database under the caller's own identity, so the
 * record being confirmed is provably the record that will be deleted rather
 * than whatever a client passed along.
 *
 * Reaching it for an active application redirects instead of confirming.
 * That is a courtesy, not the guard: the delete statement itself requires
 * `archived_at is not null`, so a post that skips this page still cannot
 * remove an active record.
 */
export default async function DeleteApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsedId = applicationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: application, error } = await getApplicationById(
    supabase,
    user.id,
    parsedId.data,
  );
  if (error) throw new Error(`Application query failed (${error.code}).`);

  // Missing and owned-by-somebody-else are the same response, as everywhere.
  if (!application) notFound();

  // Deletion lives in the archive workflow only.
  if (!application.archived_at) redirect(`/applications/${application.id}`);

  return (
    <div className="mx-auto w-full max-w-xl">
      {/*
        Consequence carried by the words and by one destructive control, not by
        a red screen. The danger icon in a soft red box that used to open this
        page said nothing the heading beneath it did not, and it said it louder.
      */}
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-foreground">
        Permanently delete this application?
      </h1>
      <p className="mt-3 max-w-prose text-[15px] leading-7 text-foreground-secondary">
        This deletes the application and its status history. It cannot be
        undone.
      </p>

      {/*
        Enough of the record to be sure it is the right one. The role leads and
        the company follows it, matching the archive row the student pressed
        Delete permanently on to get here.
      */}
      <div className="mt-8 flex items-start gap-4 border-y border-border py-5">
        <CompanyLogo
          className="mt-0.5"
          companyName={application.company_name}
          domain={application.company_domain}
          size="md"
        />
        <div className="min-w-0">
          <p className="break-words text-[16px] font-medium leading-snug text-foreground">
            {application.original_job_title}
          </p>
          <p className="mt-0.5 break-words text-[13px] text-foreground-secondary">
            {application.company_name}
          </p>
        </div>
      </div>

      <p className="mt-5 max-w-prose text-[13px] leading-6 text-foreground-muted">
        If you only want it out of your list, go back and leave it archived
        instead — an archived application keeps its history and can be restored.
      </p>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href="/archive" variant="secondary">
          Cancel
        </ButtonLink>
        <form action={deleteApplicationAction}>
          <input name="applicationId" type="hidden" value={application.id} />
          <Button className="w-full sm:w-auto" type="submit" variant="danger">
            Delete permanently
          </Button>
        </form>
      </div>
    </div>
  );
}
