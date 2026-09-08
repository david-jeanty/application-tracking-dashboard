import { defineConfig } from "vitest/config";

/**
 * Integration tests that need a running Supabase stack.
 *
 * Separate from `vitest.config.ts` because these are not credential-free:
 * they sign up disposable users, obtain real OAuth access tokens from the
 * authorization server, and call PostgREST directly, so they need
 * `npm run db:start` (or an isolated development project) rather than a
 * stand-in. Nothing here is mocked; that is the point.
 *
 * Defaults are the local stack `supabase start` brings up, including its
 * well-known demo publishable key. Override any of them with the same
 * environment variables the application reads.
 */

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
/**
 * The local stack's demo service-role key, used only to delete the disposable
 * student afterwards. It is public and works only against `supabase start`;
 * a real project's key is never defaulted and must arrive through the
 * environment, ephemerally.
 */
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const targetsLocalStack = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL) === LOCAL_SUPABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
      "server-only": new URL(
        "./tests/stubs/server-only.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        LOCAL_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL:
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY ??
        (targetsLocalStack ? LOCAL_SERVICE_ROLE_KEY : ""),
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
