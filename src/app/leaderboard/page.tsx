"use client";

import { Leaderboard } from "@/components/public/Podium";
import { Eyebrow } from "@/components/ui/Panel";
import { SiteHeader } from "@/components/ui/Wordmark";
import { usePoll } from "@/hooks/usePoll";
import { fetchResults } from "@/lib/supabase/public";

export default function LeaderboardPage() {
  const { data } = usePoll(fetchResults, 5000);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
        <Eyebrow>{data?.event_name ?? "ARTIFEX"}</Eyebrow>
        <h1 className="mt-3 font-display text-6xl">Leaderboard</h1>
        {data?.published && data.theme_title && <p className="mt-2 text-muted">Theme: {data.theme_title}</p>}
        <div className="mt-12">
          {!data ? (
            <p className="text-muted">Loading…</p>
          ) : !data.published ? (
            <div className="rounded-lg border border-line bg-surface p-10 text-center">
              <p className="font-display text-4xl">Judging in progress</p>
              <p className="mt-2 text-muted">Results appear here the moment the organisers publish them.</p>
            </div>
          ) : data.rows.length === 0 ? (
            <p className="text-muted">No ranked entries.</p>
          ) : (
            <Leaderboard results={data} />
          )}
        </div>
        <p className="mt-12 text-sm text-muted">The judges&apos; decision is final.</p>
      </main>
    </>
  );
}
