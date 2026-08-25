import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import {
  ConnectedClients,
  type ConnectedClient,
} from "@/components/settings/connected-clients";
import { Notice } from "@/components/ui/notice";
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
  "Import this old tracker into JobTrack.",
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

/**
 * One part of the page, below the section it belongs to.
 *
 * A heading and the space under it. These used to be five separate `Card`s,
 * which made a paragraph about how connectors work look like a bounded object
 * a student could act on. Nothing here is an object; it is an explanation, and
 * an explanation needs a heading, not a box.
 */
function Subsection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

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
      <div>
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-foreground-secondary">
          Personalize JobTrack and manage connected assistants.
        </p>
      </div>

      <AppearanceSettings />

      <section aria-labelledby="assistants-heading" className="space-y-8">
        <div>
          <div className="border-b border-border pb-2">
            <h2
              className="text-[17px] font-medium text-foreground"
              id="assistants-heading"
            >
              Connected assistant
            </h2>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-foreground-secondary">
            JobTrack works completely on its own. If you already use an AI
            assistant, you can also let it read and update your applications, so
            you stop retyping what you just discussed with it.
          </p>
        </div>

        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <Subsection title="How this works">
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
            JobTrack does not provide an AI and never charges you for one. You
            bring an assistant you already have; JobTrack gives it your
            application data and the actions below. The reasoning happens in your
            assistant, and the record stays here.
          </p>

          <h4 className="mt-5 text-sm font-medium text-foreground">
            Your JobTrack connection address
          </h4>
          <p className="mt-1 text-sm leading-6 text-foreground-secondary">
            Your assistant will ask for this. Copy it exactly.
          </p>
          {/*
            The one bounded thing on this page, and it earns the box: it is a
            literal value the student has to select and copy, so its edges say
            where it begins and ends.
          */}
          <p className="mt-2 max-w-2xl overflow-x-auto rounded-record border border-border bg-surface-muted px-3 py-2 font-mono text-[13px] text-foreground">
            {mcpUrl}
          </p>
        </Subsection>

        <Subsection title="Setting it up in Claude">
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
            Claude is the assistant this has been tested with. Other
            MCP-compatible assistants may work the same way, using the same
            address.
          </p>
          <ol className="mt-4 max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground-secondary marker:text-foreground-muted">
            <li>In Claude, open Settings, then Connectors.</li>
            <li>Choose to add a custom connector.</li>
            <li>Paste the connection address above.</li>
            <li>
              Claude will send you back here to sign in and approve access. Check
              the permissions, then choose Allow access.
            </li>
            <li>Return to Claude and start asking about your applications.</li>
          </ol>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-foreground-secondary">
            Some Claude accounts allow only one custom connector at a time.
          </p>
        </Subsection>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
          <Subsection title="Try saying">
            {/*
              The prompts, and nothing beside them. Each line used to carry an
              accent sparkle, which decorated a sentence that is already a
              quotation and made this the only place in JobTrack that dresses
              its content up.
            */}
            <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground-secondary">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <li key={prompt}>&ldquo;{prompt}&rdquo;</li>
              ))}
            </ul>
            {/*
              One sentence, beside the prompts it belongs with. The spreadsheet
              never comes to JobTrack — it goes to the assistant, which reads it
              and sends back finished applications — so there is no upload
              control here to add.
            */}
            <p className="mt-4 text-sm leading-6 text-foreground-secondary">
              Already have a tracker? Export it as a CSV, upload that to your
              connected assistant, and ask it to import the tracker into
              JobTrack. It will check the columns and dates with you first.
            </p>
          </Subsection>

          <Subsection title="What a connected assistant can do">
            <ul className="mt-3 space-y-1 text-sm leading-6 text-foreground-secondary">
              {ASSISTANT_CAN.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
            <h4 className="mt-4 text-sm font-medium text-foreground">
              What it cannot do
            </h4>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-foreground-secondary">
              {ASSISTANT_CANNOT.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-6 text-foreground-muted">
              {ASSISTANT_OWNERSHIP_NOTE}
            </p>
          </Subsection>
        </div>

        <Subsection title="Assistants you have connected">
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
            Disconnecting takes access away immediately. Your applications are
            not affected — only the assistant&apos;s permission to reach them.
          </p>

          <div className="mt-4">
            {grantsError ? (
              <Notice tone="error">
                Your connected assistants could not be loaded. Refresh the page
                to try again.
              </Notice>
            ) : (
              <ConnectedClients clients={clients} />
            )}
          </div>
        </Subsection>
      </section>
    </div>
  );
}
