// Countdown maths (spec §11). The deadline comes from the server; the browser only displays it. The offset
// between the server clock and this device is measured on every poll, so changing the device clock or
// refreshing the page never changes the time left.

/** serverNow - local midpoint of the request. Add it to Date.now() to get server time. */
export function clockOffset(serverNowIso: string, sentAt: number, receivedAt: number): number {
  return Date.parse(serverNowIso) - (sentAt + receivedAt) / 2;
}

export function remainingMs(deadlineIso: string | null | undefined, offsetMs: number, now = Date.now()): number {
  if (!deadlineIso) return 0;
  return Math.max(0, Date.parse(deadlineIso) - (now + offsetMs));
}

/** MM:SS, rounding up so 00:00 only shows when time is really up. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type Urgency = "normal" | "two_minutes" | "thirty_seconds" | "over";

export function urgency(ms: number): Urgency {
  if (ms <= 0) return "over";
  if (ms <= 30_000) return "thirty_seconds";
  if (ms <= 120_000) return "two_minutes";
  return "normal";
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
