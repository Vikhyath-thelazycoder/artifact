"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "@/components/play/AuthPanel";
import { JoinPanel } from "@/components/play/JoinPanel";
import { ReceiptCard } from "@/components/play/ReceiptCard";
import { UploadPanel } from "@/components/play/UploadPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { Notice } from "@/components/ui/Field";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { Wordmark } from "@/components/ui/Wordmark";
import { usePoll } from "@/hooks/usePoll";
import { friendlyError } from "@/lib/errors";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatBytes, formatTime } from "@/lib/time";
import { roundPhase, type Board, type MyStatus } from "@/lib/types";

type View = { kind: "anon"; board: Board } | { kind: "member"; status: MyStatus; usn: string };

async function load(): Promise<View & { server_now: string }> {
  const client = getBrowserSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) {
    const { data, error } = await client.rpc("public_board");
    if (error) throw new Error(error.message);
    return { kind: "anon", board: data as Board, server_now: (data as Board).server_now };
  }
  const { data, error } = await client.rpc("my_status");
  if (error) throw new Error(error.message);
  const status = data as MyStatus;
  return { kind: "member", status, usn: (auth.user.email ?? "").split("@")[0].toUpperCase(), server_now: status.server_now };
}

export default function PlayPage() {
  const { data, error, offline, offset, refresh } = usePoll(load);

  async function logout() {
    await getBrowserSupabase().auth.signOut();
    refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-3">
          {offline && <Badge tone="warn">Reconnecting…</Badge>}
          {data?.kind === "member" && (
            <Button variant="quiet" size="sm" onClick={logout}>
              Log out
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        {error && <Notice>{friendlyError(error)}</Notice>}
        {!data ? (
          <p className="text-muted">Connecting…</p>
        ) : data.kind === "anon" ? (
          <section className="space-y-6">
            <div>
              <Eyebrow>{data.board.event.name}</Eyebrow>
              <h1 className="mt-2 font-display text-5xl">Enter ARTIFEX</h1>
              <p className="mt-2 max-w-lg text-muted">
                Register once with your USN and a PIN. When the round starts, the theme appears here for everyone at once.{" "}
                <Link className="underline" href="/rules">Read the rules</Link>.
              </p>
            </div>
            <AuthPanel registrationOpen={data.board.event.registration_open} onDone={refresh} />
          </section>
        ) : !data.status.participant ? (
          <JoinPanel usn={data.usn} registrationOpen={data.status.event.registration_open} onDone={refresh} />
        ) : (
          <Workspace status={data.status} offset={offset} refresh={refresh} />
        )}
      </main>
    </div>
  );
}

function Workspace({ status, offset, refresh }: { status: MyStatus; offset: number; refresh: () => void }) {
  const e = status.event;
  const p = status.participant!;
  const [phase, setPhase] = useState(() => roundPhase(e));
  const [ackError, setAckError] = useState<string | null>(null);

  // Re-evaluate the phase every second so "closing" appears exactly at the deadline, between polls.
  useEffect(() => {
    setPhase(roundPhase(e));
    const id = setInterval(() => setPhase(roundPhase(e)), 1000);
    return () => clearInterval(id);
  }, [e]);

  const acknowledge = useCallback(async () => {
    const { error } = await getBrowserSupabase().rpc("acknowledge_rules");
    if (error) setAckError(friendlyError(error.message));
    else refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            {p.code} · {p.name}
          </Eyebrow>
          <h1 className="mt-2 font-display text-5xl">
            {phase === "setup" ? "You're in." : phase === "published" ? "Results are out." : phase === "closed" || phase === "closing" ? "Pens down." : e.theme_title}
          </h1>
        </div>
        <Badge tone={phase === "live" ? "signal" : phase === "published" ? "ok" : "neutral"}>
          {phase === "live" ? "● Live" : phase === "closing" ? "Closing" : phase === "setup" ? "Waiting" : phase === "published" ? "Published" : "Closed"}
        </Badge>
      </div>

      {!p.rules_ack_at && (
        <Panel className="space-y-3 border-signal/50">
          <p className="font-semibold">Before the round: confirm the rules</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Individual work only, made during the round, in a permitted tool.</li>
            <li>PNG, JPG or PDF up to {formatBytes(e.max_file_bytes)}.</li>
            <li>The upload must reach the server by the deadline + {e.grace_seconds} s. Later uploads are rejected.</li>
            <li>The judges&apos; decision is final.</li>
          </ul>
          {ackError && <Notice>{ackError}</Notice>}
          <div className="flex gap-3">
            <Button onClick={acknowledge}>I&apos;ve read the rules</Button>
            <Link href="/rules" className="inline-flex min-h-11 items-center px-2 text-sm underline">
              Full rules
            </Link>
          </div>
        </Panel>
      )}

      {phase === "setup" && (
        <Panel>
          <p className="text-lg">The theme will be revealed when the organiser starts the round.</p>
          <p className="mt-2 text-sm text-muted">
            Keep this page open. The {Math.round(e.duration_seconds / 60)}-minute timer starts for everyone at the same moment. Have your design tool
            ready.
          </p>
        </Panel>
      )}

      {(phase === "live" || phase === "closing") && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Panel className="space-y-4">
            <Eyebrow>Theme</Eyebrow>
            <p className="font-display text-4xl leading-tight">{e.theme_title}</p>
            {e.theme_brief && <p className="whitespace-pre-line text-muted">{e.theme_brief}</p>}
            <div className="border-t border-line pt-4 text-sm text-muted">
              Needs a suitable headline, relevant visuals and a clear message. Export as PNG, JPG or PDF.
            </div>
          </Panel>
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <Panel>
              <Countdown deadline={e.deadline_at} offset={offset} />
              <p className="mt-2 text-xs text-muted">Server deadline {formatTime(e.deadline_at)} · uploads accepted until +{e.grace_seconds} s</p>
            </Panel>
            {status.submission && <ReceiptCard receipt={status.submission} canReplace={status.upload_open && e.allow_replacement} />}
            {p.rules_ack_at && status.upload_open && phase === "live" ? (
              <Panel>
                <UploadPanel status={status} onReceipt={refresh} />
              </Panel>
            ) : p.rules_ack_at && !status.submission ? (
              <Notice tone="warn">{phase === "closing" ? "Time is up. Only uploads already in progress can still arrive." : "Uploads are closed."}</Notice>
            ) : null}
          </div>
        </div>
      )}

      {(phase === "closed" || phase === "published") && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel>
            <Eyebrow>Your entry</Eyebrow>
            {status.submission ? (
              <div className="mt-3">
                <ReceiptCard receipt={status.submission} canReplace={false} />
              </div>
            ) : (
              <p className="mt-3 text-muted">No submission was received before the deadline.</p>
            )}
          </Panel>
          <Panel>
            <Eyebrow>Results</Eyebrow>
            {phase === "published" ? (
              <div className="mt-3 space-y-3">
                <p className="text-lg">The winners are announced.</p>
                <Link href="/leaderboard" className="inline-flex min-h-11 items-center rounded-md bg-signal px-4 font-semibold text-ink">
                  Open the leaderboard
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-muted">Judging in progress. Results appear on the leaderboard once published.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
