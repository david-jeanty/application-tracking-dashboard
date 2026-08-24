import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signupAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell
      description="Start with a secure personal workspace for your job search."
      footer={
        <>
          Already have an account?{" "}
          <Link
            className="font-semibold text-accent hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </>
      }
      title="Create your account"
    >
      <AuthForm action={signupAction} kind="signup" />
    </AuthShell>
  );
}
