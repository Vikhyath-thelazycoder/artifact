"use client";

import { Leaderboard } from "@/components/public/Podium";
import { Countdown } from "@/components/ui/Countdown";
import { Wordmark } from "@/components/ui/Wordmark";
import { usePoll } from "@/hooks/usePoll";
import { fetchBoard, fetchResults } from "@/lib/supabase/public";

// Projector board: theme + giant countdown + live submission counter, then the leaderboard once published.
// Read-only and public: nothing here that the audience may not see. Press F for fullscreen.
export default function ScreenPage() {
  const { data: board, offset } = usePoll(fetchBoard, 3000);
  const { data: results } = usePoll(fetchResults, 5000);
  const e = board?.event;
  return (
    <main
      className="drafting flex min-h-dvh flex-col px-[4vw] py-[3vh]"
      onKeyDown={(k) => k.key.toLowerCase() === "f" && document.documentElement.requestFullscreen?.()}
      tabIndex={0}
    >
      <header className="flex items-center justify-between">
        <Wordmark size="lg" />
        <p className="font-mono text-[1.4vw] uppercase tracking-[0.2em] text-muted">{e?.name ?? "Techvidya"}</p>
      </header>

      {!e ? (
        <p className="m-auto text-[2vw] text-muted">Connecting…</p>
      ) : e.status === "published" && results?.published ? (
        <section className="mx-auto mt-[4vh] w-full max-w-[80vw]">
          <h1 className="text-center font-display text-[5vw] leading-none">The winners</h1>
          <div className="mt-[4vh]">
            <Leaderboard results={{ ...results, rows: results.rows.slice(0, 10) }} big />
          </div>
        </section>
      ) : e.status === "setup" ? (
        <section className="m-auto text-center">
          <p className="font-mono text-[1.4vw] uppercase tracking-[0.3em] text-signal">The theme is revealed at the start</p>
          <h1 className="mt-[2vh] font-display text-[9vw] leading-none">Get ready.</h1>
          <p className="tabular mt-[3vh] font-mono text-[2.4vw] text-muted">{board.counts.registered} registered</p>
        </section>
      ) : (
        <section className="grid flex-1 grid-cols-[1.1fr_1fr] items-center gap-[4vw]">
          <div>
            <p className="font-mono text-[1.2vw] uppercase tracking-[0.3em] text-signal">Theme</p>
            <h1 className="mt-[1vh] font-display text-[6.5vw] leading-[0.95]">{e.theme_title}</h1>
            {e.theme_brief && <p className="mt-[2vh] max-w-[40vw] text-[1.6vw] text-muted">{e.theme_brief}</p>}
          </div>
          <div>
            {e.status === "live" ? (
              <Countdown deadline={e.deadline_at} offset={offset} size="xl" />
            ) : (
              <p className="font-display text-[6vw] leading-none">Submissions closed. Judging…</p>
            )}
            <p className="tabular mt-[3vh] font-mono text-[2.4vw]">
              <span className="text-signal">{board.counts.submitted}</span>
              <span className="text-muted"> / {board.counts.registered} submitted</span>
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
