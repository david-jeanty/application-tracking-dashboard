import { randomBytes } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const createdUserIds = [];
const createdApplicationIds = [];
let verifiedHistoryEvents = 0;
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

async function historyFor(userClient, applicationId) {
  return userClient
    .from("application_status_history")
    .select("previous_status,new_status,changed_at")
    .eq("application_id", applicationId)
    .order("changed_at", { ascending: true });
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
  const emailA = `ticket-2-2-a-${suffix}@example.com`;
  const emailB = `ticket-2-2-b-${suffix}@example.com`;
  const userAId = await createDisposableUser(
    emailA,
    passwordA,
    "Ticket 2.2 User A",
  );
  const userBId = await createDisposableUser(
    emailB,
    passwordB,
    "Ticket 2.2 User B",
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
  assert("both disposable users authenticate", !loginAError && !loginBError);

  const { data: application, error: createError } = await userA
    .from("applications")
    .insert({
      company_name: "Ticket 2.2 Hosted",
      original_job_title: "Business Analyst Intern",
      normalized_job_category: "Business Analysis",
      current_status: "Applied",
      work_term_season: "Summer 2027",
      location: "Not specified",
      work_arrangement: "Unknown",
      application_source: "Not specified",
      notes: "Initial note",
    })
    .select("id,user_id,current_status,updated_at")
    .single();
  assert(
    "owner creates a disposable application",
    !createError && application?.user_id === userAId,
  );
  createdApplicationIds.push(application.id);

  const { data: ownerRead, error: ownerReadError } = await userA
    .from("applications")
    .select("id,company_name")
    .eq("id", application.id)
    .maybeSingle();
  assert(
    "owner can retrieve the application",
    !ownerReadError && ownerRead?.id === application.id,
  );

  const { data: nonOwnerRead, error: nonOwnerReadError } = await userB
    .from("applications")
    .select("id")
    .eq("id", application.id);
  assert(
    "non-owner receives an empty application result",
    !nonOwnerReadError && nonOwnerRead.length === 0,
  );

  const missingId = "00000000-0000-4000-8000-000000000001";
  const { data: missingRead, error: missingReadError } = await userB
    .from("applications")
    .select("id")
    .eq("id", missingId);
  assert(
    "missing and non-owner database reads have the same unavailable result",
    !missingReadError &&
      missingRead.length === 0 &&
      JSON.stringify(missingRead) === JSON.stringify(nonOwnerRead),
  );

  const initialHistory = await historyFor(userA, application.id);
  assert(
    "creation has one initial history event",
    !initialHistory.error &&
      initialHistory.data.length === 1 &&
      initialHistory.data[0].previous_status === null &&
      initialHistory.data[0].new_status === "Applied",
  );

  const originalUpdatedAt = application.updated_at;
  const { data: nonStatusUpdate, error: nonStatusError } = await userA
    .from("applications")
    .update({ notes: "Owner non-status edit" })
    .eq("id", application.id)
    .eq("updated_at", originalUpdatedAt)
    .select("id,notes,current_status,updated_at")
    .maybeSingle();
  assert(
    "owner can conditionally update a non-status field",
    !nonStatusError &&
      nonStatusUpdate?.notes === "Owner non-status edit" &&
      nonStatusUpdate.current_status === "Applied",
  );

  const afterNonStatusHistory = await historyFor(userA, application.id);
  assert(
    "non-status update creates no history event",
    !afterNonStatusHistory.error && afterNonStatusHistory.data.length === 1,
  );

  const { data: statusUpdate, error: statusError } = await userA
    .from("applications")
    .update({
      current_status: "Interview",
      company_name: "Ticket 2.2 Hosted Updated",
      notes: "Several fields changed with status",
    })
    .eq("id", application.id)
    .eq("updated_at", nonStatusUpdate.updated_at)
    .select("id,company_name,current_status,updated_at")
    .maybeSingle();
  assert(
    "owner can conditionally update several fields including status",
    !statusError &&
      statusUpdate?.company_name === "Ticket 2.2 Hosted Updated" &&
      statusUpdate.current_status === "Interview",
  );

  const afterStatusHistory = await historyFor(userA, application.id);
  assert(
    "status update creates exactly one correct transition event",
    !afterStatusHistory.error &&
      afterStatusHistory.data.length === 2 &&
      afterStatusHistory.data[1].previous_status === "Applied" &&
      afterStatusHistory.data[1].new_status === "Interview",
  );
  verifiedHistoryEvents = afterStatusHistory.data.length;

  const { data: unchangedStatus, error: unchangedStatusError } = await userA
    .from("applications")
    .update({ current_status: "Interview" })
    .eq("id", application.id)
    .eq("updated_at", statusUpdate.updated_at)
    .select("id,current_status,updated_at")
    .maybeSingle();
  assert(
    "saving an unchanged status succeeds",
    !unchangedStatusError && unchangedStatus?.current_status === "Interview",
  );

  const afterUnchangedHistory = await historyFor(userA, application.id);
  assert(
    "saving an unchanged status creates no history event",
    !afterUnchangedHistory.error &&
      afterUnchangedHistory.data.length === 2,
  );

  const { data: nonOwnerUpdate, error: nonOwnerUpdateError } = await userB
    .from("applications")
    .update({ notes: "Non-owner write" })
    .eq("id", application.id)
    .select("id");
  assert(
    "non-owner direct update cannot affect the application",
    !nonOwnerUpdateError && nonOwnerUpdate.length === 0,
  );

  const { error: forgedOwnerError } = await userA
    .from("applications")
    .update({ user_id: userBId })
    .eq("id", application.id);
  assert(
    "owner cannot forge application ownership",
    forgedOwnerError?.code === "42501",
    forgedOwnerError ? `database code ${forgedOwnerError.code}` : "",
  );

  const { data: staleUpdate, error: staleUpdateError } = await userA
    .from("applications")
    .update({ notes: "Stale overwrite" })
    .eq("id", application.id)
    .eq("updated_at", originalUpdatedAt)
    .select("id");
  assert(
    "stale updated_at condition fails safely",
    !staleUpdateError && staleUpdate.length === 0,
  );

  const { data: finalApplication, error: finalReadError } = await userA
    .from("applications")
    .select("notes,current_status")
    .eq("id", application.id)
    .single();
  assert(
    "stale update does not overwrite current values",
    !finalReadError &&
      finalApplication.notes === "Several fields changed with status" &&
      finalApplication.current_status === "Interview",
  );

  const { data: archived, error: archivedError } = await userA
    .from("applications")
    .insert({
      company_name: "Ticket 2.2 Archived",
      original_job_title: "Archived Intern",
      normalized_job_category: "Other",
      current_status: "Interested",
      work_term_season: "Summer 2027",
      location: "Not specified",
      application_source: "Not specified",
      archived_at: new Date().toISOString(),
    })
    .select("id,archived_at,updated_at")
    .single();
  assert("archived fixture creation succeeds", !archivedError);
  createdApplicationIds.push(archived.id);
  verifiedHistoryEvents += 1;

  const { data: archivedUpdate, error: archivedUpdateError } = await userA
    .from("applications")
    .update({ notes: "Archived owner edit" })
    .eq("id", archived.id)
    .eq("updated_at", archived.updated_at)
    .select("id,notes,archived_at")
    .single();
  assert(
    "owner can retrieve and edit an archived application",
    !archivedUpdateError &&
      archivedUpdate?.notes === "Archived owner edit" &&
      Boolean(archivedUpdate.archived_at),
  );
}

async function cleanup() {
  if (!admin) return;
  let deletedUsers = 0;
  for (const userId of [...createdUserIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) deletedUsers += 1;
  }
  console.log(
    `${deletedUsers === createdUserIds.length ? "PASS" : "FAIL"}: disposable Ticket 2.2 users deleted — ${deletedUsers}/${createdUserIds.length}`,
  );
  if (deletedUsers !== createdUserIds.length) failed = true;

  if (createdUserIds.length && deletedUsers === createdUserIds.length) {
    const authLookups = await Promise.all(
      createdUserIds.map((userId) => admin.auth.admin.getUserById(userId)),
    );
    const residualAuthUsers = authLookups.filter(
      ({ data }) => Boolean(data.user),
    ).length;
    const cleanupVerified = residualAuthUsers === 0;
    console.log(
      `${cleanupVerified ? "PASS" : "FAIL"}: hosted cleanup counts — auth users ${deletedUsers}/${createdUserIds.length}, profiles cascaded ${createdUserIds.length}, applications cascaded ${createdApplicationIds.length}, history events cascaded ${verifiedHistoryEvents}, residual auth users ${residualAuthUsers}`,
    );
    if (!cleanupVerified) failed = true;
  }
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
