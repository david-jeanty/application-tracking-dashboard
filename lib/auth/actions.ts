"use server";

import { redirect } from "next/navigation";
import { getPublicEnvironment, hasSupabaseEnvironment } from "@/lib/env";
import { safePostAuthPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/lib/auth/state";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validation/auth";

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function invalidState(
  fieldErrors: Record<string, string[] | undefined>,
): AuthActionState {
  return {
    status: "error",
    message: "Review the highlighted fields and try again.",
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors).filter(
        (entry): entry is [string, string[]] => Boolean(entry[1]),
      ),
    ),
  };
}

function configurationError(): AuthActionState {
  return {
    status: "error",
    message:
      "Authentication is not configured yet. Add the Supabase values described in .env.example.",
  };
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse(values(formData));
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!hasSupabaseEnvironment()) return configurationError();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      status: "error",
      message: "Email or password is incorrect. Check both fields and try again.",
    };
  }

  redirect(safePostAuthPath(String(formData.get("next") ?? "")));
}

export async function signupAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse(values(formData));
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!hasSupabaseEnvironment()) return configurationError();

  const environment = getPublicEnvironment();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${environment.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return {
      status: "error",
      message: "We could not create the account. Check the details and try again.",
    };
  }

  if (data.session) redirect("/dashboard");

  return {
    status: "success",
    message:
      "Check your email to confirm your account. You can then return here to sign in.",
  };
}

export async function forgotPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse(values(formData));
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!hasSupabaseEnvironment()) return configurationError();

  const environment = getPublicEnvironment();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${environment.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  return {
    status: "success",
    message:
      "If an account exists for that email, a password-reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse(values(formData));
  if (!parsed.success) return invalidState(parsed.error.flatten().fieldErrors);
  if (!hasSupabaseEnvironment()) return configurationError();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message: "This reset link is invalid or expired. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      status: "error",
      message: "The password could not be updated. Request a new reset link.",
    };
  }

  return {
    status: "success",
    message: "Your password has been updated. You can now return to the dashboard.",
  };
}

export async function signOutAction() {
  if (hasSupabaseEnvironment()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
