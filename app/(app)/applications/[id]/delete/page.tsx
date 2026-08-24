import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <div className="mx-auto max-w-xl space-y-6">
      <Card className="p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-record bg-danger-soft text-danger">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </span>

        <h1 className="mt-5 text-xl font-semibold text-foreground">
          Permanently delete this application?
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          This will permanently delete the application and its history. This
          cannot be undone.
        </p>

        <div className="mt-5 rounded-record border border-border bg-surface-muted p-4">
          <p className="font-semibold text-foreground">
            {application.company_name}
          </p>
          <p className="mt-1 text-sm text-foreground-secondary">
            {application.original_job_title}
          </p>
        </div>

        <p className="mt-4 text-sm leading-6 text-foreground-secondary">
          If you only want it out of your list, go back and leave it archived
          instead — an archived application keeps its history and can be
          restored.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
      </Card>
    </div>
  );
}
