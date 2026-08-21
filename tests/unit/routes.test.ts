import { describe, expect, it } from "vitest";
import {
  isProtectedPath,
  safeAuthCallbackPath,
  safePostAuthPath,
} from "@/lib/routes";

describe("route helpers", () => {
  it.each([
    "/dashboard",
    "/applications",
    "/applications/example-id",
    "/applications/example-id/edit",
    "/pipeline",
    "/analytics",
    "/archive",
    "/settings",
  ])("recognizes %s as protected", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
  });

  it.each(["/", "/login", "/signup", "/auth/callback", "/dashboard-copy"])(
    "does not classify %s as protected",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
    },
  );

  it("accepts only internal protected post-auth destinations", () => {
    expect(safePostAuthPath("/applications")).toBe("/applications");
    expect(safePostAuthPath("https://malicious.example")).toBe("/dashboard");
    expect(safePostAuthPath("//malicious.example")).toBe("/dashboard");
    expect(safePostAuthPath("/login")).toBe("/dashboard");
    expect(safePostAuthPath(null)).toBe("/dashboard");
  });

  it("preserves the query string of an allowlisted destination", () => {
    expect(safePostAuthPath("/oauth/consent?authorization_id=abc-123")).toBe(
      "/oauth/consent?authorization_id=abc-123",
    );
    expect(safePostAuthPath("/applications?status=Applied")).toBe(
      "/applications?status=Applied",
    );
  });

  it("rejects redirects that a browser could read as another origin", () => {
    // A query string must never rescue a non-allowlisted path.
    expect(safePostAuthPath("/login?next=/dashboard")).toBe("/dashboard");
    // Backslashes are normalized to slashes by some browsers.
    expect(safePostAuthPath("/\\malicious.example")).toBe("/dashboard");
    expect(safePostAuthPath("\\\\malicious.example")).toBe("/dashboard");
    // A protected prefix must not authorize a different path.
    expect(safePostAuthPath("/dashboard-copy")).toBe("/dashboard");
    expect(safePostAuthPath("https://evil.example/dashboard")).toBe("/dashboard");
    expect(safePostAuthPath("/oauth/consent@evil.example")).toBe("/dashboard");
  });

  it("allows only the password-reset public route after an auth callback", () => {
    expect(safeAuthCallbackPath("/reset-password")).toBe("/reset-password");
    expect(safeAuthCallbackPath("/forgot-password")).toBe("/dashboard");
    expect(safeAuthCallbackPath("https://malicious.example")).toBe("/dashboard");
  });
});
