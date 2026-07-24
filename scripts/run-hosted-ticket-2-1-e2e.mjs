import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

function runPlaywright(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "playwright",
        "test",
        "tests/e2e/applications.spec.ts",
        "--project=chromium",
      ],
      {
        env: environment,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
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
const email = `phase2-e2e-${suffix}@example.com`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
const playwrightHost = process.env.PLAYWRIGHT_HOST ?? "localhost";
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "3000";
let userId;
let exitCode = 1;

try {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Ticket 2.1 E2E User" },
  });
  if (error) throw error;
  userId = data.user.id;
  console.log("PASS: disposable no-email E2E user created");

  exitCode = await runPlaywright({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SITE_URL: `http://${playwrightHost}:${playwrightPort}`,
    PLAYWRIGHT_HOST: playwrightHost,
    PLAYWRIGHT_PORT: playwrightPort,
    E2E_USER_EMAIL: email,
    E2E_USER_PASSWORD: password,
  });
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("FAIL: disposable E2E user cleanup failed");
      exitCode = 1;
    } else {
      console.log("PASS: disposable E2E user cleaned up");
    }
  }
}

process.exitCode = exitCode;
