import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Per-request client for Server Components and Route Handlers, acting as the signed-in user (cookies). */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const env = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The caller's own session for an API route: a bearer token (bot test, scripts) or the session cookie
 * (browser). Never the service role: RLS and the RPCs judge every request as that user.
 */
export async function getRouteSupabase(req: Request): Promise<SupabaseClient> {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const env = publicEnv();
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: auth } },
    });
  }
  return getServerSupabase();
}

/** Defence in depth against cross-site POSTs (auth cookies are SameSite=Lax already). Bearer calls carry no cookies. */
export function sameOrigin(req: Request): boolean {
  if (req.headers.get("authorization")) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
