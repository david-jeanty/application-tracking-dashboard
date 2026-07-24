import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.")
    .refine(
      (value) => value.startsWith("https://") || value.startsWith("http://127.0.0.1"),
      "NEXT_PUBLIC_SUPABASE_URL must use HTTPS, except for local Supabase.",
    ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or too short."),
  NEXT_PUBLIC_SITE_URL: z
    .url("NEXT_PUBLIC_SITE_URL must be a valid URL.")
    .refine(
      (value) => value.startsWith("https://") || value.startsWith("http://localhost"),
      "NEXT_PUBLIC_SITE_URL must use HTTPS, except on localhost.",
    ),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  values: Record<string, string | undefined>,
): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse(values);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(
      `Invalid application environment: ${details}. Copy .env.example to .env.local and add your Supabase project values.`,
    );
  }

  return result.data;
}

export function hasSupabaseEnvironment(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getPublicEnvironment(): PublicEnvironment {
  return parsePublicEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}
