import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import { DemoBanner } from "@/components/demo/demo-banner";

/**
 * The demo is rebuilt at most once an hour.
 *
 * It has to be, rather than being prerendered once: every date in the fixture
 * is an offset from the day it is generated on, so a demo baked at build time
 * would show a search that stopped moving the day it was deployed — deadlines
 * drifting into the past, "this week" permanently empty, activity ending months
 * ago. An hour is close enough that no visitor sees a stale day, and cheap
 * enough that a public page is still served from cache.
 *
 * Declared on the layout so every route beneath it inherits the same policy.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { default: "Interndex demo", template: "%s · Interndex demo" },
  description:
    "Explore Interndex with a sample internship and co-op search. No account required.",
};

/**
 * The demo workspace's frame.
 *
 * The same `AppShell` the authenticated workspace uses, told that this is the
 * demo: four navigation rows instead of six, and a foot that offers an account
 * rather than a way out of one. Nothing here reads a cookie, a session, or the
 * database, and none of it needs Supabase to be configured at all.
 */
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell identity={{ kind: "demo" }}>
      <div className="space-y-8">
        <DemoBanner />
        {children}
      </div>
    </AppShell>
  );
}
