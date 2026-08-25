import { NextResponse } from "next/server";
import {
  createApplication,
  findApplicationByExactUrl,
} from "@/lib/applications/repository";
import { authenticateBearerRequest } from "@/lib/auth/bearer-identity";
import { runBrowserCapture } from "@/lib/browser-capture/capture";

function unauthorized() {
  return NextResponse.json(
    { status: "unauthorized" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    },
  );
}

/**
 * Saves the one posting an authenticated student explicitly asked a future
 * browser extension to capture. The endpoint does not inspect a page, infer
 * fields, or perform any background work.
 */
export async function POST(request: Request) {
  const identity = await authenticateBearerRequest(request);
  if (!identity) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        status: "invalid",
        issues: [{ path: "", message: "Request body must be valid JSON." }],
      },
      { status: 400 },
    );
  }

  const result = await runBrowserCapture(payload, identity.userId, {
    findApplicationByExactUrl: (userId, applicationUrl) =>
      findApplicationByExactUrl(identity.supabase, userId, applicationUrl),
    createApplication: (input) =>
      createApplication(identity.supabase, input),
  });

  if (result.outcome === "invalid") {
    return NextResponse.json(
      { status: result.outcome, issues: result.issues },
      { status: 400 },
    );
  }

  if (result.outcome === "already_tracked") {
    return NextResponse.json(
      { status: result.outcome, application: result.application },
      { status: 409 },
    );
  }

  if (result.outcome === "error") {
    return NextResponse.json(
      { status: "error", message: "The application could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { status: result.outcome, application: result.application },
    { status: 201 },
  );
}
