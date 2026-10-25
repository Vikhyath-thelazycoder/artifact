"use client";

import { useEffect, useState } from "react";
import { useAction } from "@/components/admin/useAction";
import { Button } from "@/components/ui/Button";
import { Field, Input, Notice, TextArea } from "@/components/ui/Field";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { fetchAdminEvent, rpc } from "@/lib/admin/data";
import type { AdminEvent } from "@/lib/types";

type Form = {
  name: string;
  theme_title: string;
  theme_brief: string;
  duration_minutes: number;
  grace_seconds: number;
  max_mb: number;
  allow_replacement: boolean;
  judging_mode: "manual" | "ai";
  ai_finalists: number;
};

const toForm = (e: AdminEvent): Form => ({
  name: e.name,
  theme_title: e.theme_title,
  theme_brief: e.theme_brief,
  duration_minutes: e.duration_seconds / 60,
  grace_seconds: e.grace_seconds,
  max_mb: e.max_file_bytes / 1024 / 1024,
  allow_replacement: e.allow_replacement,
  judging_mode: e.judging_mode,
  ai_finalists: e.ai_finalists,
});

export default function SettingsPage() {
  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState(false);
  const act = useAction();

  useEffect(() => {
    fetchAdminEvent().then((e) => {
      setEvent(e);
      setForm(toForm(e));
    });
  }, []);

  if (!event || !form) return <p className="text-muted">Loading…</p>;
  const locked = event.status !== "setup";
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(false);
    setForm({ ...form, [k]: v });
  };

  async function save() {
    if (!form || !event) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      allow_replacement: form.allow_replacement,
      judging_mode: form.judging_mode,
      ai_finalists: form.ai_finalists,
    };
    if (!locked) {
      Object.assign(payload, {
        theme_title: form.theme_title,
        theme_brief: form.theme_brief,
        duration_seconds: Math.round(form.duration_minutes * 60),
        grace_seconds: form.grace_seconds,
        max_file_bytes: Math.round(form.max_mb * 1024 * 1024),
      });
    }
    const ok = await act.run("save", async () => {
      const e = await rpc<AdminEvent>("update_event_settings", { p: payload });
      setEvent({ ...event, ...e });
    });
    setSaved(ok);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Eyebrow>{event.name}</Eyebrow>
        <h1 className="mt-1 font-display text-5xl">Event settings</h1>
      </div>

      <Panel className="space-y-4">
        <h2 className="font-display text-2xl">Event</h2>
        <Field label="Event name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
        </Field>
      </Panel>

      <Panel className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Theme and timing</h2>
          {locked && <span className="text-sm text-warn">Locked: the round has started</span>}
        </div>
        <Field label="Theme (hidden until the round starts)" hint="The headline participants design for, e.g. “Save Water, Save Life”.">
          <Input value={form.theme_title} onChange={(e) => set("theme_title", e.target.value)} disabled={locked} maxLength={120} />
        </Field>
        <Field label="Brief (optional)" hint="One or two lines of context: occasion, audience, required text.">
          <TextArea rows={3} value={form.theme_brief} onChange={(e) => set("theme_brief", e.target.value)} disabled={locked} maxLength={1000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Duration (minutes)">
            <Input type="number" min={0.5} max={120} step={0.5} value={form.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} disabled={locked} />
          </Field>
          <Field label="Network grace (s)">
            <Input type="number" min={0} max={60} value={form.grace_seconds} onChange={(e) => set("grace_seconds", Number(e.target.value))} disabled={locked} />
          </Field>
          <Field label="Max file size (MB)">
            <Input type="number" min={1} max={10} value={form.max_mb} onChange={(e) => set("max_mb", Number(e.target.value))} disabled={locked} />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[var(--signal)]" checked={form.allow_replacement} onChange={(e) => set("allow_replacement", e.target.checked)} />
          Participants may replace their submission before the deadline (versions are kept)
        </label>
      </Panel>

      <Panel className="space-y-4">
        <h2 className="font-display text-2xl">Judging</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["manual", "Manual", "Admin and judges score each design with the rubric. Final score = mean of submitted judge totals."],
              ["ai", "AI (Gemini)", "Gemini scores each design on the rubric, then compares the top finalists. You can cancel any time and judge manually."],
            ] as const
          ).map(([v, t, d]) => (
            <label key={v} className={`cursor-pointer rounded-lg border p-4 ${form.judging_mode === v ? "border-signal" : "border-line"}`}>
              <input type="radio" name="mode" className="sr-only" checked={form.judging_mode === v} onChange={() => set("judging_mode", v)} />
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </label>
          ))}
        </div>
        <Field label="AI finalists compared side by side" hint="0 turns the comparison off (rubric totals only). Up to 8.">
          <Input type="number" min={0} max={8} value={form.ai_finalists} onChange={(e) => set("ai_finalists", Number(e.target.value))} className="max-w-32" />
        </Field>
        <p className="text-xs text-muted">AI judging is internal: participants never see AI scores, reasons or which mode was used.</p>
      </Panel>

      {act.error && <Notice>{act.error}</Notice>}
      {saved && <Notice tone="ok">Saved.</Notice>}
      <Button size="lg" onClick={save} disabled={!!act.busy}>
        {act.busy ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
