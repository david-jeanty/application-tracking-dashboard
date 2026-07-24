export const protectedRoutes = [
  "/dashboard",
  "/applications",
  "/pipeline",
  "/analytics",
  "/archive",
  "/settings",
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

export function safePostAuthPath(value: string | null): string {
  if (!value || !isProtectedPath(value) || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function safeAuthCallbackPath(value: string | null): string {
  if (value === "/reset-password") return value;
  return safePostAuthPath(value);
}
