import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ApplicationEditForm } from "@/components/applications/application-edit-form";
import { ButtonLink } from "@/components/ui/button";
import { toApplicationFormValues } from "@/lib/applications/mapper";
import { getApplicationById } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation/application";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage({
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
  if (!application) notFound();

  return (
    <div className="space-y-6">
      <ButtonLink
        className="w-fit px-3"
        href={`/applications/${application.id}`}
        variant="ghost"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Application details
      </ButtonLink>

      <div>
        <p className="text-sm font-semibold text-blue-700">Application</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          Edit application
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Update {application.company_name} — {application.original_job_title}.
          If this record changed after the page loaded, you will be asked to
          review the latest version before saving.
        </p>
      </div>

      <ApplicationEditForm
        applicationId={application.id}
        defaultValues={toApplicationFormValues(application)}
        expectedUpdatedAt={application.updated_at}
      />
    </div>
  );
}
