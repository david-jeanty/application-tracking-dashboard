import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ConsentForm } from "@/components/oauth/consent-form";
import {
  ASSISTANT_CAN,
  ASSISTANT_CANNOT,
  ASSISTANT_OWNERSHIP_NOTE,
} from "@/lib/mcp/capabilities";
import {
  describeRedirectTarget,
  displayClientName,
} from "@/lib/oauth/client-display";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Authorize access" };

/**
 * The one sentence this screen exists to say.
 *
 * Fixed text, never assembled from anything the request carried, and rendered
 * on every authorization without exception — there is no verified-client case
 * that suppresses it, because Interndex verifies no clients. It sits directly
 * above the buttons because that is where a decision is actually made; a
 * caution at the top of a card is read as decoration.
 */
const UNVERIFIED_WARNING =
  "Interndex has not verified this application. Only continue if you started this connection yourself.";

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

  /*
    Both of these are written by whoever registered the client, and dynamic
    registration means that is anybody. `lib/oauth/client-display.ts` bounds
    them; everything below treats them as a claim the request is making rather
    than as a fact Interndex is asserting.
  */
  const clientName = displayClientName(data.client.name);
  const redirectTarget = describeRedirectTarget(data.redirect_uri);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full p-6 sm:p-8">
        <span className="grid size-12 place-items-center rounded-record bg-accent-soft text-accent">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>

        {/*
          The heading is Interndex's own words and holds no value from the
          request. It used to read "Allow {client name} to connect to
          Interndex?", which put a string an attacker chose into the largest,
          most authoritative type on the page — a registration named
          "Interndex Capture (official)" was rendered by this product as
          though Interndex were vouching for it. What the client called itself
          is below, presented as the claim it is.
        */}
        <h1 className="mt-5 text-xl font-semibold text-foreground">
          Authorize access to your Interndex account
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          Signed in as <span className="font-medium">{data.user.email}</span>.
        </p>

        <div className="mt-6 rounded-record border border-border bg-surface-muted p-4">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-foreground-muted">
            Application requesting access
          </h2>
          {/*
            Neutral type, and `break-words` so a long unbroken name wraps
            inside its box instead of widening the card. A client that
            registered without a name is said so about rather than given one.
          */}
          {clientName ? (
            <>
              <p className="mt-1 break-words text-[15px] text-foreground">
                {clientName}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-foreground-muted">
                This name was chosen by the application, not by Interndex.
              </p>
            </>
          ) : (
            // No name means there is nothing to attribute, so the caveat about
            // who chose it would be describing something that is not there.
            <p className="mt-1 text-[15px] text-foreground-muted">
              This application did not provide a name.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-record border border-border bg-surface-muted p-4">
          <h2 className="text-sm font-semibold text-foreground">
            It will be able to
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

        {/*
          The last thing read before the decision: the caution, then the one
          fact that distinguishes a connection the student started from one
          somebody else did. The destination used to be the final line of the
          card, below the buttons, where it was neither read nor reachable
          without scrolling past the thing it was meant to inform.
        */}
        <Notice className="mt-6" role="note" tone="warning">
          <p className="font-medium">{UNVERIFIED_WARNING}</p>
          <p className="mt-2">
            Allowing access sends you, and a key to this account, to{" "}
            {redirectTarget.host ? (
              <span className="break-all font-mono font-semibold">
                {redirectTarget.host}
              </span>
            ) : (
              <span className="font-semibold">an address that is not a valid web URL</span>
            )}
            .
          </p>
          <p className="mt-1 break-all font-mono text-[12px] leading-5 opacity-80">
            {redirectTarget.url}
          </p>
        </Notice>

        <div className="mt-4">
          <ConsentForm authorizationId={data.authorization_id} />
        </div>
      </Card>
    </main>
  );
}
