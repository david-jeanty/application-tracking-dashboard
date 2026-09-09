"use client";

import { LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { createClient } from "@/lib/supabase/client";

/**
 * What the API route's `status` becomes on screen. Every code path it can
 * return is named here on purpose, so a status this form does not recognize
 * — a deploy skew, a future outcome nobody wired up yet — still reads as the
 * generic message rather than nothing.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_password: "That password is incorrect. Check it and try again.",
  forbidden: "This confirmation does not match your signed-in account.",
  unauthenticated:
    "Your session has expired. Sign in again to delete your account.",
  not_configured:
    "Account deletion is not available right now. Try again later.",
};

const DEFAULT_ERROR_MESSAGE =
  "Your account could not be deleted. Try again in a moment.";

/**
 * The one form on Interndex that calls a JSON API route directly rather than
 * posting to a Server Action.
 *
 * Every other destructive control in the app — deleting an application,
 * disconnecting an assistant — is a plain form bound to a Server Action, and
 * gets Next.js's automatic same-origin protection for free. Account deletion
 * is deliberately built the other way: the actual privileged call lives in
 * `app/api/account/delete/route.ts`, a server-only route that never runs
 * without a session and never trusts a client-supplied id, so it can be
 * exercised and tested on its own, apart from any particular caller. This
 * form is that route's one caller today.
 *
 * Success clears whatever the browser still holds locally and leaves for the
 * login page — the account genuinely no longer exists by then, so nothing
 * here can render a state that depends on it.
 */
export function DeleteAccountForm({
  email,
  userId,
}: {
  email: string;
  userId: string;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const status =
          body && typeof body === "object" && "status" in body
            ? String((body as { status: unknown }).status)
            : undefined;
        setErrorMessage(
          (status && ERROR_MESSAGES[status]) ?? DEFAULT_ERROR_MESSAGE,
        );
        setPending(false);
        return;
      }

      // The account is already gone server-side; this only clears what the
      // browser still holds for it. A full navigation, not client routing, so
      // no cached page keeps rendering as if the session were still good.
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
      window.location.href = "/login?deleted=true";
    } catch {
      setErrorMessage(DEFAULT_ERROR_MESSAGE);
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      {errorMessage ? (
        <Notice aria-live="polite" role="alert" tone="error">
          {errorMessage}
        </Notice>
      ) : null}

      <div>
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="delete-account-password"
        >
          Confirm your password
        </label>
        <p className="mt-1 text-[13px] leading-5 text-foreground-secondary">
          Enter the password for {email} to confirm this is your account.
        </p>
        <Input
          autoComplete="current-password"
          id="delete-account-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ButtonLink href="/settings" variant="secondary">
          Cancel
        </ButtonLink>
        <Button
          className="w-full sm:w-auto"
          disabled={pending || password.length === 0}
          type="submit"
          variant="danger"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {pending ? "Deleting…" : "Delete my account permanently"}
        </Button>
      </div>
    </form>
  );
}
