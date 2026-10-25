"use client";

import { useEffect, useMemo, useState } from "react";
import { DesignPreview } from "@/components/admin/DesignPreview";
import { useAction } from "@/components/admin/useAction";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Notice, TextArea } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { fetchQueue, rpc, signedUrls, type QueueItem } from "@/lib/admin/data";
import { RUBRIC, RUBRIC_TOTAL, emptyScores, totalOf, type RubricScores } from "@/lib/rubric";

/** Blind rubric scoring (D-015): participant code only. Totals are recomputed in SQL. */
export function ManualScoring() {
  const { data, refresh } = usePoll(fetchQueue, 6000);
  const [selected, setSelected] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const items = useMemo(() => data?.items ?? [], [data]);
  const item = items.find((i) => i.submission_id === selected) ?? items[0];
  const keys = items.map((i) => i.storage_key).join("|");

  useEffect(() => {
    if (keys) signedUrls(keys.split("|")).then(setUrls);
  }, [keys]);

  if (!data) return <p className="text-muted">Loading…</p>;
  if (data.status !== "closed") return <Notice tone="neutral">{data.status === "published" ? "Results are published; scores are locked." : "Scoring opens when the submission window closes."}</Notice>;
  if (items.length === 0) return <p className="text-muted">No submissions to score.</p>;
  const done = items.filter((i) => i.my_score?.status === "submitted").length;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Panel className="max-h-[75vh] space-y-1 overflow-y-auto p-2">
        <p className="px-2 py-1 font-mono text-xs text-muted">
          {done}/{items.length} scored by you
        </p>
        {items.map((i) => (
          <button
            key={i.submission_id}
            onClick={() => setSelected(i.submission_id)}
            className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${item?.submission_id === i.submission_id ? "bg-raised" : "hover:bg-raised/60"}`}
          >
            <span className="font-mono">{i.code}</span>
            {i.my_score?.status === "submitted" ? <Badge tone="ok">{i.my_score.total}</Badge> : i.my_score ? <Badge tone="warn">Draft</Badge> : <Badge>—</Badge>}
          </button>
        ))}
      </Panel>
      {item && <ScoreForm key={item.submission_id} item={item} url={urls[item.storage_key]} onSaved={refresh} />}
    </div>
  );
}

function ScoreForm({ item, url, onSaved }: { item: QueueItem; url?: string; onSaved: () => void }) {
  const [scores, setScores] = useState<RubricScores>(() => (item.my_score ? { ...item.my_score } : emptyScores()));
  const [comment, setComment] = useState(item.my_score?.comment ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const act = useAction(onSaved);

  async function save(submit: boolean) {
    const ok = await act.run(submit ? "submit" : "draft", () =>
      rpc("save_score", {
        p_submission: item.submission_id,
        p_theme: scores.theme,
        p_originality: scores.originality,
        p_hierarchy: scores.hierarchy,
        p_composition: scores.composition,
        p_message: scores.message,
        p_comment: comment,
        p_submit: submit,
      }),
    );
    if (ok) setSaved(submit ? "Score submitted." : "Draft saved.");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Panel className="p-2">
        <DesignPreview storageKey={item.storage_key} mime={item.mime_type} className="h-[70vh] w-full rounded" />
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block px-2 text-sm underline">
          Open original
        </a>
      </Panel>
      <Panel className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-3xl">{item.code}</h2>
          <p className="tabular font-mono text-3xl">
            {totalOf(scores)}
            <span className="text-base text-muted">/{RUBRIC_TOTAL}</span>
          </p>
        </div>
        {RUBRIC.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between text-sm">
              <label htmlFor={c.key} className="font-medium">
                {c.label}
              </label>
              <span className="tabular font-mono">
                {scores[c.key]}/{c.max}
              </span>
            </div>
            <input
              id={c.key}
              type="range"
              min={0}
              max={c.max}
              value={scores[c.key]}
              onChange={(e) => {
                setSaved(null);
                setScores({ ...scores, [c.key]: Number(e.target.value) });
              }}
              className="mt-1 w-full accent-[var(--signal)]"
            />
            <p className="text-xs text-muted">{c.hint}</p>
          </div>
        ))}
        <Field label="Private comment (never shown to participants)">
          <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
        </Field>
        {act.error && <Notice>{act.error}</Notice>}
        {saved && <Notice tone="ok">{saved}</Notice>}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => save(false)} disabled={!!act.busy}>
            Save draft
          </Button>
          <Button onClick={() => save(true)} disabled={!!act.busy}>
            Submit score
          </Button>
        </div>
      </Panel>
    </div>
  );
}
