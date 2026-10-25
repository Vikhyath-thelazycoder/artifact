"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clockOffset } from "@/lib/time";

export const POLL_MS = 3000;

/**
 * Polls `fetcher` every few seconds (D-013), right away when the tab becomes visible again (a sleeping laptop
 * or phone re-syncs on wake, spec §11.1), and on demand via `refresh`. Measures the server clock offset from
 * the `server_now` field when the result has one.
 */
export function usePoll<T extends { server_now?: string }>(fetcher: () => Promise<T>, ms = POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [offset, setOffset] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const refresh = useCallback(async () => {
    const sent = Date.now();
    try {
      const next = await fetchRef.current();
      const received = Date.now();
      if (next?.server_now) setOffset(clockOffset(next.server_now, sent, received));
      setData(next);
      setError(null);
      setOffline(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/fetch|network/i.test(msg)) setOffline(true);
      else setError(msg);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, ms);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [refresh, ms]);

  return { data, error, offline, offset, refresh };
}

/** Re-renders every `ms` for a ticking countdown. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
