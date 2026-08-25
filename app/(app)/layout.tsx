import { redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell/app-shell";
import { hasSupabaseEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const metadataSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
});

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnvironment()) redirect("/login?reason=configuration");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const metadata = metadataSchema.safeParse(user.user_metadata);
  const email = user.email ?? "Signed-in user";
  const displayName =
    (metadata.success && metadata.data.full_name) ||
    email.split("@")[0] ||
    "Student";

  return (
    <AppShell identity={{ kind: "account", displayName, email }}>
      {children}
    </AppShell>
  );
}
