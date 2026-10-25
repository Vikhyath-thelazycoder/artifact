// One step of an AI judging run (D-009), with its dependencies injected so it can be tested without
// Next.js, Supabase or Gemini. The run's state lives in the database (ai_next / record_* RPCs); this only
// moves data between storage, Gemini and those RPCs. The admin's browser calls it until the run stops.
import { sniffMime } from "@/lib/files";
import { FINALIST_LABELS, comparePrompt, scorePrompt } from "./prompt";
import { validateCompare, validateScore } from "./schema";
import type { Judge } from "./types";

export type StepDeps = {
  role: () => Promise<"none" | "user" | "admin">;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  download: (storageKey: string) => Promise<Uint8Array | null>;
  judge: Judge | null;
};

export type StepResult = { status: number; body: Record<string, unknown> };

type Item = { submission_id: string; version_id: string; storage_key: string; mime_type: string };
type Next =
  | { state: "score"; items: Item[] }
  | { state: "finalists"; items: { submission_id: string; storage_key: string; mime_type: string }[] }
  | { state: "completed" | "cancelled" | "running" };

/** Wait this long before the next step: keeps a free-tier key under its per-minute limit. */
export const STEP_GAP_MS = Number(process.env.GEMINI_STEP_GAP_MS ?? 4500);
const QUOTA_WAIT_MS = 20_000;
const fail = (status: number, code: string, extra: Record<string, unknown> = {}): StepResult => ({ status, body: { code, ...extra } });

async function call<T>(deps: StepDeps, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await deps.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function scoreOne(
  deps: StepDeps,
  runId: string,
  item: Item,
  theme: { title: string; brief: string },
): Promise<{ state: string; step: "scored" | "failed" | "waiting"; code?: string }> {
  const bytes = await deps.download(item.storage_key);
  const mime = bytes ? sniffMime(bytes) : null;
  if (!bytes || !mime) {
    await call(deps, "record_ai_failure", { p_run: runId, p_submission: item.submission_id, p_code: bytes ? "BAD_FILE" : "DOWNLOAD_FAILED" });
    return { state: "running", step: "failed" };
  }
  try {
    const { text, model } = await deps.judge!.score(scorePrompt(theme), { mimeType: mime, bytes });
    const v = validateScore(text);
    const rec = await call<{ recorded: boolean; state: string }>(deps, "record_ai_score", {
      p_run: runId, p_submission: item.submission_id, p_version: item.version_id, p_scores: v.scores,
      p_reasons: v.reasons, p_flags: v.flags, p_summary: v.summary, p_model: model,
    });
    return { state: rec.recorded ? "running" : rec.state, step: "scored" };
  } catch (e) {
    const code = e instanceof Error ? e.message : "AI_FAILED";
    // Quota isn't the design's fault: it stays unscored and is picked up again next step.
    if (code === "AI_QUOTA") return { state: "running", step: "waiting", code };
    if (code === "AI_BAD_OUTPUT" || code === "AI_TIMEOUT" || code === "AI_FAILED") {
      await call(deps, "record_ai_failure", { p_run: runId, p_submission: item.submission_id, p_code: code });
      return { state: "running", step: "failed", code };
    }
    throw e;
  }
}

export async function handleAiStep(input: { runId?: unknown; finalistAttempt?: unknown }, deps: StepDeps): Promise<StepResult> {
  const role = await deps.role();
  if (role === "none") return fail(401, "NOT_AUTHENTICATED");
  if (role !== "admin") return fail(403, "NOT_ADMIN");
  const runId = typeof input.runId === "string" && /^[0-9a-f-]{36}$/.test(input.runId) ? input.runId : null;
  if (!runId) return fail(422, "VALIDATION");
  if (!deps.judge) return fail(503, "AI_NOT_CONFIGURED");

  try {
    const parallel = Math.max(1, deps.judge.parallelism());
    const next = await call<Next>(deps, "ai_next_batch", { p_run: runId, p_limit: parallel });
    if (next.state !== "score" && next.state !== "finalists") return { status: 200, body: { state: next.state } };

    const event = await call<{ theme_title: string; theme_brief: string }>(deps, "admin_event", {});
    const theme = { title: event.theme_title, brief: event.theme_brief };

    if (next.state === "score") {
      // One design per key, all at once (D-018).
      const outcomes = await Promise.all(next.items.map((item) => scoreOne(deps, runId, item, theme)));
      const state = outcomes.find((o) => o.state !== "running")?.state ?? "running";
      const scored = outcomes.filter((o) => o.step === "scored").length;
      const allQuota = outcomes.every((o) => o.code === "AI_QUOTA");
      return {
        status: 200,
        body: {
          state,
          step: scored ? "scored" : allQuota ? "waiting" : "failed",
          scored,
          batch: next.items.length,
          ...(allQuota ? { code: "AI_QUOTA" } : outcomes.find((o) => o.code) ? { code: outcomes.find((o) => o.code)!.code } : {}),
          delayMs: allQuota ? QUOTA_WAIT_MS : STEP_GAP_MS,
        },
      };
    }

    // Finalists: compare the top N side by side. After 3 failed tries the run completes on rubric totals alone.
    const attempt = Number(input.finalistAttempt ?? 0);
    if (attempt >= 3) {
      await call(deps, "record_ai_finalists", { p_run: runId, p_order: [], p_notes: [], p_model: "" });
      return { status: 200, body: { state: "completed", step: "finalists_skipped" } };
    }
    const labelled: { label: string; submissionId: string; file: { mimeType: string; bytes: Uint8Array } }[] = [];
    for (const [i, item] of next.items.entries()) {
      const bytes = await deps.download(item.storage_key);
      const mime = bytes ? sniffMime(bytes) : null;
      if (!bytes || !mime) {
        await call(deps, "record_ai_finalists", { p_run: runId, p_order: [], p_notes: [], p_model: "" });
        return { status: 200, body: { state: "completed", step: "finalists_skipped" } };
      }
      labelled.push({ label: FINALIST_LABELS[i], submissionId: item.submission_id, file: { mimeType: mime, bytes } });
    }
    const labels = labelled.map((l) => l.label);
    try {
      const { text, model } = await deps.judge.compare(comparePrompt(theme, labels), labelled.map(({ label, file }) => ({ label, file })));
      const { order, notes } = validateCompare(text, labels);
      const byLabel = new Map(labelled.map((l) => [l.label, l.submissionId]));
      const rec = await call<{ recorded: boolean; state: string }>(deps, "record_ai_finalists", {
        p_run: runId, p_order: order.map((l) => byLabel.get(l)), p_notes: order.map((l) => notes[l] ?? ""), p_model: model,
      });
      return { status: 200, body: { state: rec.state, step: "finalists" } };
    } catch (e) {
      const code = e instanceof Error ? e.message : "AI_FAILED";
      if (code === "AI_QUOTA") return { status: 200, body: { state: "running", step: "waiting", code, delayMs: QUOTA_WAIT_MS } };
      if (code.startsWith("AI_")) return { status: 200, body: { state: "running", step: "finalists_retry", code, delayMs: STEP_GAP_MS } };
      throw e;
    }
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    if (code === "NOT_ADMIN" || code === "NOT_AUTHENTICATED") return fail(403, code);
    if (code === "NOT_FOUND") return fail(404, code);
    console.error("ai step failed:", code);
    return fail(500, /^[A-Z_]+$/.test(code) ? code : "SERVER");
  }
}
