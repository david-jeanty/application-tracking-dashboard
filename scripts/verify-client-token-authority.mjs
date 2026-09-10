/**
 * Settles one open question: can a token issued to an OAuth client change the
 * account's password through GoTrue?
 *
 * This is verification support for an UNCONFIRMED finding. It asserts nothing
 * about the hosted Interndex project and changes no hosted setting. It exists
 * because the answer cannot be read out of this repository — it lives in
 * GoTrue's own handling of `PUT /auth/v1/user` for a token carrying a
 * `client_id` claim — and because guessing at it in either direction would be
 * worse than measuring it. See "Unverified: the reach of a client token at
 * the Auth API" in `docs/launch-readiness.md` for what to do with the result.
 *
 * THROWAWAY PROJECTS ONLY.
 *
 * A run creates a disposable student, registers a disposable OAuth client,
 * takes that client through the real PKCE flow, and then attempts to set the
 * disposable student's password with the resulting token. If GoTrue allows
 * it, the run has changed a password — which is exactly why it must never be
 * pointed at production, at the hosted Interndex project, or at any account a
 * real person uses. The guards below refuse the obvious mistakes; they are a
 * seatbelt, not a substitute for reading the URL before pressing enter.
 *
 * Everything it creates, it deletes.
 *
 *   node scripts/verify-client-token-authority.mjs \
 *     --url http://127.0.0.1:54321 \
 *     --i-understand-this-is-a-throwaway-project
 *
 * Credentials: reads `SUPABASE_SECRET_KEY` (or the legacy
 * `SUPABASE_SERVICE_ROLE_KEY`) and the publishable key from the process
 * environment only. Nothing here prints a token, a key, or a password.
 */

import { createHash, randomBytes } from "node:crypto";
import process from "node:process";

/** Hosts this script will not run against, whatever the flags say. */
const FORBIDDEN_HOST_PATTERNS = [
  /(^|\.)interndex\.dev$/i,
  /^jbkrwbofrctithcjevxy\.supabase\.co$/i,
];

const ACKNOWLEDGEMENT = "--i-understand-this-is-a-throwaway-project";

function readArguments(argv) {
  const url = argv[argv.indexOf("--url") + 1];
  return {
    url: argv.includes("--url") ? url : undefined,
    acknowledged: argv.includes(ACKNOWLEDGEMENT),
  };
}

function fail(message) {
  console.error(`\nverify-client-token-authority: ${message}\n`);
  process.exit(1);
}

const { url, acknowledged } = readArguments(process.argv.slice(2));

if (!url) {
  fail(
    `pass the target project explicitly: --url <supabase url> ${ACKNOWLEDGEMENT}\n` +
      "There is deliberately no default. This script must never inherit a\n" +
      "production URL from an environment file that happens to be loaded.",
  );
}

if (!acknowledged) {
  fail(
    `refusing to run without ${ACKNOWLEDGEMENT}.\n` +
      "A successful run changes an account's password. Point this at a\n" +
      "throwaway Supabase project only — never production, never the hosted\n" +
      "Interndex project, never a real person's account.",
  );
}

let target;
try {
  target = new URL(url);
} catch {
  fail(`--url is not a URL: ${url}`);
}

if (FORBIDDEN_HOST_PATTERNS.some((pattern) => pattern.test(target.hostname))) {
  fail(
    `refusing to run against ${target.hostname}: that is a production host.\n` +
      "Create a scratch Supabase project (or run `npm run db:start`) and\n" +
      "point this at that instead.",
  );
}

const SUPABASE_URL = target.origin;
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;
const ADMIN_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PUBLISHABLE_KEY) {
  fail("set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the throwaway project.");
}
if (!ADMIN_KEY) {
  fail(
    "set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) for the throwaway\n" +
      "project, so the disposable student and client can be cleaned up.",
  );
}

const REDIRECT_URI =
  "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";

function authHeaders(extra = {}) {
  return { apikey: PUBLISHABLE_KEY, ...extra };
}

function adminHeaders(extra = {}) {
  if (ADMIN_KEY.startsWith("sb_secret_")) return { apikey: ADMIN_KEY, ...extra };
  return authHeaders({ authorization: `Bearer ${ADMIN_KEY}`, ...extra });
}

function base64Url(bytes) {
  return bytes.toString("base64url");
}

function claimsOf(accessToken) {
  const [, payload] = accessToken.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString());
}

