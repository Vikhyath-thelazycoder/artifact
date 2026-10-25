"use client";

import { useNow } from "@/hooks/usePoll";
import { formatClock, remainingMs, urgency } from "@/lib/time";

const label = {
  normal: "Time left",
  two_minutes: "Under 2 minutes: export your design",
  thirty_seconds: "30 seconds: upload now",
  over: "Time is up",
} as const;

/**
 * Display only (spec §11): the server decides whether an upload was on time. Colour changes always come with
 * a text change (spec §14.3).
 */
export function Countdown({ deadline, offset, size = "md" }: { deadline: string | null; offset: number; size?: "md" | "xl" }) {
  const now = useNow();
  const ms = remainingMs(deadline, offset, now);
  const u = urgency(ms);
  const color = u === "over" || u === "thirty_seconds" ? "text-danger" : u === "two_minutes" ? "text-warn" : "text-paper";
  const big = size === "xl" ? "text-[clamp(6rem,22vw,22rem)]" : "text-7xl sm:text-8xl";
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted" aria-live="polite">
        {label[u]}
      </p>
      <p className={`tabular font-mono font-semibold leading-none tracking-tight ${big} ${color}`} role="timer" aria-label={`${formatClock(ms)} remaining`}>
        {formatClock(ms)}
      </p>
    </div>
  );
}
