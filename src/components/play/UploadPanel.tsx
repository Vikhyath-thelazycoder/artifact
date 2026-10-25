"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Field";
import { friendlyError } from "@/lib/errors";
import { ACCEPT, precheckFile } from "@/lib/files";
import { uploadDesign } from "@/lib/participant/upload";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/time";
import type { MyStatus, Receipt } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "selected"; file: File; mime: string }
  | { kind: "busy"; file: File; fraction: number; phase: "uploading" | "validating" }
  | { kind: "error"; message: string };

export function UploadPanel({ status, onReceipt }: { status: MyStatus; onReceipt: (r: Receipt) => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [declared, setDeclared] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const e = status.event;
  const replacing = Boolean(status.submission);

  function pick(f: File | undefined) {
    if (!f) return;
    const check = precheckFile(f, e.max_file_bytes);
    setState(check.ok ? { kind: "selected", file: f, mime: check.mime } : { kind: "error", message: friendlyError(check.code) });
  }

  async function send() {
    if (state.kind !== "selected" || !declared || !status.participant) return;
    const { file, mime } = state;
    setState({ kind: "busy", file, fraction: 0, phase: "uploading" });
    try {
      const receipt = await uploadDesign(
        getBrowserSupabase(),
        { eventId: e.id, participantId: status.participant.id },
        file,
        mime,
        (fraction, phase) => setState({ kind: "busy", file, fraction, phase }),
      );
      setState({ kind: "idle" });
      if (input.current) input.current.value = "";
      onReceipt(receipt);
    } catch (err) {
      setState({ kind: "error", message: friendlyError(err instanceof Error ? err.message : null) });
    }
  }

  const busy = state.kind === "busy";
  return (
    <div className="space-y-4">
      <label
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${busy ? "border-line opacity-60" : "border-line hover:border-signal"}`}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          if (!busy) pick(ev.dataTransfer.files[0]);
        }}
      >
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(ev) => pick(ev.target.files?.[0])} />
        {state.kind === "selected" || state.kind === "busy" ? (
          <>
            <span className="max-w-full truncate font-semibold">{state.file.name}</span>
            <span className="text-sm text-muted">{formatBytes(state.file.size)} · tap to choose another</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{replacing ? "Choose a replacement file" : "Choose your design file"}</span>
            <span className="text-sm text-muted">PNG, JPG or PDF · up to {formatBytes(e.max_file_bytes)} · or drop it here</span>
          </>
        )}
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--signal)]" checked={declared} onChange={(ev) => setDeclared(ev.target.checked)} disabled={busy} />
        <span>
          I declare this design is <strong>my own original work</strong>, made during this round, and not copied, shared or modified from anyone
          else&apos;s design.
        </span>
      </label>

      {busy && (
        <div aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-signal transition-[width]" style={{ width: `${Math.round(state.fraction * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {state.phase === "uploading" ? `Uploading… ${Math.round(state.fraction * 100)}%` : "Checking your file…"} Don&apos;t close this page until you see the receipt.
          </p>
        </div>
      )}
      {state.kind === "error" && <Notice>{state.message}</Notice>}

      <Button size="lg" className="w-full" onClick={send} disabled={state.kind !== "selected" || !declared || busy}>
        {busy ? "Submitting…" : replacing ? "Replace submission" : "Submit design"}
      </Button>
    </div>
  );
}