async function registerClient() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/oauth/clients/register`, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      client_name: "H-1 verification (disposable)",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.client_id) {
    throw new Error(`client registration failed: ${JSON.stringify(body)}`);
  }
  return body.client_id;
}

async function createStudent() {
  const email = `h1-verification-${Date.now()}-${randomBytes(4).toString("hex")}@example.test`;
  const password = `disposable-${randomBytes(12).toString("hex")}`;

  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) {
    throw new Error(`creating the disposable student failed: ${created.status}`);
  }
  const user = await created.json();

  const signedIn = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email, password }),
    },
  );
  const session = await signedIn.json();
  if (!signedIn.ok || !session.access_token) {
    throw new Error(`sign-in failed: ${JSON.stringify(session)}`);
  }

  return { id: user.id, email, password, accessToken: session.access_token };
}

/** The real Authorization Code + PKCE flow, as `extension/src/auth.ts` runs it. */
async function clientTokenFor(clientId, student) {
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
    throw new Error(`authorization did not reach consent: ${location}`);
  }

  const asStudent = authHeaders({
    authorization: `Bearer ${student.accessToken}`,
  });

  const consent = await fetch(
    `${SUPABASE_URL}/auth/v1/oauth/authorizations/${authorizationId}/consent`,
    {
      method: "POST",
      headers: { ...asStudent, "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    },
  );
  const approved = await consent.json();
  if (!consent.ok || !approved.redirect_url) {
    throw new Error(`consent failed: ${JSON.stringify(approved)}`);
  }

  const code = new URL(approved.redirect_url).searchParams.get("code");
  if (!code) throw new Error("no authorization code was returned");

  const exchange = await fetch(`${SUPABASE_URL}/auth/v1/oauth/token`, {
    method: "POST",
    headers: authHeaders({
      "content-type": "application/x-www-form-urlencoded",
    }),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const tokens = await exchange.json();
  if (!exchange.ok || !tokens.access_token) {
    throw new Error(`token exchange failed: ${JSON.stringify(tokens)}`);
  }
  return tokens.access_token;
}

/** Step 3: the measurement itself. Reports; concludes nothing on its own. */
async function attemptPasswordChange(clientToken) {
  const replacement = `changed-${randomBytes(12).toString("hex")}`;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: authHeaders({
      authorization: `Bearer ${clientToken}`,
      "content-type": "application/json",
    }),
    body: JSON.stringify({ password: replacement }),
  });
  const body = await response.text();

  return { status: response.status, body: body.slice(0, 400), replacement };
}

/** Step 5: a 2xx that changed nothing is a different result from one that did. */
async function canSignIn(email, password) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ email, password }),
    },
  );
  return response.ok;
}

async function cleanUp(student, clientId) {
  if (student) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${student.id}`,
      { method: "DELETE", headers: adminHeaders() },
    );
    console.log(
      response.ok
        ? "cleanup: disposable student deleted"
        : `cleanup: FAILED to delete the disposable student (${response.status}) — remove it by hand`,
    );
  }
  if (clientId) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/oauth/clients/${clientId}`,
      { method: "DELETE", headers: adminHeaders() },
    );
    console.log(
      response.ok
        ? "cleanup: disposable OAuth client deleted"
        : `cleanup: FAILED to delete the disposable client (${response.status}) — remove it by hand`,
    );
  }
}

async function main() {
  console.log(`target: ${SUPABASE_URL}`);
  console.log("this run creates and then deletes a disposable student\n");

  let student;
  let clientId;

  try {
    clientId = await registerClient();
    student = await createStudent();
    const clientToken = await clientTokenFor(clientId, student);

    // Step 2: without the claim, the rest of the run would prove nothing.
    const claims = claimsOf(clientToken);
    if (!claims.client_id) {
      throw new Error(
        "the issued token carries no client_id claim, so it is not a client " +
          "token and this run would measure the wrong thing",
      );
    }
    console.log("token carries a client_id claim: yes");

    const attempt = await attemptPasswordChange(clientToken);
    console.log(`PUT /auth/v1/user status: ${attempt.status}`);
    console.log(`response body: ${attempt.body}`);

    const changed = await canSignIn(student.email, attempt.replacement);
    const original = await canSignIn(student.email, student.password);

    console.log(`sign-in with the new password succeeds: ${changed}`);
    console.log(`sign-in with the original password succeeds: ${original}`);

    console.log("\nRESULT");
    if (changed) {
      console.log(
        "  The client token CHANGED the account password. H-1 is confirmed\n" +
          "  for this configuration. Record the status, body, and GoTrue\n" +
          "  version in docs/launch-readiness.md, then re-run with\n" +
          "  secure_password_change = true (step 6).",
      );
    } else if (attempt.status >= 200 && attempt.status < 300) {
      console.log(
        "  GoTrue answered 2xx but the password did not actually change.\n" +
          "  Record this verbatim — it is its own finding, and not the same\n" +
          "  as a refusal.",
      );
    } else {
      console.log(
        "  The client token was REFUSED at the Auth API for this\n" +
          "  configuration. Record the status, body, and GoTrue version in\n" +
          "  docs/launch-readiness.md. This is a dated result: a later\n" +
          "  Supabase release could change it.",
      );
    }
    console.log(
      "\n  One run answers one configuration. Nothing here justifies a claim\n" +
        "  about the hosted project, whose settings were not read or changed.",
    );
  } catch (error) {
    console.error(`\nrun failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await cleanUp(student, clientId);
  }
}

await main();
