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

  it("allows only the password-reset public route after an auth callback", () => {
    expect(safeAuthCallbackPath("/reset-password")).toBe("/reset-password");
    expect(safeAuthCallbackPath("/forgot-password")).toBe("/dashboard");
    expect(safeAuthCallbackPath("https://malicious.example")).toBe("/dashboard");
  });
});
