"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Notice } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { friendlyError } from "@/lib/errors";
import { loginParticipant, registerParticipant } from "@/lib/participant/auth";
import { fieldErrors, loginSchema, registrationSchema } from "@/lib/participant/validation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function AuthPanel({ registrationOpen, onDone }: { registrationOpen: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<"register" | "login">(registrationOpen ? "register" : "login");
  const [form, setForm] = useState({ name: "", usn: "", branch: "", pin: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const parsed = mode === "register" ? registrationSchema.safeParse(form) : loginSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const client = getBrowserSupabase();
      if (mode === "register") await registerParticipant(client, parsed.data as never);
      else await loginParticipant(client, parsed.data);
      onDone();
    } catch (err) {
      setErrors({ form: friendlyError(err instanceof Error ? err.message : null) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mx-auto w-full max-w-md">
      <div role="tablist" className="mb-6 grid grid-cols-2 rounded-md border border-line p-1 text-sm">
        {(["register", "login"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-10 rounded font-semibold ${mode === m ? "bg-raised text-paper" : "text-muted"}`}
          >
            {m === "register" ? "Register" : "Log in"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === "register" && !registrationOpen && <Notice tone="warn">Registration is closed right now. Already registered? Log in.</Notice>}
        {mode === "register" && (
          <Field label="Full name" error={errors.name}>
            <Input value={form.name} onChange={set("name")} autoComplete="name" maxLength={60} />
          </Field>
        )}
        <Field label="USN" error={errors.usn} hint="Your university seat number, e.g. 1SV22CS001">
          <Input value={form.usn} onChange={set("usn")} autoCapitalize="characters" autoComplete="username" maxLength={16} />
        </Field>
        {mode === "register" && (
          <Field label="Branch (optional)" error={errors.branch}>
            <Input value={form.branch} onChange={set("branch")} maxLength={40} />
          </Field>
        )}
        <Field label="6-digit PIN" error={errors.pin} hint={mode === "register" ? "Choose one and remember it: you'll log in with it." : undefined}>
          <Input value={form.pin} onChange={set("pin")} inputMode="numeric" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} maxLength={6} />
        </Field>
        {errors.form && <Notice>{errors.form}</Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || (mode === "register" && !registrationOpen)}>
          {busy ? "Please wait…" : mode === "register" ? "Register" : "Log in"}
        </Button>
      </form>
    </Panel>
  );
}
