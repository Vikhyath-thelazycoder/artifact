"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Notice } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { friendlyError } from "@/lib/errors";
import { joinEvent } from "@/lib/participant/auth";
import { fieldErrors, registrationSchema } from "@/lib/participant/validation";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** Signed in (e.g. from an earlier event) but not registered for this one. */
export function JoinPanel({ usn, registrationOpen, onDone }: { usn: string; registrationOpen: boolean; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", branch: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registrationSchema.safeParse({ ...form, usn, pin: "000000" });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      await joinEvent(getBrowserSupabase(), parsed.data);
      onDone();
    } catch (err) {
      setErrors({ form: friendlyError(err instanceof Error ? err.message : null) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mx-auto w-full max-w-md">
      <h2 className="font-display text-3xl">Join this event</h2>
      <p className="mt-1 text-sm text-muted">Signed in as {usn}.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {!registrationOpen && <Notice tone="warn">Registration is closed right now.</Notice>}
        <Field label="Full name" error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />
        </Field>
        <Field label="Branch (optional)" error={errors.branch}>
          <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} maxLength={40} />
        </Field>
        {errors.form && <Notice>{errors.form}</Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !registrationOpen}>
          {busy ? "Please wait…" : "Join"}
        </Button>
      </form>
    </Panel>
  );
}
