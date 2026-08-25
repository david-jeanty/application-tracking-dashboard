import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell, authLinkClassName } from "@/components/auth/auth-shell";
import { signupAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthShell
      description="Start with a secure personal workspace for your job search."
      footer={
        <>
          <p>
            Already have an account?{" "}
            <Link className={authLinkClassName} href="/login">
              Sign in
            </Link>
          </p>
          <p className="mt-1">
            Not sure yet?{" "}
            <Link className={authLinkClassName} href="/demo">
              Explore the demo
            </Link>{" "}
            first — no account needed.
          </p>
        </>
      }
      title="Create your account"
    >
      <AuthForm action={signupAction} kind="signup" />
    </AuthShell>
  );
}
