import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

function runPlaywright(environment, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["playwright", "test", ...args],
      {
        env: environment,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function withoutServiceCredential(environment) {
  const sanitized = { ...environment };
  delete sanitized.SUPABASE_SERVICE_ROLE_KEY;
  return sanitized;
}

async function cleanupOwnedRecords(url, publishableKey, email, password) {
  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  const { data: applications, error: applicationReadError } = await userClient
    .from("applications")
    .select("id");
  if (applicationReadError) throw applicationReadError;

  const { data: history, error: historyReadError } = await userClient
    .from("application_status_history")
    .select("id");
  if (historyReadError) throw historyReadError;

  if (applications.length) {
    const { error: deleteError } = await userClient
      .from("applications")
      .delete()
      .in(
        "id",
        applications.map(({ id }) => id),
      );
    if (deleteError) throw deleteError;
  }

  const [
    { count: residualApplications, error: residualApplicationError },
    { count: residualHistory, error: residualHistoryError },
  ] = await Promise.all([
    userClient
      .from("applications")
      .select("id", { count: "exact", head: true }),
    userClient
      .from("application_status_history")
      .select("id", { count: "exact", head: true }),
  ]);
  await userClient.auth.signOut();
  if (residualApplicationError) throw residualApplicationError;
  if (residualHistoryError) throw residualHistoryError;

  return {
    applicationsRemoved: applications.length,
    historyRemoved: history.length,
    residualApplications: residualApplications ?? 0,
    residualHistory: residualHistory ?? 0,
  };
}

async function removeStaleTicketUsers(adminClient) {
  let page = 1;
  let removed = 0;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;

    const staleUsers = data.users.filter((user) =>
      user.email?.startsWith("ticket-2-2-e2e-"),
    );
    for (const user of staleUsers) {
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
      removed += 1;
    }

    if (data.users.length < 1000) break;
    page += 1;
  }

  return removed;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey) {
  throw new Error("The public Supabase environment is not configured.");
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  throw new Error(
    "The ephemeral SUPABASE_SERVICE_ROLE_KEY environment variable is required.",
  );
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomBytes(12).toString("hex");
const email = `ticket-2-2-e2e-${suffix}@example.com`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const emailB = `ticket-2-2-e2e-b-${suffix}@example.com`;
const passwordB = `${randomBytes(24).toString("base64url")}bB2!`;
const playwrightHost = process.env.PLAYWRIGHT_HOST ?? "localhost";
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "32122";
const userIds = [];
let exitCode = 1;

try {
  const staleUsersRemoved = await removeStaleTicketUsers(admin);
  console.log(
    `PASS: stale disposable E2E users removed before run — ${staleUsersRemoved}`,
  );

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Ticket 2.2 E2E User" },
  });
  if (error) throw error;
  userIds.push(data.user.id);

  const { data: dataB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password: passwordB,
    email_confirm: true,
    user_metadata: { full_name: "Ticket 2.2 E2E User B" },
  });
  if (errorB) throw errorB;
  userIds.push(dataB.user.id);
  console.log("PASS: two disposable no-email E2E users created");

  const browserEnvironment = {
    ...withoutServiceCredential(process.env),
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SITE_URL: `http://${playwrightHost}:${playwrightPort}`,
    PLAYWRIGHT_HOST: playwrightHost,
    PLAYWRIGHT_PORT: playwrightPort,
    E2E_USER_EMAIL: email,
    E2E_USER_PASSWORD: password,
    E2E_USER_B_EMAIL: emailB,
    E2E_USER_B_PASSWORD: passwordB,
  };

  exitCode = await runPlaywright(browserEnvironment, [
    "tests/e2e/applications.spec.ts",
    "--grep",
    "applications ticket 2.2",
    "--workers=1",
  ]);

  if (exitCode === 0) {
    console.log("PASS: authenticated Ticket 2.2 Playwright journey");
    exitCode = await runPlaywright(browserEnvironment, ["--workers=1"]);
    if (exitCode === 0) {
      console.log("PASS: full runnable Playwright regression");
    }
  }
} finally {
  let applicationsRemoved = 0;
  let historyRemoved = 0;
  let residualApplications = 0;
  let residualHistory = 0;
  const disposableCredentials = [
    { email, password },
    { email: emailB, password: passwordB },
  ].slice(0, userIds.length);

  for (const credentials of disposableCredentials) {
    try {
      const cleanup = await cleanupOwnedRecords(
        url,
        publishableKey,
        credentials.email,
        credentials.password,
      );
      applicationsRemoved += cleanup.applicationsRemoved;
      historyRemoved += cleanup.historyRemoved;
      residualApplications += cleanup.residualApplications;
      residualHistory += cleanup.residualHistory;
    } catch {
      console.error("FAIL: disposable E2E record cleanup failed");
      exitCode = 1;
    }
  }
  const recordCleanupPassed =
    residualApplications === 0 && residualHistory === 0;
  console.log(
    `${recordCleanupPassed ? "PASS" : "FAIL"}: disposable E2E record cleanup — applications removed ${applicationsRemoved}, history removed ${historyRemoved}, residual applications ${residualApplications}, residual history ${residualHistory}`,
  );
  if (!recordCleanupPassed) exitCode = 1;

  let deletedUsers = 0;
  for (const userId of [...userIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("FAIL: disposable E2E user cleanup failed");
      exitCode = 1;
    } else {
      deletedUsers += 1;
    }
  }
  console.log(
    `${deletedUsers === userIds.length ? "PASS" : "FAIL"}: disposable E2E users cleaned up — ${deletedUsers}/${userIds.length}`,
  );

  if (userIds.length && deletedUsers === userIds.length) {
    const authLookups = await Promise.all(
      userIds.map((userId) => admin.auth.admin.getUserById(userId)),
    );
    const residualAuthUsers = authLookups.filter(
      ({ data }) => Boolean(data.user),
    ).length;
    const cleanupVerified = residualAuthUsers === 0;
    console.log(
      `${cleanupVerified ? "PASS" : "FAIL"}: E2E Auth cleanup — profiles cascaded ${deletedUsers}, residual auth users ${residualAuthUsers}`,
    );
    if (!cleanupVerified) exitCode = 1;
  }
}

process.exitCode = exitCode;
