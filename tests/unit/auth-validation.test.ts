import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/auth";

describe("authentication validation", () => {
  it("accepts valid signup input and trims the name", () => {
    const result = signupSchema.parse({
      fullName: "  Alex Smith  ",
      email: "alex@example.com",
      password: "correct-horse",
      termsAccepted: "on",
    });
    expect(result.fullName).toBe("Alex Smith");
  });

  it("rejects signup when the terms checkbox was never checked", () => {
    // An unchecked HTML checkbox is simply absent from FormData, so the key
    // is missing entirely rather than present with a falsy value.
    const result = signupSchema.safeParse({
      fullName: "Alex Smith",
      email: "alex@example.com",
      password: "correct-horse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a forged non-'on' terms value the same way", () => {
    const result = signupSchema.safeParse({
      fullName: "Alex Smith",
      email: "alex@example.com",
      password: "correct-horse",
      termsAccepted: "false",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed login details", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "short" }).success,
    ).toBe(false);
  });

  it("accepts a valid recovery email", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "student@example.com" }).success,
    ).toBe(true);
  });

  it("requires reset passwords to match", () => {
    const result = resetPasswordSchema.safeParse({
      password: "new-password",
      confirmPassword: "different-password",
    });
    expect(result.success).toBe(false);
  });
});
