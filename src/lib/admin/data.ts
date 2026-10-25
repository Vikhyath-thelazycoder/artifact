"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import type { AdminEvent } from "@/lib/types";

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getBrowserSupabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchAdminEvent = () => rpc<AdminEvent>("admin_event");

export type ParticipantRow = {
  id: string;
  code: string;
  name: string;
  usn: string;
  branch: string;
  rules_ack_at: string | null;
  created_at: string;
  submissions: { id: string; reference: string; version_count: number; first_received_at: string; last_received_at: string }[];
};

export async function fetchParticipants(eventId: string): Promise<ParticipantRow[]> {
  const { data, error } = await getBrowserSupabase()
    .from("participants")
    .select("id, code, name, usn, branch, rules_ack_at, created_at, submissions(id, reference, version_count, first_received_at, last_received_at)")
    .eq("event_id", eventId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return data as ParticipantRow[];
}

/** Short-lived links for staff previews (spec §10.2: signed URLs, private bucket). */
export async function signedUrls(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const { data } = await getBrowserSupabase().storage.from("submissions").createSignedUrls(keys, 600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}

export type QueueItem = {
  submission_id: string;
  code: string;
  storage_key: string;
  mime_type: string;
  version: number;
  received_at: string;
  size: number;
  submitted_scores: number;
  my_score: null | {
    theme: number;
    originality: number;
    hierarchy: number;
    composition: number;
    message: number;
    total: number;
    comment: string;
    status: "draft" | "submitted";
  };
};

export const fetchQueue = () => rpc<{ server_now: string; status: string; items: QueueItem[] }>("judge_queue");
