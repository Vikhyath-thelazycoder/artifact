"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "@/components/admin/useAction";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { rpc } from "@/lib/admin/data";
import { friendlyError } from "@/lib/errors";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { AdminEvent } from "@/lib/types";

type Run = { id: string; status: "running" | "cancelled" | "completed"; phase: string; total: number; finalists: number; models_used: string[]; started_at: string };
type AiRow = {
  submission_id: string;
  status: "ok" | "failed";
  attempts: number;
  total: number | null;
  flags: string[];
  summary: string;
  finalist_rank: number | null;
  error_code: string | null;
  submissions: { participants: { code: string } };
};

async function loadRun(eventId: string) {
  const client = getBrowserSupabase();
  const { data: run } = await client.from("ai_runs").select("*").eq("event_id", eventId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  let rows: AiRow[] = [];
  if (run) {
    const { data } = await client
      .from("ai_scores")
      .select("submission_id, status, attempts, total, flags, summary, finalist_rank, error_code, submissions(participants(code))")
      .eq("run_id", run.id);
    rows = (data ?? []) as unknown as AiRow[];
  }
  return { run: run as Run | null, rows };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * AI judging (D-007, D-009). This page drives the run: one /api/ai/step request per design, paced for a free
 * Gemini key. Cancel stops the loop at once and tells the server to accept nothing more from this run.
 */
export function AiJudging({ event, onChange }: { event: AdminEvent; onChange: () => void }) {
  const { data, refresh } = usePoll(useCallback(() => loadRun(event.id), [event.id]) as () => Promise<Awaited<ReturnType<typeof loadRun>> & { server_now?: string }>, 3000);
  const [looping, setLooping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The run this page is driving. Each loop runs only while it is still the active run, so after Cancel a
  // new run can start at once even if the old loop is still waiting on a Gemini reply.
  const active = useRef<string | null>(null);
  const act = useAction(() => {
    refresh();
    onChange();
  });

  const run = data?.run ?? null;
  const ok = data?.rows.filter((r) => r.status === "ok").length ?? 0;
  const failed = data?.rows.filter((r) => r.status === "failed" && r.attempts >= 3).length ?? 0;

  const drive = useCallback(
    async (runId: string) => {
      if (active.current === runId) return;
      active.current = runId;
      setLooping(true);
      setNote(null);
      let finalistAttempt = 0;
      try {
        while (active.current === runId) {
          const res = await fetch("/api/ai/step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, finalistAttempt }),
          }).catch(() => null);
          if (!res) {
            setNote("Connection lost. Retrying…");
            await sleep(5000);
            continue;
          }
          const body = (await res.json().catch(() => ({}))) as { state?: string; step?: string; code?: string; delayMs?: number };
          if (!res.ok) {
            setNote(friendlyError(body.code));
            break;
          }
          refresh();
          if (body.state !== "running") break;
          if (body.step === "finalists_retry") finalistAttempt++;
          setNote(body.code ? friendlyError(body.code) : body.step === "scored" ? null : note);
          await sleep(body.delayMs ?? 1000);
        }
      } finally {
        if (active.current === runId) {
          active.current = null;
          setLooping(false);
        }
        refresh();
        onChange();
      }
    },
    [note, onChange, refresh],
  );

  // Pick a running run back up after a page reload (once per run).
  const resumed = useRef<string | null>(null);
  useEffect(() => {
    if (run?.status === "running" && active.current !== run.id && resumed.current !== run.id) {
      resumed.current = run.id;
      drive(run.id);
    }
  }, [run, drive]);

  async function start() {
    await act.run("start", async () => {
      const r = await rpc<Run>("start_ai_run");
      resumed.current = r.id;
      drive(r.id);
    });
  }

  async function cancel() {
    active.current = null;
    setLooping(false);
    if (run) await act.run("cancel", () => rpc("cancel_ai_run", { p_run: run.id, p_reason: "Cancelled by admin" }));
  }

  const progress = run ? Math.round(((ok + failed) / Math.max(run.total, 1)) * 100) : 0;
  // Highest score first; the finalist comparison only orders designs with the same score (D-017).
  const sorted = [...(data?.rows ?? [])].sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || (a.finalist_rank ?? 99) - (b.finalist_rank ?? 99));

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl">Gemini judging</h2>
            <p className="text-sm text-muted">Scores every design on the rubric, then compares the top {event.ai_finalists} side by side. Internal only.</p>
          </div>
          <div className="flex gap-3">
            {run?.status === "running" ? (
              <>
                {!looping && <Button onClick={() => drive(run.id)}>Resume</Button>}
                <Button variant="danger" onClick={cancel} disabled={act.busy === "cancel"}>
                  Cancel AI judging
                </Button>
              </>
            ) : (
              <Button onClick={start} disabled={!!act.busy || event.status !== "closed"}>
                {run ? "Run AI judging again" : "Start AI judging"}
              </Button>
            )}
          </div>
        </div>
        {event.status !== "closed" && <Notice tone="neutral">AI judging is available once submissions are closed.</Notice>}
        {act.error && <Notice>{act.error}</Notice>}
        {note && <Notice tone="warn">{note}</Notice>}
        {run && (
          <div>
            <div className="flex items-center justify-between text-sm">
              <span>
                <Badge tone={run.status === "running" ? "signal" : run.status === "completed" ? "ok" : "warn"}>{run.status}</Badge>{" "}
                <span className="ml-2 text-muted">
                  {run.status === "running" && run.phase === "finalists" ? "Comparing finalists…" : `${ok} scored · ${failed} unreadable · ${run.total} total`}
                </span>
              </span>
              <span className="font-mono text-xs text-muted">{run.models_used.join(", ")}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-signal transition-[width]" style={{ width: `${run.phase === "done" ? 100 : progress}%` }} />
            </div>
            {run.status === "cancelled" && <p className="mt-2 text-sm text-muted">Cancelled. Judge manually, or run AI judging again.</p>}
          </div>
        )}
      </Panel>

      {sorted.length > 0 && (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">AI total</th>
                <th className="px-4 py-2 font-medium">Compared</th>
                <th className="px-4 py-2 font-medium">Flags</th>
                <th className="px-4 py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.submission_id} className="border-b border-line/60 align-top">
                  <td className="px-4 py-2 font-mono">{r.submissions.participants.code}</td>
                  <td className="tabular px-4 py-2 font-mono">{r.status === "ok" ? r.total : <Badge tone="danger">{r.error_code ?? "failed"}</Badge>}</td>
                  <td className="px-4 py-2">{r.finalist_rank ? <Badge tone="signal">#{r.finalist_rank}</Badge> : "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.flags.map((f) => (
                        <Badge key={f} tone="warn">
                          {f.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-md px-4 py-2 text-muted">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
