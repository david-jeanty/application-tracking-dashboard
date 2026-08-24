import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resetPasswordAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Choose new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      description="Choose a new password with at least eight characters."
      footer={
        <Link
          className="font-semibold text-accent hover:underline"
          href="/forgot-password"
        >
          Request a new reset link
        </Link>
      }
      title="Set a new password"
    >
      <AuthForm action={resetPasswordAction} kind="reset" />
    </AuthShell>
  );
}
