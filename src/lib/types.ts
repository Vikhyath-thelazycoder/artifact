export type EventStatus = "setup" | "live" | "closed" | "published";

export type PublicEvent = {
  id: string;
  name: string;
  status: EventStatus;
  registration_open: boolean;
  duration_seconds: number;
  grace_seconds: number;
  max_file_bytes: number;
  allow_replacement: boolean;
  started_at: string | null;
  deadline_at: string | null;
  closed_at: string | null;
  published: boolean;
  theme_title: string | null;
  theme_brief: string | null;
};

export type Board = { server_now: string; event: PublicEvent; counts: { registered: number; submitted: number } };

export type Receipt = {
  reference: string;
  version: number;
  version_count: number;
  received_at: string;
  filename: string;
  size: number;
  mime_type: string;
  sha256: string;
};

export type MyStatus = {
  server_now: string;
  event: PublicEvent;
  participant: { id: string; code: string; name: string; usn: string; branch: string; rules_ack_at: string | null } | null;
  submission: (Receipt & { versions: { version: number; filename: string; received_at: string; size: number; active: boolean }[] }) | null;
  upload_open: boolean;
  upload_closes_at: string | null;
};

export type PublicResults = {
  published: boolean;
  event_name: string;
  theme_title?: string;
  published_at?: string;
  rows: { rank: number; code: string; name: string; score: number }[];
};

export type AdminEvent = PublicEvent & {
  theme_title: string;
  theme_brief: string;
  judging_mode: "manual" | "ai";
  ai_finalists: number;
  results_source: "manual" | "ai" | null;
  results_computed_at: string | null;
  published_at: string | null;
  server_now: string;
};

/** True while the round is live and uploads are still accepted (deadline + grace). */
export function roundPhase(e: PublicEvent): "setup" | "live" | "closing" | "closed" | "published" {
  if (e.status !== "live") return e.status;
  return e.deadline_at && Date.now() > Date.parse(e.deadline_at) ? "closing" : "live";
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  setup: "Not started",
  live: "Live",
  closed: "Submissions closed · judging",
  published: "Results published",
};
