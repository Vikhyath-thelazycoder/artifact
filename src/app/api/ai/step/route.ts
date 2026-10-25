import { NextResponse } from "next/server";
import { configuredJudge } from "@/lib/ai/judge";
import { handleAiStep, type StepDeps } from "@/lib/ai/step";
import { getRouteSupabase, sameOrigin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { runId, finalistAttempt? } → { state, step?, delayMs?, code? }. Admin only (checked here and in every RPC).
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const supabase = await getRouteSupabase(req);
  const body = await req.json().catch(() => ({}));
  const deps: StepDeps = {
    role: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return "none";
      const { data: isAdmin } = await supabase.rpc("is_admin");
      return isAdmin ? "admin" : "user";
    },
    rpc: async (name, args) => {
      const { data, error } = await supabase.rpc(name, args);
      return { data, error: error ? { message: error.message } : null };
    },
    // The admin's own session reads the private bucket (staff storage policy); no service key.
    download: async (key) => {
      const { data, error } = await supabase.storage.from("submissions").download(key);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    judge: configuredJudge(),
  };
  const result = await handleAiStep(body, deps);
  return NextResponse.json(result.body, { status: result.status });
}
