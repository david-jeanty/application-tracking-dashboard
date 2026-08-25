import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { loginAction } from "@/lib/auth/actions";
import { authLinkClassName } from "@/components/auth/auth-shell";
import { safePostAuthPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      description="Welcome back. Enter your details to continue."
      footer={
        <>
          <p>
            New to JobTrack?{" "}
            <Link className={authLinkClassName} href="/signup">
              Create an account
            </Link>
          </p>
          <p className="mt-1">
            Or{" "}
            <Link className={authLinkClassName} href="/demo">
              explore the demo
            </Link>{" "}
            without one.
          </p>
        </>
      }
      title="Sign in to your account"
    >
      <AuthForm
        action={loginAction}
        kind="login"
        nextPath={safePostAuthPath(params.next ?? null)}
      />
    </AuthShell>
  );
}
