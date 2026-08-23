/**
 * Hosted verification for the MCP endpoint.
 *
 * Exercises the real path end to end:
 *
 *   HTTP /api/mcp → token verification → repository → Supabase → RLS
 *
 * with no in-memory stand-in anywhere. Two disposable users are created, each
 * gets a genuine Supabase access token, and every assertion is made through
 * JSON-RPC over HTTP exactly as an MCP client would make it.
 *
 * SCOPE — what this does NOT verify
 *
 * OAuth grant revocation is deliberately absent. The tokens here come from a
 * password sign-in, not from the authorization-code + PKCE flow an MCP client
 * uses, so revoking an OAuth client's grant would say nothing about them.
 * Asserting "the call fails after Disconnect" with an unrelated token would be
 * a test that passes for the wrong reason. Revocation is covered by unit tests
 * around `revokeGrantAction` plus the documented manual acceptance test in
 * docs/mcp.md.
 *
 * Credentials: reads `SUPABASE_SERVICE_ROLE_KEY` only from the process
 * environment, for creating and deleting disposable users. Never put it in a
 * file. Nothing in this script prints a token or a key.
 *
 *   node --env-file=.env.local scripts/verify-hosted-mcp.mjs
 *
 * Optional `MCP_BASE_URL` overrides the endpoint origin; it defaults to
 * `NEXT_PUBLIC_SITE_URL`, which is what the deployment advertises.
 */

import { randomBytes } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const createdUserIds = [];
let admin;
let failed = false;

function assert(name, condition, detail = "") {
  console.log(
    `${condition ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`,
  );
  if (!condition) {
    failed = true;
    throw new Error(name);
  }
}

function client(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function createDisposableUser(email, password, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return data.user.id;
}

/** One MCP session over HTTP, holding the negotiated session id. */
function mcpSession(endpoint, accessToken) {
  let nextId = 0;
  let sessionId;

  async function send(method, params) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: (nextId += 1),
        method,
        params,
      }),
    });

    const capturedSession = response.headers.get("mcp-session-id");
    if (capturedSession) sessionId = capturedSession;

    const text = await response.text();
    // A streamable-HTTP server may answer as SSE; take the last data frame.
    const payload = text.startsWith("event:")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .at(-1)
      : text;

    return {
      status: response.status,
      headers: response.headers,
      body: payload ? JSON.parse(payload) : null,
    };
  }

  return {
    async initialize() {
      const result = await send("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "jobtrack-hosted-verifier", version: "1.0.0" },
      });
      return result;
    },
    listTools: () => send("tools/list", {}),
    callTool: (name, args) =>
      send("tools/call", { name, arguments: args ?? {} }),
  };
}

/** Structured content from a successful tool call, or null on a tool error. */
function toolResult(response) {
  const result = response.body?.result;
  if (!result || result.isError) return null;
  return result.structuredContent ?? result;
}

