import { describe, expect, it } from "vitest";
import { parsePublicEnvironment } from "@/lib/env";

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_123456789012345678901234567890",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("parsePublicEnvironment", () => {
  it("accepts documented public configuration", () => {
    expect(parsePublicEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("reports all missing configuration in a useful error", () => {
    expect(() => parsePublicEnvironment({})).toThrowError(
      /Copy \.env\.example to \.env\.local/,
    );
  });

  it("rejects insecure production URLs", () => {
    expect(() =>
      parsePublicEnvironment({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co",
      }),
    ).toThrowError(/must use HTTPS/);
  });
});
