import { z } from "zod";

const email = z
  .email("Enter a valid email address.")
  .max(254, "Email address is too long.");

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.");

export const loginSchema = z.object({
  email,
  password,
});

const TERMS_ACCEPTANCE_MESSAGE =
  "You must agree to the Terms of Service and Privacy Policy to create an account.";

const termsAccepted = z
  .string({ error: TERMS_ACCEPTANCE_MESSAGE })
  .refine((value) => value === "on", { message: TERMS_ACCEPTANCE_MESSAGE });

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(120, "Full name must be 120 characters or fewer."),
  email,
  password,
  termsAccepted,
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
