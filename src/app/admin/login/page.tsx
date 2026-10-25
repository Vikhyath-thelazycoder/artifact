"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Notice } from "@/components/ui/Field";
import { Eyebrow, Panel } from "@/components/ui/Panel";
import { Wordmark } from "@/components/ui/Wordmark";
import { friendlyError } from "@/lib/errors";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const client = getBrowserSupabase();
    const { error: signIn } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (signIn) {
      setBusy(false);
      return setError(friendlyError(signIn.message));
    }
    const { data: role } = await client.rpc("staff_role");
    if (!role) {
      await client.auth.signOut();
      setBusy(false);
      return setError("This account isn't an organiser or judge.");
    }
    router.replace(role === "admin" ? "/admin" : "/admin/judging");
    router.refresh();
  }

  return (
    <main className="drafting flex min-h-dvh items-center justify-center px-4">
      <Panel className="w-full max-w-sm space-y-6">
        <div>
          <Wordmark />
          <Eyebrow className="mt-4">Organisers and judges</Eyebrow>
          <h1 className="mt-1 font-display text-4xl">Staff login</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
