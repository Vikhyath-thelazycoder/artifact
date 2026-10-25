"use client";

import { useState } from "react";
import { friendlyError } from "@/lib/errors";

/** Runs one admin action at a time: disables buttons while busy (no double clicks) and keeps the error. */
export function useAction(after?: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(name: string, fn: () => Promise<unknown>) {
    if (busy) return false;
    setBusy(name);
    setError(null);
    try {
      await fn();
      after?.();
      return true;
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : null));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, setError, run };
}
