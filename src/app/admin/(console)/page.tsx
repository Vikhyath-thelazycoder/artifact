"use client";

import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/components/admin/useAction";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { Field, Input, Notice } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { fetchAdminEvent, fetchParticipants, rpc, type ParticipantRow } from "@/lib/admin/data";
import { formatTime } from "@/lib/time";
import { STATUS_LABEL, roundPhase, type AdminEvent } from "@/lib/types";

async function load(): Promise<{ server_now: string; event: AdminEvent; participants: ParticipantRow[] }> {
  const event = await fetchAdminEvent();
  return { server_now: event.server_now, event, participants: await fetchParticipants(event.id) };
}

export default function ControlRoom() {
  const { data, error, offset, refresh } = usePoll(load);
  const act = useAction(refresh);
  const [dialog, setDialog] = useState<null | "start" | "extend" | "end" | "new">(null);
  const [reason, setReason] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");

  if (!data) return <p className="text-muted">{error ? `Error: ${error}` : "Loading…"}</p>;
  const { event: e, participants } = data;
  const phase = roundPhase(e);
  const submitted = participants.filter((p) => p.submissions.length > 0).length;
  const acked = participants.filter((p) => p.rules_ack_at).length;
  const shown = participants.filter((p) => !filter || `${p.code} ${p.name} ${p.usn}`.toLowerCase().includes(filter.toLowerCase()));

  const close = () => {
    setDialog(null);
    setReason("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{e.name}</Eyebrow>
          <h1 className="mt-1 font-display text-5xl">Control room</h1>
        </div>
        <Badge tone={phase === "live" ? "signal" : phase === "published" ? "ok" : "neutral"}>
          {phase === "closing" ? "Closing (grace period)" : STATUS_LABEL[e.status]}
        </Badge>
      </div>

      {act.error && <Notice>{act.error}</Notice>}

      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Registered" value={participants.length} sub={`${acked} accepted the rules`} />
        <Stat label="Submitted" value={submitted} sub={`${participants.length - submitted} without a submission`} />
        <Panel>
          {e.status === "live" ? (
            <Countdown deadline={e.deadline_at} offset={offset} />
          ) : (
            <>
              <Eyebrow>Round</Eyebrow>
              <p className="tabular mt-2 font-mono text-4xl">{Math.round(e.duration_seconds / 60)} min</p>
              <p className="text-sm text-muted">{e.started_at ? `Started ${formatTime(e.started_at)}` : "Not started"}</p>
            </>
          )}
        </Panel>
        <Panel>
          <Eyebrow>Judging</Eyebrow>
          <p className="mt-2 text-2xl">{e.judging_mode === "ai" ? "AI (Gemini)" : "Manual"}</p>
          <p className="text-sm text-muted">{e.results_computed_at ? `Results computed ${formatTime(e.results_computed_at)}` : "No results yet"}</p>
        </Panel>
      </section>

      <Panel className="flex flex-wrap items-center gap-3">
        <Button
          variant={e.registration_open ? "ghost" : "ok"}
          disabled={!!act.busy || e.status === "closed" || e.status === "published"}
          onClick={() => act.run("reg", () => rpc("set_registration", { p_open: !e.registration_open }))}
        >
          {e.registration_open ? "Close registration" : "Open registration"}
        </Button>
        {e.status === "setup" && (
          <Button size="lg" disabled={!!act.busy || !e.theme_title} onClick={() => setDialog("start")}>
            Start round
          </Button>
        )}
        {e.status === "setup" && !e.theme_title && (
          <span className="text-sm text-warn">
            Set the theme in <Link className="underline" href="/admin/settings">Settings</Link> first.
          </span>
        )}
        {phase === "live" && (
          <>
            <Button variant="ghost" disabled={!!act.busy} onClick={() => setDialog("extend")}>
              Extend for everyone…
            </Button>
            <Button variant="danger" disabled={!!act.busy} onClick={() => setDialog("end")}>
              End round now…
            </Button>
          </>
        )}
        {e.status === "closed" && (
          <Link href="/admin/judging" className="inline-flex min-h-11 items-center rounded-md bg-signal px-4 font-semibold text-ink">
            Go to judging →
          </Link>
        )}
        {(e.status === "published" || e.status === "setup" || e.status === "closed") && (
          <Button variant="quiet" className="ml-auto" onClick={() => setDialog("new")}>
            New event…
          </Button>
        )}
      </Panel>

      <Panel className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="font-display text-2xl">Participants</h2>
          <Input placeholder="Search code, name or USN" value={filter} onChange={(ev) => setFilter(ev.target.value)} className="max-w-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">USN</th>
                <th className="px-4 py-2 font-medium">Rules</th>
                <th className="px-4 py-2 font-medium">Submission</th>
                <th className="px-4 py-2 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    {participants.length === 0 ? "No one has registered yet. Open registration and share the site link." : "No match."}
                  </td>
                </tr>
              )}
              {shown.map((p) => {
                const s = p.submissions[0];
                return (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="px-4 py-2 font-mono">{p.code}</td>
                    <td className="max-w-48 truncate px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 font-mono text-muted">{p.usn}</td>
                    <td className="px-4 py-2">{p.rules_ack_at ? <Badge tone="ok">✓ Read</Badge> : <Badge>Pending</Badge>}</td>
                    <td className="px-4 py-2">
                      {s ? (
                        <Badge tone="ok">
                          ✓ {s.reference} · v{s.version_count}
                        </Badge>
                      ) : (
                        <Badge tone={e.status === "setup" ? "neutral" : "warn"}>None</Badge>
                      )}
                    </td>
                    <td className="tabular px-4 py-2 font-mono text-muted">{s ? formatTime(s.last_received_at) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={dialog === "start"} onClose={close} title="Start the round?">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Theme revealed</dt>
          <dd className="font-semibold">{e.theme_title}</dd>
          <dt className="text-muted">Duration</dt>
          <dd>{Math.round(e.duration_seconds / 60)} minutes ({e.duration_seconds} s)</dd>
          <dt className="text-muted">Eligible now</dt>
          <dd>
            {acked} of {participants.length} registered have accepted the rules
          </dd>
          <dt className="text-muted">Deadline rule</dt>
          <dd>Upload fully received by deadline + {e.grace_seconds} s</dd>
        </dl>
        <Notice tone="warn">The timer starts for everyone at once and can&apos;t be paused.</Notice>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!!act.busy} onClick={async () => (await act.run("start", () => rpc("start_round"))) && close()}>
            Start round
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "extend"} onClose={close} title="Extend for everyone">
        <Field label="Extra seconds">
          <Input type="number" min={10} max={1800} value={seconds} onChange={(ev) => setSeconds(Number(ev.target.value))} />
        </Field>
        <Field label="Reason (recorded in the audit log)">
          <Input value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={200} />
        </Field>
        {act.error && <Notice>{act.error}</Notice>}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!!act.busy} onClick={async () => (await act.run("extend", () => rpc("extend_round", { p_seconds: seconds, p_reason: reason }))) && close()}>
            Extend
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "end"} onClose={close} title="End the round now?">
        <p className="text-sm text-muted">The deadline becomes now. Uploads already in progress still get the {e.grace_seconds}-second grace.</p>
        <Field label="Reason (recorded in the audit log)">
          <Input value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={200} />
        </Field>
        {act.error && <Notice>{act.error}</Notice>}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!!act.busy} onClick={async () => (await act.run("end", () => rpc("end_round", { p_reason: reason }))) && close()}>
            End round
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "new"} onClose={close} title="Start a new event?">
        <p className="text-sm text-muted">The current event and its results are kept in the database. Participants register again for the new one.</p>
        <Field label="New event name">
          <Input value={newName} onChange={(ev) => setNewName(ev.target.value)} placeholder={e.name} maxLength={80} />
        </Field>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!!act.busy} onClick={async () => (await act.run("new", () => rpc("new_event", { p_name: newName }))) && close()}>
            Create event
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Panel>
      <Eyebrow>{label}</Eyebrow>
      <p className="tabular mt-2 font-mono text-5xl">{value}</p>
      <p className="text-sm text-muted">{sub}</p>
    </Panel>
  );
}
