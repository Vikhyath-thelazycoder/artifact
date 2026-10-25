import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { STORAGE_EXT } from "@/lib/files";
import type { Receipt } from "@/lib/types";

export class UploadError extends Error {}

/**
 * Uploads straight to the private bucket (so Vercel's body limit doesn't apply), reporting progress, then asks
 * the server to verify and record it. Only the server's receipt means "accepted" (spec §10.3).
 */
export async function uploadDesign(
  client: SupabaseClient,
  ids: { eventId: string; participantId: string },
  file: File,
  mime: string,
  onProgress: (fraction: number, phase: "uploading" | "validating") => void,
): Promise<Receipt> {
  const { data: session } = await client.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new UploadError("NOT_AUTHENTICATED");
  const path = `events/${ids.eventId}/${ids.participantId}/${crypto.randomUUID()}.${STORAGE_EXT[mime]}`;
  const env = publicEnv();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/submissions/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total, "uploading");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // Storage refuses with 400/403 when the window is closed (policy) or the type/size is wrong (bucket).
      const text = xhr.responseText || "";
      if (/size|too large|payload/i.test(text)) return reject(new UploadError("FILE_TOO_LARGE"));
      if (/mime|type/i.test(text)) return reject(new UploadError("UNSUPPORTED_FILE"));
      reject(new UploadError(xhr.status === 403 || /policy|security/i.test(text) ? "SUBMISSIONS_CLOSED" : "UPLOAD_MISSING"));
    };
    xhr.onerror = () => reject(new UploadError("network"));
    xhr.send(file);
  });

  onProgress(1, "validating");
  const res = await fetch("/api/submissions/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, filename: file.name }),
  }).catch(() => null);
  if (!res) throw new UploadError("network");
  const body = (await res.json().catch(() => ({}))) as { receipt?: Receipt; code?: string };
  if (!res.ok || !body.receipt) throw new UploadError(body.code ?? "SERVER");
  return body.receipt;
}
