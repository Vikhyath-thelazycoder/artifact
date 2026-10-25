import type { SupabaseClient } from "@supabase/supabase-js";
import { participantEmail, type Login, type Registration } from "./validation";

export class AuthError extends Error {}

/**
 * New or returning participant: the Edge Function creates the account (or reports it exists), then we sign in
 * with USN + PIN and join the current event (D-003).
 */
export async function registerParticipant(client: SupabaseClient, r: Registration) {
  const { data, error } = await client.functions.invoke<{ status: "created" | "exists" }>("participant-signup", {
    body: { usn: r.usn, pin: r.pin },
  });
  if (error || !data) throw new AuthError(error ? "network" : "SERVER");
  const signIn = await client.auth.signInWithPassword({ email: participantEmail(r.usn), password: r.pin });
  if (signIn.error) throw new AuthError(data.status === "exists" ? "User already registered" : signIn.error.message);
  await joinEvent(client, r);
}

export async function joinEvent(client: SupabaseClient, r: Omit<Registration, "pin">) {
  const { error } = await client.rpc("register_participant", { p_name: r.name, p_usn: r.usn, p_branch: r.branch });
  if (error) throw new AuthError(error.message);
}

export async function loginParticipant(client: SupabaseClient, l: Login) {
  const { error } = await client.auth.signInWithPassword({ email: participantEmail(l.usn), password: l.pin });
  if (error) throw new AuthError(error.message);
}
