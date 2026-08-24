import type { Metadata } from "next";
import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import {
  ConnectedClients,
  type ConnectedClient,
} from "@/components/settings/connected-clients";
import { Card } from "@/components/ui/card";
import {
  ASSISTANT_CAN,
  ASSISTANT_CANNOT,
  ASSISTANT_OWNERSHIP_NOTE,
} from "@/lib/mcp/capabilities";
import { getMcpResourceUrl } from "@/lib/supabase/bearer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

/** What the student can ask for once connected. Kept to the registered tools. */
const EXAMPLE_PROMPTS = [
  "Save this job to JobTrack.",
  "What RBC jobs am I tracking?",
  "Show me the details for that Business Analyst role.",
  "I applied to it today.",
  "Set my next action to follow up next Friday.",
];

const DISCONNECT_MESSAGES = {
  done: {
    tone: "success",
    text: "That assistant has been disconnected. It will need your approval again before it can reach your applications.",
  },
  error: {
    tone: "error",
    text: "That assistant could not be disconnected. Try again in a moment.",
  },
  invalid: {
    tone: "error",
    text: "That disconnect request was not valid. Try again from the list below.",
  },
} as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ disconnect?: string }>;
}) {
  const { disconnect } = await searchParams;
  const notice =
    disconnect && disconnect in DISCONNECT_MESSAGES
      ? DISCONNECT_MESSAGES[disconnect as keyof typeof DISCONNECT_MESSAGES]
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/settings");

  // Supabase is the source of truth for who has access. Nothing about a
  // connection is stored here, so this list cannot drift from reality.
  const { data: grants, error: grantsError } =
    await supabase.auth.oauth.listGrants();

  const clients: ConnectedClient[] = (grants ?? []).map((grant) => ({
    id: grant.client.id,
    name: grant.client.name,
    grantedAt: grant.granted_at,
  }));

  // The endpoint an MCP client is pointed at, derived from the one configured
  // origin rather than rebuilt here.
  const mcpUrl = getMcpResourceUrl();

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-foreground-secondary">
          Personalize JobTrack and manage connected assistants.
        </p>
      </header>

      <AppearanceSettings />

      <section aria-labelledby="assistants-heading" className="space-y-6">
        <div className="border-t border-border pt-5">
          <h2
            className="text-base font-semibold text-foreground"
            id="assistants-heading"
          >
            Connect an AI assistant
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-foreground-secondary">
            JobTrack works completely on its own. If you already use an AI
            assistant, you can also let it read and update your applications, so
            you stop retyping what you just discussed with it.
          </p>
        </div>

        {notice ? (
          <Card
            className={
              notice.tone === "success"
                ? "flex gap-3 border-success bg-success-soft p-4 text-success"
                : "flex gap-3 border-danger bg-danger-soft p-4 text-danger"
            }
            role="status"
          >
            {notice.tone === "success" ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
            ) : (
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            )}
            <p className="text-sm leading-6">{notice.text}</p>
          </Card>
        ) : null}

        <Card className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-foreground">
            How this works
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
            JobTrack does not provide an AI and never charges you for one. You
            bring an assistant you already have; JobTrack gives it your
            application data and the actions below. The reasoning happens in your
            assistant, and the record stays here.
          </p>

          <h4 className="mt-5 text-sm font-semibold text-foreground">
            Your JobTrack connection address
          </h4>
          <p className="mt-1 text-sm leading-6 text-foreground-secondary">
            Your assistant will ask for this. Copy it exactly.
          </p>
          <p className="mt-2 overflow-x-auto rounded-record border border-border bg-surface-muted px-3 py-2 font-mono text-sm text-foreground">
            {mcpUrl}
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-foreground">
            Setting it up in Claude
          </h3>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">
            Claude is the assistant this has been tested with. Other
            MCP-compatible assistants may work the same way, using the same
            address.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground-secondary marker:font-semibold marker:text-foreground-muted">
            <li>In Claude, open Settings, then Connectors.</li>
            <li>Choose to add a custom connector.</li>
            <li>Paste the connection address above.</li>
            <li>
              Claude will send you back here to sign in and approve access. Check
              the permissions, then choose Allow access.
            </li>
            <li>Return to Claude and start asking about your applications.</li>
          </ol>
          <p className="mt-4 text-sm leading-6 text-foreground-secondary">
            Some Claude accounts allow only one custom connector at a time.
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h3 className="text-base font-semibold text-foreground">
              Try saying
            </h3>
            <ul className="mt-3 space-y-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li
                  className="flex gap-2 text-sm leading-6 text-foreground-secondary"
                  key={prompt}
                >
                  <Sparkles
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-accent"
                  />
                  <span>&ldquo;{prompt}&rdquo;</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-base font-semibold text-foreground">
              What a connected assistant can do
            </h3>
            <ul className="mt-3 space-y-1 text-sm leading-6 text-foreground-secondary">
              {ASSISTANT_CAN.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
            <h4 className="mt-4 text-sm font-semibold text-foreground">
              What it cannot do
            </h4>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground-secondary">
              {ASSISTANT_CANNOT.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-foreground-muted">
              {ASSISTANT_OWNERSHIP_NOTE}
            </p>
          </Card>
        </div>

        <Card className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-foreground">
            Connected assistants
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
            Disconnecting takes access away immediately. Your applications are
            not affected — only the assistant&apos;s permission to reach them.
          </p>

          <div className="mt-4">
            {grantsError ? (
              <div className="flex gap-3 rounded-record border border-danger bg-danger-soft p-4 text-danger">
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                <p className="text-sm leading-6">
                  Your connected assistants could not be loaded. Refresh the page
                  to try again.
                </p>
              </div>
            ) : (
              <ConnectedClients clients={clients} />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
