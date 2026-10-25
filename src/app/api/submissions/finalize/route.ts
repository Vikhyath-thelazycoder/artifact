import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sniffMime } from "@/lib/files";
import { getRouteSupabase, sameOrigin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST { path, filename } → receipt. Runs as the participant (their session): reads back the file they just
// uploaded, checks its real type from the first bytes and hashes it, then finalize_submission records it with
// the storage server's arrival time (D-005, SECURITY.md T-03, T-04).
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const supabase = await getRouteSupabase(req);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ code: "NOT_AUTHENTICATED" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { path?: unknown; filename?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const filename = typeof body?.filename === "string" ? body.filename.slice(0, 300) : "";
  if (!/^events\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|pdf)$/.test(path)) {
    return NextResponse.json({ code: "BAD_PATH" }, { status: 422 });
  }

  const { data: file, error: dlError } = await supabase.storage.from("submissions").download(path);
  if (dlError || !file) return NextResponse.json({ code: "UPLOAD_MISSING" }, { status: 404 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const real = sniffMime(bytes);
  const declared = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" }[path.split(".").pop()!];
  if (!real || real !== declared) return NextResponse.json({ code: "FILE_CONTENT_MISMATCH" }, { status: 422 });

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabase.rpc("finalize_submission", { p_path: path, p_filename: filename, p_sha256: sha256 });
  if (error) {
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : "SERVER";
    const status = code === "SUBMISSIONS_CLOSED" ? 409 : code === "SERVER" ? 500 : 422;
    return NextResponse.json({ code }, { status });
  }
  return NextResponse.json({ receipt: data }, { status: 200 });
}
