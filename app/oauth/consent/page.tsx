import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ConsentForm } from "@/components/oauth/consent-form";
import {
  ASSISTANT_CAN,
  ASSISTANT_CANNOT,
  ASSISTANT_OWNERSHIP_NOTE,
} from "@/lib/mcp/capabilities";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Authorize access" };

function Problem({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-foreground">
          This request cannot be completed
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">{message}</p>
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
        <span className="grid size-12 place-items-center rounded-record bg-accent-soft text-accent">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>

        <h1 className="mt-5 text-xl font-semibold text-foreground">
          Allow {data.client.name} to connect to Interndex?
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          Signed in as <span className="font-medium">{data.user.email}</span>.
        </p>

        <div className="mt-6 rounded-record border border-border bg-surface-muted p-4">
          <h2 className="text-sm font-semibold text-foreground">
            {data.client.name} will be able to
          </h2>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground-secondary">
            {ASSISTANT_CAN.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
          <h2 className="mt-4 text-sm font-semibold text-foreground">
            It will not be able to
          </h2>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground-secondary">
            {ASSISTANT_CANNOT.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-foreground-muted">
            {ASSISTANT_OWNERSHIP_NOTE} You can disconnect it at any time from
            Interndex settings.
          </p>
        </div>

        <div className="mt-6">
          <ConsentForm authorizationId={data.authorization_id} />
        </div>

        <p className="mt-4 break-words text-xs leading-5 text-foreground-muted">
          You will be returned to {data.redirect_uri}
        </p>
      </Card>
    </main>
  );
}
