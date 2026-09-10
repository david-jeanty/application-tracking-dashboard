import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePage } from "@/components/public/home-page";
import { hasSupabaseEnvironment } from "@/lib/env";
import {
  HOMEPAGE_SOCIAL_DESCRIPTION,
  HOMEPAGE_SOCIAL_IMAGE,
  HOMEPAGE_SOCIAL_IMAGE_ALT,
  HOMEPAGE_SOCIAL_TITLE,
} from "@/lib/metadata/homepage-social";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Interndex: Keep your job search in one place",
  description:
    "Save internship and co-op opportunities from anywhere. The Interndex Chrome extension captures jobs across most career sites and is most accurate on LinkedIn, Indeed, and Workday. Track every application and deadline, and connect an MCP-compatible AI when you want help.",
  openGraph: {
    title: HOMEPAGE_SOCIAL_TITLE,
    description: HOMEPAGE_SOCIAL_DESCRIPTION,
    url: "https://www.interndex.dev",
    siteName: "Interndex",
    images: [
      {
        url: HOMEPAGE_SOCIAL_IMAGE,
        width: 1200,
        height: 630,
        alt: HOMEPAGE_SOCIAL_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: HOMEPAGE_SOCIAL_TITLE,
    description: HOMEPAGE_SOCIAL_DESCRIPTION,
    images: [
      {
        url: HOMEPAGE_SOCIAL_IMAGE,
        alt: HOMEPAGE_SOCIAL_IMAGE_ALT,
      },
    ],
  },
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
