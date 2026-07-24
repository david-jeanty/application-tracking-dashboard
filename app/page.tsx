import { redirect } from "next/navigation";
import { hasSupabaseEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (!hasSupabaseEnvironment()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
