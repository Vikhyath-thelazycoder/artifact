const tones = {
  neutral: "border-line text-muted",
  signal: "border-signal/60 text-signal",
  ok: "border-ok/60 text-ok",
  warn: "border-warn/60 text-warn",
  danger: "border-danger/60 text-danger",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}
