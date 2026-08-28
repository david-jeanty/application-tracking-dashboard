import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePage } from "@/components/public/home-page";
import { hasSupabaseEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Interndex — Internship and co-op application tracker",
  description:
    "Track internship and co-op applications, deadlines, statuses and next actions, and connect the AI assistant you already use. Try the demo without an account.",
};

/**
 * The front door.
 *
 * Signed in, this is a shortcut: a student who has a workspace wants their
 * dashboard, not a page explaining the product to them.
 *
 * Signed out, it is the public homepage. It used to redirect to `/login`, which
 * meant the only way to find out what Interndex was involved deciding to join it
 * first.
 *
 * With no Supabase configuration there is no session to look for, so the
 * homepage renders. That branch is the reason the check is here rather than in
 * the proxy: a marketing page that 500s because a database is unreachable is a
 * marketing page nobody reads, and nothing on it needs one.
 */
export default async function RootPage() {
  if (!hasSupabaseEnvironment()) return <HomePage />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <HomePage />;
}
