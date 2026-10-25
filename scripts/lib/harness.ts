// Shared by scripts/bot-test.ts and integration/*.test.ts. Talks to the TEST Supabase project (local stack or a
// separate test project), never production: refuses to run when TEST_SUPABASE_URL is a non-local URL that is
// also the app's production URL.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const url = process.env.TEST_SUPABASE_URL ?? "";
export const anonKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
export const appUrl = (process.env.TEST_APP_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

if (!url || !anonKey || !serviceKey) {
  throw new Error("TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)");
}
const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
if (!local && url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Refusing to run against the production project: point TEST_SUPABASE_URL at a separate test project");
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
/** Service-role client: setup, assertions and cleanup only (bypasses RLS). */
export const service = createClient(url, serviceKey, noSession);
export const anon = () => createClient(url, anonKey, noSession);

export type Actor = { client: SupabaseClient; userId: string; email: string; token: string };

const createdUsers: string[] = [];
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signIn(email: string, password: string): Promise<Actor> {
  const client = anon();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("sign-in failed");
  return { client, userId: data.user.id, email, token: data.session.access_token };
}

export async function makeStaff(role: "admin" | "judge", label: string): Promise<Actor> {
  const email = `bot-${label}-${randomUUID().slice(0, 8)}@staff.artifex.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  createdUsers.push(data.user.id);
  const { error: staffError } = await service.from("staff").insert({ user_id: data.user.id, role, display_name: label });
  if (staffError) throw staffError;
  return signIn(email, password);
}

/** Creates the participant account through the real Edge Function, then signs in with USN + PIN. */
export async function makeParticipant(usn: string, pin = "424242"): Promise<Actor & { usn: string; pin: string }> {
  const res = await fetch(`${url}/functions/v1/participant-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ usn, pin }),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: string; code?: string };
  if (!res.ok || !body.status) throw new Error(`participant-signup ${res.status} ${body.code ?? ""}`);
  const actor = await signIn(`${usn.toLowerCase()}@participants.artifex.app`, pin);
  createdUsers.push(actor.userId);
  return { ...actor, usn, pin };
}

export async function rpcOk<T = unknown>(client: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

export async function rpcErr(client: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<string | null> {
  const { error } = await client.rpc(name, args);
  return error?.message ?? null;
}

/** Puts the database in a fresh current event (any live round is force-closed first). */
export async function freshEvent(admin: Actor, name: string, settings: Record<string, unknown>) {
  await service.from("events").update({ status: "closed", closed_at: new Date().toISOString() }).eq("is_current", true).eq("status", "live");
  const e = await rpcOk<{ id: string }>(admin.client, "new_event", { p_name: name });
  await rpcOk(admin.client, "update_event_settings", { p: settings });
  return e.id;
}

/** Uploads like the browser does: straight to storage with the user's token. Returns the HTTP status. */
export async function storageUpload(actor: Actor, path: string, bytes: Uint8Array, mime: string): Promise<number> {
  const res = await fetch(`${url}/storage/v1/object/submissions/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${actor.token}`, apikey: anonKey, "Content-Type": mime, "x-upsert": "false" },
    body: bytes as BodyInit,
  });
  await res.arrayBuffer().catch(() => null);
  return res.status;
}

export async function finalize(actor: Actor, path: string, filename: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${appUrl}/api/submissions/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}` },
    body: JSON.stringify({ path, filename }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export async function aiStep(admin: Actor, runId: string, finalistAttempt = 0) {
  const res = await fetch(`${appUrl}/api/ai/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ runId, finalistAttempt }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { state?: string; step?: string; code?: string; delayMs?: number } };
}

export async function deleteCreatedUsers() {
  for (const id of createdUsers.splice(0)) await service.auth.admin.deleteUser(id).catch(() => null);
}
