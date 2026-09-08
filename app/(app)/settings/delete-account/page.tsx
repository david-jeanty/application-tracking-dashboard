import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Delete account" };

/**
 * The confirmation step for permanently deleting an account.
 *
 * A dedicated route rather than a dialog, for the same reason
 * `/applications/[id]/delete` is one: the codebase has no modal primitive,
 * and a server-rendered page needs no focus trap to be accessible. The email
 * shown to the student, and the id the confirmation form carries, both come
 * from `getUser()` under their own session — never from anything a client
 * could have passed along — so what is confirmed here is provably the
 * account that will be deleted.
 */
export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/settings/delete-account");
  // Every account created through email/password sign-up has one; this only
  // guards a session shape this form cannot use rather than one this app
  // ever actually issues.
  if (!user.email) redirect("/settings");

  return (
    <div className="mx-auto w-full max-w-xl">
      {/*
        Consequence carried by the words and by one destructive control, not
        by a red screen — the same restraint `/applications/[id]/delete`
        uses.
      */}
      <h1 className="text-[30px] font-medium leading-tight tracking-tight text-foreground">
        Permanently delete your account?
      </h1>
      <p className="mt-3 max-w-prose text-[15px] leading-7 text-foreground-secondary">
        This deletes your profile, every application you have tracked, and
        its status history. You are signed out immediately, and it cannot be
        undone.
      </p>
      <p className="mt-3 max-w-prose text-[13px] leading-6 text-foreground-muted">
        Want a copy first? Go back to Settings and use Download my data — it
        is unaffected by this and stays available for as long as your account
        exists.
      </p>

      <div className="mt-8 border-t border-border pt-6">
        <DeleteAccountForm email={user.email} userId={user.id} />
      </div>
    </div>
  );
}
