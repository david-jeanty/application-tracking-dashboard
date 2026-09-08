/**
 * What a connected client can do with a real token, bypassing the app.
 *
 * The consent screen (`lib/mcp/capabilities.ts`) tells a student that a
 * client can see, add, and update their applications and cannot delete or
 * archive them. The token it is granted is an ordinary Supabase user token,
 * and nothing stops the holder calling PostgREST directly rather than
 * `/api/browser-capture` or the MCP tools. So this test does exactly that:
 *
 *   1. registers a public OAuth client the way the extension's is registered;
 *   2. signs up a student and obtains their ordinary session;
 *   3. runs the Authorization Code + PKCE flow the extension runs
 *      (`extension/src/auth.ts`), approving consent the way
 *      `lib/oauth/actions.ts` does, to obtain the client's access token;
 *   4. uses that token through the same `createBearerClient` the API layer
 *      uses, but against the tables directly, and asserts that deleting,
 *      archiving, restoring, and rewriting the profile are refused by the
 *      database — while capture, detail updates, and the student's own
 *      session keep working.
 *
 * The refusals come from `supabase/migrations/20260908000100_oauth_client_
 * authority.sql`, keyed on the `client_id` claim the authorization server
 * puts in the token. Step 3 is what proves that claim is really there, and
 * one case checks that `lib/auth/bearer-identity.ts` — the API layer's own
 * read of the same token, which MCP telemetry records — resolves that same
 * client id rather than a placeholder.
 *
 * Needs a running Supabase stack (`npm run db:start`) with the OAuth server
 * and dynamic client registration enabled, as `supabase/config.toml` does.
 * A stack that is not reachable fails the suite rather than skipping it: a
 * blocked check is not a passed one. The disposable student is deleted at
 * the end through the Auth admin API, so the pgTAP suite's whole-table
 * counts (`npm run test:db`) stay true on the same database. That needs
 * `SUPABASE_SERVICE_ROLE_KEY`, which the config defaults to the local
 * stack's demo key; against another project supply it the way the hosted
 * verifiers do — ephemerally, never in a file.
 */

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NO_OAUTH_CLIENT, verifyBearerToken } from "@/lib/auth/bearer-identity";
import { getPublicEnvironment } from "@/lib/env";
import { createBearerClient } from "@/lib/supabase/bearer";

const environment = getPublicEnvironment();
const SUPABASE_URL = environment.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const PUBLISHABLE_KEY = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** The shape of the redirect URI Chrome gives an extension. */
const REDIRECT_URI =
  "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";

/** SQLSTATE `insufficient_privilege`, which PostgREST reports as HTTP 403. */
const INSUFFICIENT_PRIVILEGE = "42501";

type BearerClient = ReturnType<typeof createBearerClient>;

type TokenClaims = { sub: string; role: string; client_id?: string };

function claimsOf(accessToken: string): TokenClaims {
  const [, payload] = accessToken.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenClaims;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/** Every request to the authorization server carries the publishable key. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: PUBLISHABLE_KEY, ...extra };
}

async function expectStackReachable(): Promise<void> {
  try {
    const health = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: authHeaders(),
    });
    if (health.ok) return;
    throw new Error(`health returned ${health.status}`);
  } catch (error) {
    throw new Error(
      `Supabase is not reachable at ${SUPABASE_URL} (${String(error)}). ` +
        "Start it with `npm run db:start` (Docker required); this suite is blocked, not passed, without it.",
    );
  }
}

/** Registers a public client, as the extension's dedicated client is. */
async function registerPublicClient(): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/oauth/clients/register`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      client_name: "Interndex Capture (authority test)",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  const body = (await response.json()) as { client_id?: string };
  if (!response.ok || !body.client_id) {
    throw new Error(`client registration failed: ${JSON.stringify(body)}`);
  }
  return body.client_id;
}

type Student = { userId: string; accessToken: string };

/** Removes the disposable student, and with them every row they own. */
async function deleteStudent(student: Student): Promise<void> {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set, so the disposable student was left behind; remove it before running `npm run test:db` on this database.",
    );
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${student.userId}`, {
    method: "DELETE",
    headers: authHeaders({ authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
  });
  if (!response.ok) {
    throw new Error(`deleting the disposable student failed: ${response.status}`);
  }
}

/**
 * A student with an ordinary web session, the kind the app itself holds.
 *
 * With a service-role key the student is created through the admin API,
 * already confirmed, so a project that requires email confirmation (as
 * production does) issues a session and sends no confirmation email to the
 * disposable address. Without one, the public sign-up is used, which only
 * yields a session where confirmation is off, as it is locally.
 */
async function signUpStudent(): Promise<Student> {
  const email = `oauth-authority-${Date.now()}-${randomBytes(4).toString("hex")}@example.test`;
  const password = `disposable-${randomBytes(12).toString("hex")}`;
  const anonymous = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (SERVICE_ROLE_KEY) {
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: authHeaders({
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
      }),
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!created.ok) {
      throw new Error(`creating the disposable student failed: ${created.status}`);
    }
    const { data, error } = await anonymous.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      throw new Error(`sign-in failed: ${error?.message ?? "no session returned"}`);
    }
    return { userId: data.user.id, accessToken: data.session.access_token };
  }

  const { data, error } = await anonymous.auth.signUp({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(
      `sign-up failed: ${error?.message ?? "no session returned (is email confirmation disabled locally?)"}`,
    );
  }
  return { userId: data.user.id, accessToken: data.session.access_token };
}

