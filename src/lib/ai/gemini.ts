import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";
import { COMPARE_SCHEMA, SCORE_SCHEMA } from "./schema";
import { COMPARE_SYSTEM, SCORE_SYSTEM } from "./prompt";
import { createKeyPool, parseKeys, type KeyPool } from "./keys";
import type { DesignFile, Judge } from "./types";

// Keys live only in server env (never NEXT_PUBLIC_): GEMINI_API_KEYS (comma-separated) and/or GEMINI_API_KEY. Models are tried in order: GEMINI_MODEL if set, then a
// chain of Flash models. Google retires versions (404), throttles busy ones (503) and caps free-tier quota per
// model (429), so one model being unavailable must not stop judging (D-008).
export const MODEL_CHAIN = ["gemini-flash-latest", "gemini-3-flash-preview", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 50_000;
const PER_MODEL_MS = 22_000;
const QUOTA_REST_MS = 60_000;
// An overloaded (503), retired (404) or timed-out model is skipped by every key for this long.
const MODEL_REST_MS = 120_000;
const modelDownUntil = new Map<string, number>();
// Gemini's inline request limit is ~20 MB; larger sets go through the Files API (kept 48 h by Google).
const INLINE_LIMIT = 15 * 1024 * 1024;

const statusOf = (e: unknown) => (e as { status?: number })?.status ?? 0;
/** Worth trying another model: retired/unknown (404), over quota (429), overloaded (5xx). */
export const tryNextModel = (status: number) => status === 404 || status === 429 || (status >= 500 && status <= 504);

export function modelOrder(configured: string | undefined): string[] {
  return [...new Set([configured?.trim(), ...MODEL_CHAIN].filter((m): m is string => Boolean(m)))];
}

async function fileParts(ai: GoogleGenAI, files: DesignFile[]): Promise<Part[]> {
  const total = files.reduce((n, f) => n + f.bytes.byteLength, 0);
  if (total <= INLINE_LIMIT) {
    return files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: Buffer.from(f.bytes).toString("base64") } }));
  }
  return Promise.all(
    files.map(async (f) => {
      const up = await ai.files.upload({ file: new Blob([f.bytes as BlobPart], { type: f.mimeType }), config: { mimeType: f.mimeType } });
      return { fileData: { fileUri: up.uri!, mimeType: up.mimeType ?? f.mimeType } };
    }),
  );
}

let pool: KeyPool | null = null;
/** The configured keys (D-018), created once per server instance. */
function keyPool(): KeyPool {
  pool ??= createKeyPool(parseKeys(process.env));
  return pool;
}
export const keyCount = () => parseKeys(process.env).length;

/**
 * One request, tried across models and keys: for each model in the chain, every key with quota left is tried
 * before moving on. A key that answers 429 rests for that model for a minute. Each attempt gets its own time
 * slice, so one hanging model can't use up the whole budget.
 */
async function ask(system: string, schema: unknown, build: (ai: GoogleGenAI) => Promise<Part[]>): Promise<{ text: string; model: string }> {
  const keys = keyPool();
  const deadline = Date.now() + TIMEOUT_MS;
  let last: unknown;
  let timedOut = false;
  let quota = false;
  const models = modelOrder(process.env.GEMINI_MODEL);
  // Skip models that were overloaded or slow a moment ago (for every key), unless none are left.
  const healthy = models.filter((m) => (modelDownUntil.get(m) ?? 0) <= Date.now());
  for (const model of healthy.length ? healthy : models) {
    for (let tries = 0; tries < keys.size; tries++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) break;
      const lease = keys.acquire(model);
      if (!lease) {
        quota = true;
        break;
      }
      const ai = new GoogleGenAI({ apiKey: lease.key });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(PER_MODEL_MS, remaining));
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: await build(ai) }],
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            temperature: 0.2,
            abortSignal: controller.signal,
          },
        });
        return { text: res.text ?? "", model };
      } catch (e) {
        last = e;
        timedOut = controller.signal.aborted;
        const status = statusOf(e);
        if (status === 429) {
          quota = true;
          keys.rest(lease.key, model, QUOTA_REST_MS);
          continue; // same model, another key
        }
        if (!timedOut && !tryNextModel(status)) throw failure(last, timedOut, quota);
        // Down (404/5xx) or slow for everyone, not just this key: rest it for all keys.
        modelDownUntil.set(model, Date.now() + MODEL_REST_MS);
        break;
      } finally {
        clearTimeout(timer);
        lease.release();
      }
    }
  }
  throw failure(last, timedOut, quota);
}

function failure(last: unknown, timedOut: boolean, quota: boolean): Error {
  // Log the category and HTTP status only: never the prompt, the design or a key.
  console.error("gemini request failed:", last instanceof Error ? last.name : "unknown", statusOf(last));
  if (quota && !timedOut) return new Error("AI_QUOTA");
  return new Error(timedOut ? "AI_TIMEOUT" : quota ? "AI_QUOTA" : "AI_FAILED");
}

export const geminiJudge: Judge = {
  parallelism: () => Math.max(1, Math.min(keyCount(), Number(process.env.GEMINI_PARALLEL ?? 6))),
  async score(prompt, file) {
    return ask(SCORE_SYSTEM, SCORE_SCHEMA, async (ai) => [{ text: prompt }, ...(await fileParts(ai, [file]))]);
  },
  async compare(prompt, files) {
    return ask(COMPARE_SYSTEM, COMPARE_SCHEMA, async (ai) => {
      const media = await fileParts(ai, files.map((f) => f.file));
      const parts: Part[] = [{ text: prompt }];
      files.forEach((f, i) => parts.push({ text: `Design ${f.label}:` }, media[i]));
      return parts;
    });
  },
};
