import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-md border border-line bg-ink px-3 py-2.5 text-paper placeholder:text-muted/60 focus:border-signal focus:outline-none disabled:opacity-50";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-sm text-danger">{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Notice({ tone = "danger", children }: { tone?: "danger" | "ok" | "warn" | "neutral"; children: ReactNode }) {
  const t = { danger: "border-danger/50 text-danger", ok: "border-ok/50 text-ok", warn: "border-warn/50 text-warn", neutral: "border-line text-muted" }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-md border bg-ink/60 px-3 py-2 text-sm ${t}`}>
      {children}
    </p>
  );
}
