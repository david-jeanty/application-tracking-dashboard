import { NextResponse } from "next/server";
import { hasSupabaseEnvironment } from "@/lib/env";
import { safeAuthCallbackPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAuthCallbackPath(url.searchParams.get("next"));

  if (!code || !hasSupabaseEnvironment()) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_callback", url.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_callback", url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
