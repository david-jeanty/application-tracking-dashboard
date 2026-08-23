"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ConsentDecisionState = { status: "idle" | "error"; message?: string };

const FAILED = {
  status: "error",
  message:
    "That authorization request could not be completed. Return to Claude and start the connection again.",
} as const satisfies ConsentDecisionState;

/**
 * Records the signed-in user's decision on an OAuth authorization request.
 *
 * This is a Server Action rather than a route handler so Next.js applies its
 * origin checks: approving access to a user's own data is exactly the kind of
 * state change a cross-site form post must not be able to trigger.
 *
 * Supabase resolves the decision and returns the URL to send the user back to,
 * carrying an authorization code on approval or an `access_denied` error on
 * denial. We never construct that URL ourselves.
 */
export async function decideConsentAction(
  _state: ConsentDecisionState,
  formData: FormData,
): Promise<ConsentDecisionState> {
  const authorizationId = String(formData.get("authorizationId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");

  if (!authorizationId) return FAILED;
  if (decision !== "approve" && decision !== "deny") return FAILED;

  const supabase = await createClient();

  // The consent screen is a protected route, but re-check here: this action is
  // its own entry point and must not rely on the page having guarded it.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return FAILED;

  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });

  if (error || !data?.redirect_url) return FAILED;

  redirect(data.redirect_url);
}

/** Where a disconnect always returns to. Never taken from the request. */
const SETTINGS_PATH = "/settings";

/** Outcome codes the settings page turns into a message. */
export type DisconnectOutcome = "done" | "error" | "invalid";

/**
 * Revokes one AI client's access to the signed-in student's tracker.
 *
 * Supabase owns revocation: `revokeGrant` marks the consent revoked, drops that
 * client's sessions, and invalidates its refresh tokens. Nothing here stores or
 * invalidates a token itself, so there is no second, drifting source of truth
 * about who still has access.
 *
 * Like `decideConsentAction` this is a Server Action, so Next.js applies its
 * origin checks and a cross-site form post cannot disconnect somebody's
 * assistant. It re-establishes the user rather than trusting the page that
 * rendered the form, takes only the client id Supabase needs, and always
 * returns to a fixed internal path — no redirect destination is accepted from
 * the caller.
 */
export async function revokeGrantAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") ?? "").trim();

  // Supabase identifies an OAuth client by UUID; anything else is not a
  // request worth sending upstream.
  if (!z.uuid().safeParse(clientId).success) {
    redirect(`${SETTINGS_PATH}?disconnect=invalid`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${SETTINGS_PATH}`);

  // Scoped to the caller's own grants by the authenticated session: this
  // cannot revoke a grant belonging to another student.
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });

  if (error) redirect(`${SETTINGS_PATH}?disconnect=error`);

  // The grant list is rendered from Supabase on each request, so the page must
  // be re-fetched rather than served from the router cache.
  revalidatePath(SETTINGS_PATH);
  redirect(`${SETTINGS_PATH}?disconnect=done`);
}