/** Removes the client registered for this run, so a real project keeps none. */
async function deleteClient(clientId: string): Promise<void> {
  if (!SERVICE_ROLE_KEY) return;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/oauth/clients/${clientId}`, {
    method: "DELETE",
    headers: authHeaders({ authorization: `Bearer ${SERVICE_ROLE_KEY}` }),
  });
  if (!response.ok) {
    throw new Error(`deleting the test OAuth client failed: ${response.status}`);
  }
}

/**
 * The Authorization Code + PKCE flow, end to end, returning the client's
 * access token. Each step is the one the real participants perform: the
 * extension builds the authorization request and exchanges the code; the
 * consent page reads the request's details; the approve action consents.
 */
async function grantAccess(clientId: string, student: Student): Promise<string> {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = base64Url(randomBytes(16));

  const authorize = new URL(`${SUPABASE_URL}/auth/v1/oauth/authorize`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", REDIRECT_URI);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const started = await fetch(authorize, {
    redirect: "manual",
    headers: authHeaders(),
  });
  const location = started.headers.get("location") ?? "";
  const authorizationId = new URL(location, SUPABASE_URL).searchParams.get(
    "authorization_id",
  );
  if (!authorizationId) {
    throw new Error(`authorization did not reach the consent screen: ${location}`);
  }

  const asStudent = authHeaders({ authorization: `Bearer ${student.accessToken}` });

  const details = await fetch(
    `${SUPABASE_URL}/auth/v1/oauth/authorizations/${authorizationId}`,
    { headers: asStudent },
  );
  if (!details.ok) {
    throw new Error(`authorization details failed: ${details.status}`);
  }

  const consent = await fetch(
    `${SUPABASE_URL}/auth/v1/oauth/authorizations/${authorizationId}/consent`,
    {
      method: "POST",
      headers: { ...asStudent, "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    },
  );
  const approved = (await consent.json()) as { redirect_url?: string };
  if (!consent.ok || !approved.redirect_url) {
    throw new Error(`consent failed: ${JSON.stringify(approved)}`);
  }

  const returned = new URL(approved.redirect_url);
  if (returned.searchParams.get("state") !== state) {
    throw new Error("the authorization response carried a different state");
  }
  const code = returned.searchParams.get("code");
  if (!code) throw new Error(`no authorization code in ${approved.redirect_url}`);

  const exchange = await fetch(`${SUPABASE_URL}/auth/v1/oauth/token`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const tokens = (await exchange.json()) as { access_token?: string };
  if (!exchange.ok || !tokens.access_token) {
    throw new Error(`token exchange failed: ${JSON.stringify(tokens)}`);
  }
  return tokens.access_token;
}

/** The minimal record browser capture stores. */
function application(company: string, extra: Record<string, unknown> = {}) {
  return {
    company_name: company,
    original_job_title: "Intern",
    normalized_job_category: "Other",
    location: "Remote",
    application_source: "Not specified",
    work_term_season: "Not specified",
    ...extra,
  };
}

async function insertAs(client: BearerClient, company: string, extra = {}) {
  const { data, error } = await client
    .from("applications")
    .insert(application(company, extra))
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`insert failed: ${error.code} ${error.message}`);
  return data.id;
}

async function archivedAtAs(client: BearerClient, id: string) {
  const { data, error } = await client
    .from("applications")
    .select("archived_at")
    .eq("id", id)
    .maybeSingle<{ archived_at: string | null }>();
  if (error) throw new Error(`read failed: ${error.code} ${error.message}`);
  return data === null ? "missing" : data.archived_at;
}

describe("a connected client's authority, with a real OAuth token against PostgREST", () => {
  let clientId: string;
  let student: Student;
  let web: BearerClient;
  let clientToken: string;
  let client: BearerClient;

  beforeAll(async () => {
    await expectStackReachable();
    clientId = await registerPublicClient();
    student = await signUpStudent();
    web = createBearerClient(student.accessToken);
    clientToken = await grantAccess(clientId, student);
    client = createBearerClient(clientToken);
  });

  afterAll(async () => {
    if (student) await deleteStudent(student);
    if (clientId) await deleteClient(clientId);
  });

  it("issues the client a token that names the client, unlike the student's own session", () => {
    expect(claimsOf(student.accessToken)).not.toHaveProperty("client_id");
    const claims = claimsOf(clientToken);
    expect(claims.sub).toBe(student.userId);
    expect(claims.role).toBe("authenticated");
    expect(claims.client_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("resolves that same client id at the API layer, where telemetry reads it", async () => {
    const identity = await verifyBearerToken(clientToken);
    expect(identity?.userId).toBe(student.userId);
    expect(identity?.clientId).toBe(claimsOf(clientToken).client_id);
    expect(identity?.clientId).not.toBe(NO_OAUTH_CLIENT);

    expect((await verifyBearerToken(student.accessToken))?.clientId).toBe(
      NO_OAUTH_CLIENT,
    );
  });

  it("cannot delete an application, even one the student already archived", async () => {
    const active = await insertAs(web, "Delete target (active)");
    const archived = await insertAs(web, "Delete target (archived)", {
      archived_at: new Date().toISOString(),
    });

    for (const id of [active, archived]) {
      const { data, error } = await client
        .from("applications")
        .delete()
        .eq("id", id)
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(await archivedAtAs(web, id)).not.toBe("missing");
    }
  });

  it("cannot archive an application", async () => {
    const id = await insertAs(web, "Archive target");

    const { error, status } = await client
      .from("applications")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");

    expect(status).toBe(403);
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await archivedAtAs(web, id)).toBeNull();
  });

  it("cannot restore an archived application", async () => {
    const archivedAt = new Date().toISOString();
    const id = await insertAs(web, "Restore target", { archived_at: archivedAt });

    const { error, status } = await client
      .from("applications")
      .update({ archived_at: null })
      .eq("id", id)
      .select("id");

    expect(status).toBe(403);
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await archivedAtAs(web, id)).not.toBeNull();
  });

  it("cannot create an application that is born archived", async () => {
    const { error, status } = await client
      .from("applications")
      .insert(application("Pre-archived", { archived_at: new Date().toISOString() }))
      .select("id");

    expect(status).toBe(403);
    expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("cannot rewrite or remove the student's profile", async () => {
    const renamed = await client
      .from("profiles")
      .update({ full_name: "Renamed by a client" })
      .eq("user_id", student.userId)
      .select("user_id");
    expect(renamed.error).toBeNull();
    expect(renamed.data).toEqual([]);

    const removed = await client
      .from("profiles")
      .delete()
      .eq("user_id", student.userId)
      .select("user_id");
    expect(removed.error).toBeNull();
    expect(removed.data).toEqual([]);

    const { data } = await web
      .from("profiles")
      .select("full_name")
      .eq("user_id", student.userId)
      .single<{ full_name: string }>();
    expect(data?.full_name).not.toBe("Renamed by a client");
  });

  it("can still capture, and still update details — an archived record's included", async () => {
    const captured = await insertAs(client, "Captured Co");
    expect(await archivedAtAs(web, captured)).toBeNull();

    const updated = await client
      .from("applications")
      .update({ current_status: "Applied", notes: "Updated by the client" })
      .eq("id", captured)
      .select("current_status");
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([{ current_status: "Applied" }]);

    const archived = await insertAs(web, "Archived but editable", {
      archived_at: new Date().toISOString(),
    });
    const edited = await client
      .from("applications")
      .update({ notes: "Edited while archived" })
      .eq("id", archived)
      .select("notes,archived_at");
    expect(edited.error).toBeNull();
    expect(edited.data).toHaveLength(1);
    expect(edited.data?.[0]).toMatchObject({ notes: "Edited while archived" });
    expect(edited.data?.[0]?.archived_at).not.toBeNull();
  });

  it("leaves the student's own session free to archive, restore, and delete", async () => {
    const id = await insertAs(web, "Student's own");

    const archived = await web
      .from("applications")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    expect(archived.error).toBeNull();
    expect(archived.data).toHaveLength(1);

    const restored = await web
      .from("applications")
      .update({ archived_at: null })
      .eq("id", id)
      .select("id");
    expect(restored.error).toBeNull();
    expect(restored.data).toHaveLength(1);

    const deleted = await web
      .from("applications")
      .delete()
      .eq("id", id)
      .select("id");
    expect(deleted.error).toBeNull();
    expect(deleted.data).toHaveLength(1);
    expect(await archivedAtAs(web, id)).toBe("missing");
  });
});
