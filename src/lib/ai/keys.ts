// Several Gemini keys (GEMINI_API_KEYS=a,b,c plus GEMINI_API_KEY) shared by the AI step. Each call takes the key
// with the fewest calls in flight that isn't resting; a key or key+model that answers 429 rests for a while
// and the others carry on. State is per server instance, which is enough: a run is driven by one admin page.

export type KeyPool = {
  size: number;
  /** A key to use now for `model`, or null when every key is resting for it. */
  acquire(model: string): { key: string; release: () => void } | null;
  /** The key hit its quota for `model`: rest that pair. */
  rest(key: string, model: string, ms: number): void;
  /** Milliseconds until some key is usable for `model` again (0 when one is free now). */
  waitMs(model: string): number;
};

export function parseKeys(env: Record<string, string | undefined>): string[] {
  // Both variables accept a comma-separated list, so keys pasted into either one work.
  const list = `${env.GEMINI_API_KEYS ?? ""},${env.GEMINI_API_KEY ?? ""}`.split(",").map((k) => k.trim()).filter(Boolean);
  return [...new Set(list)];
}

export function createKeyPool(keys: string[], now: () => number = Date.now): KeyPool {
  const inFlight = new Map(keys.map((k) => [k, 0]));
  const lastUsed = new Map(keys.map((k) => [k, 0]));
  const restUntil = new Map<string, number>(); // `${key}\u0000${model}` → time
  const resting = (key: string, model: string) => (restUntil.get(`${key}\u0000${model}`) ?? 0) > now();

  return {
    size: keys.length,
    acquire(model) {
      const free = keys.filter((k) => !resting(k, model));
      if (free.length === 0) return null;
      free.sort((a, b) => inFlight.get(a)! - inFlight.get(b)! || lastUsed.get(a)! - lastUsed.get(b)!);
      const key = free[0];
      inFlight.set(key, inFlight.get(key)! + 1);
      lastUsed.set(key, now());
      let released = false;
      return {
        key,
        release: () => {
          if (!released) inFlight.set(key, inFlight.get(key)! - 1);
          released = true;
        },
      };
    },
    rest(key, model, ms) {
      restUntil.set(`${key}\u0000${model}`, now() + ms);
    },
    waitMs(model) {
      if (keys.some((k) => !resting(k, model))) return 0;
      return Math.max(0, Math.min(...keys.map((k) => restUntil.get(`${k}\u0000${model}`)! - now())));
    },
  };
}
