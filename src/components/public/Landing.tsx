"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Countdown } from "@/components/ui/Countdown";
import { Eyebrow } from "@/components/ui/Panel";
import { usePoll } from "@/hooks/usePoll";
import { fetchBoard } from "@/lib/supabase/public";
import { STATUS_LABEL } from "@/lib/types";

const steps = [
  ["01", "Register", "USN and a 6-digit PIN. Takes a minute."],
  ["02", "Read the theme", "Revealed to everyone at the same second."],
  ["03", "Design · 10 min", "Figma, Canva, Photoshop, Illustrator or another permitted tool."],
  ["04", "Submit", "PNG, JPG or PDF. You get a receipt with the server time."],
  ["05", "Results", "Judged on the rubric. Winners go up on the leaderboard."],
];

export function Landing() {
  const { data, offset } = usePoll(fetchBoard);
  const e = data?.event;
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section className="drafting relative overflow-hidden rounded-lg border border-line px-5 py-14 sm:px-12 sm:py-20">
        <Eyebrow>Techvidya · Creative design competition</Eyebrow>
        <h1 className="mt-4 max-w-4xl font-display text-6xl leading-[0.95] sm:text-8xl">
          One theme. <em className="text-signal">Ten minutes.</em> Your poster.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          ARTIFEX is an individual poster and flyer design sprint. Everyone gets the same brief at the same moment; the clock is the
          server&apos;s, not yours.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/play" className="inline-flex min-h-14 items-center rounded-md bg-signal px-6 font-semibold text-ink hover:brightness-110">
            {e?.status === "live" ? "Enter the round" : "Register / Enter event"}
          </Link>
          <Link href="/rules" className="inline-flex min-h-14 items-center rounded-md border border-line px-6 font-semibold hover:border-muted">
            Read the rules
          </Link>
          {e?.status === "published" && (
            <Link href="/leaderboard" className="inline-flex min-h-14 items-center rounded-md border border-gold/60 px-6 font-semibold text-gold">
              See the winners
            </Link>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-5">
          <Eyebrow>Status</Eyebrow>
          <p className="mt-2 text-xl">{e ? STATUS_LABEL[e.status] : "Connecting…"}</p>
          {e && (
            <div className="mt-2">
              <Badge tone={e.registration_open ? "ok" : "neutral"}>Registration {e.registration_open ? "open" : "closed"}</Badge>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <Eyebrow>Participants</Eyebrow>
          <p className="tabular mt-2 font-mono text-4xl">{data?.counts.registered ?? "–"}</p>
          <p className="text-sm text-muted">{data ? `${data.counts.submitted} submitted` : ""}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          {e?.status === "live" ? (
            <Countdown deadline={e.deadline_at} offset={offset} />
          ) : (
            <>
              <Eyebrow>Round length</Eyebrow>
              <p className="tabular mt-2 font-mono text-4xl">{e ? Math.round(e.duration_seconds / 60) : 10} min</p>
              <p className="text-sm text-muted">Theme hidden until the start</p>
            </>
          )}
        </div>
      </section>

      <section className="mt-16">
        <Eyebrow>How it runs</Eyebrow>
        <ol className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
          {steps.map(([n, t, d]) => (
            <li key={n} className="bg-ink p-5">
              <p className="font-mono text-sm text-signal">{n}</p>
              <p className="mt-3 font-display text-2xl">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
