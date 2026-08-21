export const protectedRoutes = [
  "/dashboard",
  "/applications",
  "/pipeline",
  "/analytics",
  "/archive",
  "/settings",
  // The OAuth consent screen must know who is granting access, so it is
  // protected like any other authenticated page.
  "/oauth/consent",
] as const;

export const publicAuthRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Resolves a post-authentication destination to an internal path.
 *
 * Only the allowlisted protected routes are accepted, so a crafted `next`
 * value cannot bounce a freshly signed-in user to another origin. A query
 * string is preserved when the path itself is allowlisted, because the OAuth
 * consent screen carries its `authorization_id` that way; the query cannot
 * change the destination host, only the internal page's parameters.
 */
export function safePostAuthPath(value: string | null): string {
  if (!value) return "/dashboard";

  // Reject protocol-relative (`//host`) and backslash forms that some browsers
  // normalize into an absolute URL, plus anything not clearly path-relative.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }

  const separator = value.indexOf("?");
  const pathname = separator === -1 ? value : value.slice(0, separator);
  const query = separator === -1 ? "" : value.slice(separator);

  if (!isProtectedPath(pathname)) return "/dashboard";

  return `${pathname}${query}`;
}

export function safeAuthCallbackPath(value: string | null): string {
  if (value === "/reset-password") return value;
  return safePostAuthPath(value);
}
