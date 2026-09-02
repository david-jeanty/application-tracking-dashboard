"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { AuthActionState } from "@/lib/auth/state";
import { initialAuthState } from "@/lib/auth/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

type AuthFormProps = {
  action: (
    state: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  kind: "login" | "signup" | "forgot" | "reset";
  nextPath?: string;
};

const content = {
  login: {
    submit: "Sign in",
    pending: "Signing in…",
  },
  signup: {
    submit: "Create account",
    pending: "Creating account…",
  },
  forgot: {
    submit: "Send reset link",
    pending: "Sending link…",
  },
  reset: {
    submit: "Update password",
    pending: "Updating password…",
  },
} as const;

function FieldError({
  id,
  errors,
}: {
  id: string;
  errors?: string[];
}) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1.5 text-sm text-danger" id={`${id}-error`}>
      {errors[0]}
    </p>
  );
}

export function AuthForm({ action, kind, nextPath }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialAuthState,
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const showsEmail = kind !== "reset";
  const showsPassword = kind === "login" || kind === "signup" || kind === "reset";
  const blockedOnConsent = kind === "signup" && !termsAccepted;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}

      {/*
        The same flat notice every other surface uses. The role and the live
        region are unchanged — only the box around them is.
      */}
      {state.message ? (
        <Notice
          aria-live="polite"
          role={state.status === "error" ? "alert" : "status"}
          tone={state.status === "success" ? "success" : "error"}
        >
          {state.message}
        </Notice>
      ) : null}

      {kind === "signup" ? (
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="fullName">
            Full name
          </label>
          <Input
            aria-describedby={
              state.fieldErrors?.fullName ? "fullName-error" : undefined
            }
            aria-invalid={Boolean(state.fieldErrors?.fullName)}
            autoComplete="name"
            id="fullName"
            name="fullName"
            placeholder="Alex Smith"
            required
          />
          <FieldError errors={state.fieldErrors?.fullName} id="fullName" />
        </div>
      ) : null}

      {showsEmail ? (
        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="email">
            Email address
          </label>
          <Input
            aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            autoComplete="email"
            id="email"
            inputMode="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          <FieldError errors={state.fieldErrors?.email} id="email" />
        </div>
      ) : null}

      {showsPassword ? (
        <div>
          <div className="flex items-center justify-between gap-4">
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="password"
            >
              {kind === "reset" ? "New password" : "Password"}
            </label>
            {kind === "login" ? (
              <Link
                className="rounded-sm text-sm text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>
          <Input
            aria-describedby={
              state.fieldErrors?.password ? "password-error" : undefined
            }
            aria-invalid={Boolean(state.fieldErrors?.password)}
            autoComplete={kind === "login" ? "current-password" : "new-password"}
            id="password"
            minLength={8}
            name="password"
            required
            type="password"
          />
          <FieldError errors={state.fieldErrors?.password} id="password" />
        </div>
      ) : null}

      {kind === "reset" ? (
        <div>
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="confirmPassword"
          >
            Confirm new password
          </label>
          <Input
            aria-describedby={
              state.fieldErrors?.confirmPassword
                ? "confirmPassword-error"
                : undefined
            }
            aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
            autoComplete="new-password"
            id="confirmPassword"
            name="confirmPassword"
            required
            type="password"
          />
          <FieldError
            errors={state.fieldErrors?.confirmPassword}
            id="confirmPassword"
          />
        </div>
      ) : null}

      {kind === "signup" ? (
        <div>
          <div className="flex items-start gap-2.5">
            <input
              checked={termsAccepted}
              className="mt-0.5 size-4 shrink-0 rounded-sm border border-border-strong text-accent accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              id="termsAccepted"
              name="termsAccepted"
              onChange={(event) => setTermsAccepted(event.target.checked)}
              required
              type="checkbox"
              value="on"
            />
            <label
              className="text-sm text-foreground-secondary"
              htmlFor="termsAccepted"
            >
              I agree to the{" "}
              <Link
                className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href="/terms"
                rel="noreferrer"
                target="_blank"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                className="rounded-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                href="/privacy"
                rel="noreferrer"
                target="_blank"
              >
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          <FieldError errors={state.fieldErrors?.termsAccepted} id="termsAccepted" />
        </div>
      ) : null}

      <Button
        className="w-full"
        disabled={pending || blockedOnConsent}
        type="submit"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {pending ? content[kind].pending : content[kind].submit}
      </Button>
    </form>
  );
}
