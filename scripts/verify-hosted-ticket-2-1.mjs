import { randomBytes } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const createdUserIds = [];
let admin;
let failed = false;

function assert(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
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

async function verify() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert("configured URL is readable", Boolean(url));
  assert("configured publishable key is readable", Boolean(publishableKey));

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(
    "ephemeral cleanup credential environment variable is readable",
    Boolean(serviceKey),
  );
  admin = client(url, serviceKey);

  const suffix = randomBytes(12).toString("hex");
  const passwordA = `${randomBytes(24).toString("base64url")}aA1!`;
  const passwordB = `${randomBytes(24).toString("base64url")}bB2!`;
  const emailA = `phase2-a-${suffix}@example.com`;
  const emailB = `phase2-b-${suffix}@example.com`;
  const userAId = await createDisposableUser(
    emailA,
    passwordA,
    "Ticket 2.1 User A",
  );
  const userBId = await createDisposableUser(
    emailB,
    passwordB,
    "Ticket 2.1 User B",
  );

  const userA = client(url, publishableKey);
  const userB = client(url, publishableKey);
  const { error: loginAError } = await userA.auth.signInWithPassword({
    email: emailA,
    password: passwordA,
  });
  const { error: loginBError } = await userB.auth.signInWithPassword({
    email: emailB,
    password: passwordB,
  });
  assert(
    "both disposable users authenticate",
    !loginAError && !loginBError,
  );

  const { data: active, error: createError } = await userA
    .from("applications")
    .insert({
      company_name: "Ticket 2.1 Active",
      original_job_title: "Business Analyst Intern",
      normalized_job_category: "Business Analysis",
      current_status: "Applied",
      work_term_season: "Summer 2027",
      location: "Not specified",
      work_arrangement: "Unknown",
      application_source: "Not specified",
      application_deadline: "2027-02-28",
      date_applied: "2027-01-15",
      next_action: "Follow up",
      next_action_due_date: "2027-01-22",
    })
    .select("id,user_id,date_applied,application_deadline")
    .single();
  assert(
    "authenticated creation derives User A ownership",
    !createError &&
      active?.user_id === userAId &&
      active?.date_applied === "2027-01-15" &&
      active?.application_deadline === "2027-02-28",
  );

  const { data: history, error: historyError } = await userA
    .from("application_status_history")
    .select("previous_status,new_status")
    .eq("application_id", active.id);
  assert(
    "creation produces exactly one initial history event",
    !historyError &&
      history.length === 1 &&
      history[0].previous_status === null &&
      history[0].new_status === "Applied",
  );

  const { data: crossRead, error: crossReadError } = await userB
    .from("applications")
    .select("id")
    .eq("id", active.id);
  assert(
    "User B cannot read User A application",
    !crossReadError && crossRead.length === 0,
  );

  const { error: forgedOwnerError } = await userA
    .from("applications")
    .insert({
      user_id: userBId,
      company_name: "Ticket 2.1 Forged",
      original_job_title: "Intern",
      normalized_job_category: "Other",
      current_status: "Interested",
      work_term_season: "Summer 2027",
      location: "Not specified",
      application_source: "Not specified",
    });
  assert(
    "User A cannot assign an application to User B",
    forgedOwnerError?.code === "42501",
    forgedOwnerError ? `database code ${forgedOwnerError.code}` : "",
  );

  const { data: archived, error: archivedCreateError } = await userA
    .from("applications")
    .insert({
      company_name: "Ticket 2.1 Archived",
      original_job_title: "Archived Intern",
      normalized_job_category: "Other",
      current_status: "Interested",
      work_term_season: "Summer 2027",
      location: "Not specified",
      application_source: "Not specified",
      archived_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert("archived fixture creation succeeds", !archivedCreateError);

  const { data: listed, error: listError } = await userA
    .from("applications")
    .select("id")
    .eq("user_id", userAId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  assert(
    "default list query excludes archived applications",
    !listError &&
      listed.length === 1 &&
      listed[0].id === active.id &&
      !listed.some((item) => item.id === archived.id),
  );
}

async function cleanup() {
  if (!admin) return;
  let cleanupPassed = true;
  for (const userId of [...createdUserIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) cleanupPassed = false;
  }
  console.log(
    `${cleanupPassed ? "PASS" : "FAIL"}: disposable Ticket 2.1 users cleaned up`,
  );
  if (!cleanupPassed) failed = true;
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
