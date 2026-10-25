import { z } from "zod";

/** Rejects secret keys pasted into the public slot: an sb_secret_ key or a JWT whose role is service_role. */
function isPublicKey(k: string): boolean {
  if (k.startsWith("sb_secret_")) return false;
  const payload = k.split(".")[1];
  if (!payload) return true;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json?.role !== "service_role";
  } catch {
    return true;
  }
}

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).refine(isPublicKey, "must be the anon/publishable key, never a secret key"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/** Forgives the usual copy-paste slips in hosting dashboards: surrounding spaces, quotes, a trailing slash. */
function clean(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^["']+|["']+$/g, "").trim();
  return v ? v : undefined;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, clean(v)]));
  if (cleaned.NEXT_PUBLIC_SITE_URL) cleaned.NEXT_PUBLIC_SITE_URL = cleaned.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const result = publicSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}\nSee .env.example.`);
  }
  return result.data;
}

// NEXT_PUBLIC_* values are inlined at build time, so they must be read by their literal names.
export const publicEnv = (): PublicEnv =>
  parsePublicEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
