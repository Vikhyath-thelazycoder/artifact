"use client";

import { useCallback, useState } from "react";
import { useAction } from "@/components/admin/useAction";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Notice } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Panel } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { rpc } from "@/lib/admin/data";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { AdminEvent } from "@/lib/types";

type Row = { rank: number; final_score: number; source: string; tie_break_note: string; participants: { code: string; name: string } };

async function loadResults(eventId: string) {
  const { data, error } = await getBrowserSupabase()
    .from("results")
    .select("rank, final_score, source, tie_break_note, participants(code, name)")
    .eq("event_id", eventId)
    .order("rank");
  if (error) throw new Error(error.message);
  return { rows: data as unknown as Row[] };
}

export function ResultsPanel({ event, onChange }: { event: AdminEvent; onChange: () => void }) {
  const { data, refresh } = usePoll(useCallback(() => loadResults(event.id), [event.id]) as () => Promise<{ rows: Row[]; server_now?: string }>, 5000);
  const act = useAction(() => {
    refresh();
    onChange();
  });
  const [source, setSource] = useState<"manual" | "ai">(event.judging_mode);
  const [dialog, setDialog] = useState<null | "publish" | "unpublish">(null);
  const [reason, setReason] = useState("");
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl">Results</h2>
            <p className="text-sm text-muted">Compute the ranking, review it here, then publish. Nothing is public until you publish.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-md border border-line p-1 text-sm" role="radiogroup" aria-label="Score source">
              {(["ai", "manual"] as const).map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={source === s}
                  onClick={() => setSource(s)}
                  className={`rounded px-3 py-1.5 ${source === s ? "bg-raised" : "text-muted"}`}
                  disabled={event.status !== "closed"}
                >
                  {s === "ai" ? "AI scores" : "Manual scores"}
                </button>
              ))}
            </div>
            <Button variant="ghost" disabled={!!act.busy || event.status !== "closed"} onClick={() => act.run("compute", () => rpc("compute_results", { p_source: source }))}>
              Compute ranking
            </Button>
            {event.status === "published" ? (
              <Button variant="ghost" onClick={() => setDialog("unpublish")}>
                Unpublish…
              </Button>
            ) : (
              <Button disabled={!!act.busy || rows.length === 0 || event.status !== "closed"} onClick={() => setDialog("publish")}>
                Publish results
              </Button>
            )}
          </div>
        </div>
        {act.error && <Notice>{act.error}</Notice>}
        {event.status === "published" && <Notice tone="ok">Published. The leaderboard and projector show these results.</Notice>}
      </Panel>

      {rows.length > 0 && (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Rank</th>
                <th className="px-4 py-2 font-medium">Participant</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank} className="border-b border-line/60">
                  <td className="tabular px-4 py-2 font-mono">{r.rank}</td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-muted">{r.participants.code}</span> {r.participants.name}
                  </td>
                  <td className="tabular px-4 py-2 font-mono">{Number(r.final_score).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={r.source === "ai" ? "signal" : "neutral"}>{r.source}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted">{r.tie_break_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Modal open={dialog === "publish"} onClose={() => setDialog(null)} title="Publish results?">
        <p className="text-sm text-muted">
          The public leaderboard and projector will show rank, participant code, name and score for all {rows.length} entries. AI scores, reasons, comments and
          USNs stay private.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button disabled={!!act.busy} onClick={async () => (await act.run("publish", () => rpc("publish_results"))) && setDialog(null)}>
            Publish
          </Button>
        </div>
      </Modal>
      <Modal open={dialog === "unpublish"} onClose={() => setDialog(null)} title="Unpublish results?">
        <p className="text-sm text-muted">Use this only to correct a mistake. The leaderboard goes back to “Judging in progress”.</p>
        <Field label="Reason (recorded in the audit log)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>
        {act.error && <Notice>{act.error}</Notice>}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!!act.busy} onClick={async () => (await act.run("unpublish", () => rpc("unpublish_results", { p_reason: reason }))) && setDialog(null)}>
            Unpublish
          </Button>
        </div>
      </Modal>
    </div>
  );
}
