import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="text-center">
        <p className="text-sm font-semibold text-blue-700">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          Page not found
        </h1>
        <p className="mt-3 text-slate-600">
          The page may have moved or you may not have access to it.
        </p>
        <ButtonLink className="mt-6" href="/dashboard">
          Return to dashboard
        </ButtonLink>
        <Link className="sr-only" href="/login">
          Return to login
        </Link>
      </section>
    </main>
  );
}
