"use server";

import { redirect } from "next/navigation";
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
