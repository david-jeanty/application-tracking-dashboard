import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ConsentForm } from "@/components/oauth/consent-form";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Authorize access" };

function Problem({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-950">
          This request cannot be completed
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      </Card>
    </main>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const authorizationId = (await searchParams).authorization_id?.trim();

  if (!authorizationId) {
    return (
      <Problem message="No authorization request was supplied. Start the connection again from the application you are connecting." />
    );
  }

  const supabase = await createClient();

  // The proxy already guards this route, but the identity granting access is
  // the whole point of the screen, so confirm it here too.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !data) {
    return (
      <Problem message="This authorization request is invalid or has expired. Start the connection again." />
    );
  }

  // Already consented to these scopes: Supabase hands back a finished redirect.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>

        <h1 className="mt-5 text-xl font-semibold text-slate-950">
          Allow {data.client.name} to use your tracker?
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Signed in as <span className="font-medium">{data.user.email}</span>.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {data.client.name} will be able to
          </h2>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
            <li>Read the job applications in your tracker</li>
            <li>Add and update job applications on your behalf</li>
          </ul>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            It can only ever see your own applications, never another
            student&apos;s. You can revoke this access at any time.
          </p>
        </div>

        <div className="mt-6">
          <ConsentForm authorizationId={data.authorization_id} />
        </div>

        <p className="mt-4 break-words text-xs leading-5 text-slate-500">
          You will be returned to {data.redirect_uri}
        </p>
      </Card>
    </main>
  );
}
