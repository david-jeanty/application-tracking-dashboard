import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnvironment, hasSupabaseEnvironment } from "@/lib/env";
import { isProtectedPath } from "@/lib/routes";

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseEnvironment()) {
    if (isProtectedPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "configuration");
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  const environment = getPublicEnvironment();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    // Keep the query string: the OAuth consent screen cannot resume without
    // its `authorization_id`. `safePostAuthPath` revalidates this on the way
    // back, so only an allowlisted internal path can be returned to.
    const destination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", destination);
    return NextResponse.redirect(url);
  }

  return response;
}