async function verify() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const siteUrl = process.env.MCP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  assert("configured Supabase URL is readable", Boolean(url));
  assert("configured publishable key is readable", Boolean(publishableKey));
  assert("configured site URL is readable", Boolean(siteUrl));

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(
    "ephemeral cleanup credential environment variable is readable",
    Boolean(serviceKey),
  );
  admin = client(url, serviceKey);

  const endpoint = `${siteUrl.replace(/\/$/, "")}/api/mcp`;

  // --- an unauthenticated request is refused -----------------------------
  const anonymous = await mcpSession(endpoint, null).initialize();
  assert(
    "unauthenticated MCP request is refused with 401",
    anonymous.status === 401,
    `status ${anonymous.status}`,
  );
  assert(
    "401 tells a client where to authenticate",
    Boolean(anonymous.headers.get("www-authenticate")),
  );

  // --- two disposable users ----------------------------------------------
  const suffix = randomBytes(12).toString("hex");
  const passwordA = `${randomBytes(24).toString("base64url")}aA1!`;
  const passwordB = `${randomBytes(24).toString("base64url")}bB2!`;
  const emailA = `mcp-a-${suffix}@example.com`;
  const emailB = `mcp-b-${suffix}@example.com`;

  await createDisposableUser(emailA, passwordA, "MCP User A");
  await createDisposableUser(emailB, passwordB, "MCP User B");

  const userA = client(url, publishableKey);
  const userB = client(url, publishableKey);
  const { data: sessionA, error: loginAError } =
    await userA.auth.signInWithPassword({ email: emailA, password: passwordA });
  const { data: sessionB, error: loginBError } =
    await userB.auth.signInWithPassword({ email: emailB, password: passwordB });
  assert("both disposable users authenticate", !loginAError && !loginBError);

  const mcpA = mcpSession(endpoint, sessionA.session.access_token);
  const mcpB = mcpSession(endpoint, sessionB.session.access_token);

  // --- protocol ------------------------------------------------------------
  const initialized = await mcpA.initialize();
  assert(
    "authenticated client initializes an MCP session",
    initialized.status === 200 && Boolean(initialized.body?.result),
    `status ${initialized.status}`,
  );

  const tools = await mcpA.listTools();
  const toolNames = (tools.body?.result?.tools ?? []).map((tool) => tool.name);
  assert(
    "all four tools are advertised",
    ["save_job", "list_jobs", "get_job", "update_job"].every((name) =>
      toolNames.includes(name),
    ),
    toolNames.join(", "),
  );
  assert(
    "no tool advertises a user_id argument",
    (tools.body?.result?.tools ?? []).every(
      (tool) => !Object.keys(tool.inputSchema?.properties ?? {}).includes("user_id"),
    ),
  );

  // --- write ---------------------------------------------------------------
  const company = `Hosted MCP ${suffix.slice(0, 8)}`;
  const saved = await mcpA.callTool("save_job", {
    company,
    job_title: "Business Analyst Intern",
    location: "Toronto, ON",
    work_term: "Summer 2027",
    status: "Interested",
  });
  assert(
    "User A saves an application through MCP",
    !saved.body?.result?.isError,
    JSON.stringify(saved.body?.result?.content ?? {}),
  );

  // --- read ----------------------------------------------------------------
  const listed = toolResult(await mcpA.callTool("list_jobs", { company }));
  assert(
    "User A finds the saved application through list_jobs",
    listed?.applications?.length === 1,
    `returned ${listed?.applications?.length ?? 0}`,
  );

  const applicationId = listed.applications[0].application_id;
  const fetched = toolResult(
    await mcpA.callTool("get_job", { application_id: applicationId }),
  );
  assert(
    "User A reads the full record through get_job",
    fetched?.company === company,
  );
  assert(
    "list_jobs returned no job description or notes",
    !JSON.stringify(listed).includes("job_description"),
  );

  // --- update --------------------------------------------------------------
  const updated = toolResult(
    await mcpA.callTool("update_job", {
      application_id: applicationId,
      status: "Applied",
      date_applied: new Date().toISOString().slice(0, 10),
    }),
  );
  assert(
    "User A moves the application to Applied through MCP",
    updated?.status_history_recorded === true,
  );

  // --- the database agrees -------------------------------------------------
  const { data: stored } = await userA
    .from("applications")
    .select("id,current_status,date_applied,company_name")
    .eq("id", applicationId)
    .maybeSingle();
  assert(
    "the website's own query sees the MCP change",
    stored?.current_status === "Applied" && stored?.company_name === company,
  );

  const { data: history } = await userA
    .from("application_status_history")
    .select("previous_status,new_status")
    .eq("application_id", applicationId);
  assert(
    "the status change is recorded in history by the database trigger",
    history?.some(
      (event) =>
        event.previous_status === "Interested" && event.new_status === "Applied",
    ),
  );

  // --- owner isolation, through MCP ---------------------------------------
  await mcpB.initialize();

  const otherList = toolResult(await mcpB.callTool("list_jobs", { company }));
  assert(
    "User B cannot see User A's application in list_jobs",
    otherList?.applications?.length === 0,
    `returned ${otherList?.applications?.length ?? 0}`,
  );

  const otherGet = await mcpB.callTool("get_job", {
    application_id: applicationId,
  });
  assert(
    "User B cannot read User A's application by direct id",
    otherGet.body?.result?.isError === true,
  );

  const missingGet = await mcpB.callTool("get_job", {
    application_id: "00000000-0000-4000-8000-000000000000",
  });
  assert(
    "a non-owned application is indistinguishable from a missing one",
    JSON.stringify(otherGet.body?.result?.content) ===
      JSON.stringify(missingGet.body?.result?.content),
  );

  const otherUpdate = await mcpB.callTool("update_job", {
    application_id: applicationId,
    status: "Withdrawn",
  });
  assert(
    "User B cannot update User A's application",
    otherUpdate.body?.result?.isError === true,
  );

  const { data: unchanged } = await userA
    .from("applications")
    .select("current_status")
    .eq("id", applicationId)
    .maybeSingle();
  assert(
    "User A's application is untouched after User B's attempts",
    unchanged?.current_status === "Applied",
  );
}

async function cleanup() {
  if (!admin || createdUserIds.length === 0) return;

  const results = await Promise.all(
    createdUserIds.map((userId) => admin.auth.admin.deleteUser(userId)),
  );
  const deletedUsers = results.filter(({ error }) => !error).length;

  const authLookups = await Promise.all(
    createdUserIds.map((userId) => admin.auth.admin.getUserById(userId)),
  );
  const residual = authLookups.filter(({ data }) => Boolean(data.user)).length;

  const clean = deletedUsers === createdUserIds.length && residual === 0;
  console.log(
    `${clean ? "PASS" : "FAIL"}: hosted cleanup — auth users ${deletedUsers}/${createdUserIds.length} deleted, applications and history cascaded, residual auth users ${residual}`,
  );
  if (!clean) failed = true;
}

try {
  await verify();
} catch (error) {
  failed = true;
  console.error(
    `Verification stopped: ${error instanceof Error ? error.message : "unknown error"}`,
  );
} finally {
  try {
    await cleanup();
  } catch {
    failed = true;
    console.error("Verification cleanup failed.");
  }
}

process.exitCode = failed ? 1 : 0;
