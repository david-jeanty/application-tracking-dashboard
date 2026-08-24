import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { forgotPasswordAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      description="Enter your email. If it matches an account, we’ll send a secure reset link."
      footer={
        <Link
          className="inline-flex items-center gap-2 font-semibold text-accent hover:underline"
          href="/login"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to sign in
        </Link>
      }
      title="Forgot your password?"
    >
      <AuthForm action={forgotPasswordAction} kind="forgot" />
    </AuthShell>
  );
}
