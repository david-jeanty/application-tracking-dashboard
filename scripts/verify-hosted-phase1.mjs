import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const results = [];
const createdUserIds = [];
let admin;

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, condition, detail = "") {
  record(name, Boolean(condition), detail);
  if (!condition) {
    throw new Error(`Verification failed: ${name}`);
  }
}

function errorCode(error) {
  return error?.code ?? error?.status ?? "unknown";
}

function isPermissionError(error) {
  return Boolean(
    error &&
      (error.code === "42501" ||
        error.code === "PGRST301" ||
        /permission denied|row-level security/i.test(error.message ?? "")),
  );
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function findServiceKey(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : payload?.api_keys ?? payload?.keys ?? payload?.data ?? [];
  const serviceEntry = entries.find((entry) => {
    const label = [
      entry?.name,
      entry?.id,
      entry?.type,
      entry?.role,
      entry?.secret_jwt_template?.role,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return label.includes("service_role") || label.includes("secret");
  });

  return (
    serviceEntry?.api_key ??
    serviceEntry?.key ??
    serviceEntry?.secret ??
    serviceEntry?.value
  );
}

async function createConfirmedUser(email, password, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("Signup returned no user.");
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function login(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error("Login returned no session.");
  return data.user;
}

async function verify() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert("Supabase URL environment variable is readable", Boolean(url));
  assert(
    "Supabase publishable-key environment variable is readable",
    Boolean(publishableKey),
  );

  const rawKeys = await readStdin();
  let keyPayload;
  try {
    keyPayload = JSON.parse(rawKeys);
  } catch {
    throw new Error("Supabase CLI API-key output was not valid JSON.");
  }
  const serviceKey = findServiceKey(keyPayload);
  assert("service credential received through private pipe", Boolean(serviceKey));

  admin = makeClient(url, serviceKey);

  const mailboxSuffix = randomBytes(12).toString("hex");
  const emailA = `phase1-a-${mailboxSuffix}@example.com`;
  const emailB = `phase1-b-${mailboxSuffix}@example.com`;
  const passwordA = `${randomBytes(24).toString("base64url")}aA1!`;
  const passwordB = `${randomBytes(24).toString("base64url")}bB2!`;
  const clientA = makeClient(url, publishableKey);
  const clientB = makeClient(url, publishableKey);

  const userAId = await createConfirmedUser(
    emailA,
    passwordA,
    "Phase One User A",
  );
  const userBId = await createConfirmedUser(
    emailB,
    passwordB,
    "Phase One User B",
  );
  record("Auth admin created two confirmed disposable users without email", true);

  await login(clientA, emailA, passwordA);
  await login(clientB, emailB, passwordB);
  record("login succeeds for both disposable users", true);

  const { data: schemaSession } = await clientA.auth.getSession();
  assert(
    "authenticated session is available for hosted database access",
    Boolean(schemaSession.session?.access_token),
  );

  const { data: ownProfile, error: ownProfileError } = await clientA
    .from("profiles")
    .select("user_id,full_name")
    .eq("user_id", userAId)
    .single();
  assert(
    "Auth user creation triggers a matching profile",
    !ownProfileError &&
      ownProfile?.user_id === userAId &&
      ownProfile?.full_name === "Phase One User A",
    ownProfileError ? `database code ${errorCode(ownProfileError)}` : "",
  );

  const { error: logoutError } = await clientA.auth.signOut();
  const { data: loggedOutSession } = await clientA.auth.getSession();
  assert(
    "logout clears the session",
    !logoutError && loggedOutSession.session === null,
  );
  await login(clientA, emailA, passwordA);
  record("login succeeds after logout", true);

  const callbackUrl = new URL("/auth/callback", "http://localhost:3000");
  callbackUrl.searchParams.set("next", "/reset-password");
  const { data: recoveryLink, error: recoveryLinkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email: emailA,
      options: { redirectTo: callbackUrl.toString() },
    });
  const actionLink = recoveryLink?.properties?.action_link;
  let recoveryRedirectMatches = false;
  let recoveryRedirectDetail = "";
  if (actionLink) {
    const response = await fetch(actionLink, { redirect: "manual" });
    const redirectLocation = response.headers.get("location");
    const redirected = redirectLocation ? new URL(redirectLocation) : null;
    const hashParameters = redirected
      ? new URLSearchParams(redirected.hash.slice(1))
      : null;
    const hasRecoveryCredential =
      Boolean(redirected?.searchParams.get("code")) ||
      (hashParameters?.get("type") === "recovery" &&
        Boolean(hashParameters.get("access_token")));
    recoveryRedirectMatches =
      [301, 302, 303, 307, 308].includes(response.status) &&
      redirected?.origin === callbackUrl.origin &&
      redirected.pathname === "/auth/callback" &&
      redirected.searchParams.get("next") === "/reset-password" &&
      hasRecoveryCredential;
    recoveryRedirectDetail = JSON.stringify({
      status: response.status,
      originMatches: redirected?.origin === callbackUrl.origin,
      pathname: redirected?.pathname ?? null,
      nextMatches:
        redirected?.searchParams.get("next") === "/reset-password",
      hasCode: Boolean(redirected?.searchParams.get("code")),
      queryKeys: redirected ? [...redirected.searchParams.keys()] : [],
      hashKeys: redirected
        ? [...hashParameters.keys()]
        : [],
    });
  }
  assert(
    "recovery link targets callback and intended reset route",
    !recoveryLinkError && recoveryRedirectMatches,
    recoveryLinkError
      ? `auth status ${errorCode(recoveryLinkError)}`
      : recoveryRedirectDetail,
  );

  const { data: crossProfile, error: crossProfileError } = await clientA
    .from("profiles")
    .select("user_id")
    .eq("user_id", userBId);
  assert(
    "User A cannot read User B profile",
    !crossProfileError && crossProfile.length === 0,
  );

  const applicationId = randomUUID();
  const { data: application, error: applicationError } = await clientB
    .from("applications")
    .insert({
      id: applicationId,
      company_name: "Phase One Verification Company",
      original_job_title: "Business Analyst Intern",
      normalized_job_category: "Business Analysis",
      classification_confidence: "High",
      classification_matches: ["manual-verification"],
      location: "Toronto, ON",
      work_arrangement: "Hybrid",
      application_source: "Company website",
      current_status: "Preparing",
      work_term_season: "Summer 2027",
      salary: "$20–$25/hour",
    })
    .select(
      "id,user_id,current_status,salary,normalized_job_category,classification_confidence",
    )
    .single();
  assert(
    "User B creates an owned application with manual category and text salary",
    !applicationError &&
      application?.id === applicationId &&
      application?.user_id === userBId &&
      application?.current_status === "Preparing" &&
      application?.salary === "$20–$25/hour" &&
      application?.normalized_job_category === "Business Analysis" &&
      application?.classification_confidence === "High",
    applicationError ? `database code ${errorCode(applicationError)}` : "",
  );

  const { data: initialHistory, error: initialHistoryError } = await clientB
    .from("application_status_history")
    .select("id,previous_status,new_status,user_id")
    .eq("application_id", applicationId);
  assert(
    "application creation creates exactly one initial history event",
    !initialHistoryError &&
      initialHistory.length === 1 &&
      initialHistory[0].previous_status === null &&
      initialHistory[0].new_status === "Preparing" &&
      initialHistory[0].user_id === userBId,
  );

  const { data: aReadBApplication, error: aReadError } = await clientA
    .from("applications")
    .select("id")
    .eq("id", applicationId);
  assert(
    "User A cannot read User B application",
    !aReadError && aReadBApplication.length === 0,
  );

  const { data: aReadBHistory, error: aReadHistoryError } = await clientA
    .from("application_status_history")
    .select("id")
    .eq("application_id", applicationId);
  assert(
    "User A cannot read User B status history",
    !aReadHistoryError && aReadBHistory.length === 0,
  );

  const { data: aUpdateB, error: aUpdateError } = await clientA
    .from("applications")
    .update({ notes: "unauthorized update" })
    .eq("id", applicationId)
    .select("id");
  assert(
    "User A cannot update User B application",
    !aUpdateError && aUpdateB.length === 0,
  );

  const { data: aDeleteB, error: aDeleteError } = await clientA
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .select("id");
  assert(
    "User A cannot delete User B application",
    !aDeleteError && aDeleteB.length === 0,
  );

  const { error: forgedOwnerError } = await clientA.from("applications").insert({
    user_id: userBId,
    company_name: "Forbidden owner",
    original_job_title: "Intern",
    normalized_job_category: "Other",
    location: "Toronto, ON",
    application_source: "Other",
    work_term_season: "Summer 2027",
  });
  assert(
    "User A cannot assign an application to User B",
    isPermissionError(forgedOwnerError),
    forgedOwnerError ? `database code ${errorCode(forgedOwnerError)}` : "",
  );

  const { error: invalidCheckError } = await clientB
    .from("applications")
    .insert({
      company_name: "",
      original_job_title: "Intern",
      normalized_job_category: "Other",
      location: "Toronto, ON",
      application_source: "Other",
      work_term_season: "Summer 2027",
    });
  assert(
    "hosted application check constraint rejects a blank company",
    invalidCheckError?.code === "23514",
    invalidCheckError ? `database code ${errorCode(invalidCheckError)}` : "",
  );

  const { error: duplicatePrimaryKeyError } = await clientB
    .from("applications")
    .insert({
      id: applicationId,
      company_name: "Duplicate",
      original_job_title: "Intern",
      normalized_job_category: "Other",
      location: "Toronto, ON",
      application_source: "Other",
      work_term_season: "Summer 2027",
    });
  assert(
    "hosted application primary key rejects a duplicate id",
    duplicatePrimaryKeyError?.code === "23505",
    duplicatePrimaryKeyError
      ? `database code ${errorCode(duplicatePrimaryKeyError)}`
      : "",
  );

  const historyCountBeforeEdit = initialHistory.length;
  const { data: editedApplication, error: ordinaryEditError } = await clientB
    .from("applications")
    .update({ notes: "ordinary edit" })
    .eq("id", applicationId)
    .select("updated_at")
    .single();
  const { data: historyAfterEdit, error: historyAfterEditError } = await clientB
    .from("application_status_history")
    .select("id")
    .eq("application_id", applicationId);
  assert(
    "editing a non-status field changes updated_at and creates no history event",
    !ordinaryEditError &&
      Boolean(editedApplication?.updated_at) &&
      !historyAfterEditError &&
      historyAfterEdit.length === historyCountBeforeEdit,
  );

  const { error: statusUpdateError } = await clientB
    .from("applications")
    .update({ current_status: "Applied" })
    .eq("id", applicationId);
  const { data: historyAfterStatus, error: historyAfterStatusError } =
    await clientB
      .from("application_status_history")
      .select("previous_status,new_status")
      .eq("application_id", applicationId)
      .order("changed_at", { ascending: true });
  assert(
    "changing status creates exactly one transition history event",
    !statusUpdateError &&
      !historyAfterStatusError &&
      historyAfterStatus.length === 2 &&
      historyAfterStatus[1].previous_status === "Preparing" &&
      historyAfterStatus[1].new_status === "Applied",
  );

  const historyId = initialHistory[0].id;
  const { error: historyInsertError } = await clientB
    .from("application_status_history")
    .insert({
      application_id: applicationId,
      user_id: userBId,
      previous_status: "Applied",
      new_status: "Offer",
    });
  const { error: historyUpdateError } = await clientB
    .from("application_status_history")
    .update({ new_status: "Offer" })
    .eq("id", historyId);
  const { error: historyDeleteError } = await clientB
    .from("application_status_history")
    .delete()
    .eq("id", historyId);
  assert(
    "browser roles cannot insert status-history records",
    isPermissionError(historyInsertError),
    historyInsertError ? `database code ${errorCode(historyInsertError)}` : "",
  );
  assert(
    "browser roles cannot update status-history records",
    isPermissionError(historyUpdateError),
    historyUpdateError ? `database code ${errorCode(historyUpdateError)}` : "",
  );
  assert(
    "browser roles cannot delete status-history records",
    isPermissionError(historyDeleteError),
    historyDeleteError ? `database code ${errorCode(historyDeleteError)}` : "",
  );

  const archivedAt = new Date().toISOString();
  const { error: archiveError } = await clientB
    .from("applications")
    .update({ archived_at: archivedAt })
    .eq("id", applicationId);
  const { data: archivedRows, error: archivedReadError } = await clientB
    .from("applications")
    .select("id,archived_at")
    .eq("id", applicationId);
  assert(
    "archiving retains the record with archived_at set",
    !archiveError &&
      !archivedReadError &&
      archivedRows.length === 1 &&
      Boolean(archivedRows[0].archived_at),
  );

  const { error: permanentDeleteError } = await clientB
    .from("applications")
    .delete()
    .eq("id", applicationId);
  const { data: afterDelete, error: afterDeleteError } = await clientB
    .from("applications")
    .select("id")
    .eq("id", applicationId);
  const { data: historyAfterDelete, error: historyAfterDeleteError } =
    await clientB
      .from("application_status_history")
      .select("id")
      .eq("application_id", applicationId);
  assert(
    "permanent deletion removes the application and cascades its history",
    !permanentDeleteError &&
      !afterDeleteError &&
      afterDelete.length === 0 &&
      !historyAfterDeleteError &&
      historyAfterDelete.length === 0,
  );
}

async function cleanup() {
  if (!admin) return;
  if (createdUserIds.length === 0) {
    record("no disposable hosted data required cleanup", true);
    return;
  }
  let cleanupPassed = true;
  for (const userId of [...createdUserIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) cleanupPassed = false;
  }
  record(
    "disposable Auth users and profile cascades cleaned up",
    cleanupPassed,
    cleanupPassed ? "" : "one or more Auth deletions failed",
  );
}

let exitCode = 0;
try {
  await verify();
} catch (error) {
  exitCode = 1;
  console.error(
    `Verification stopped: ${error instanceof Error ? error.message : "unknown error"}`,
  );
} finally {
  try {
    await cleanup();
  } catch {
    exitCode = 1;
    record("disposable test cleanup completed", false, "cleanup threw an error");
  }
}

const failed = results.filter((result) => !result.passed);
console.log(
  `SUMMARY: ${results.length - failed.length} passed, ${failed.length} failed`,
);
process.exitCode = exitCode || (failed.length > 0 ? 1 : 0);
