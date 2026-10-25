import { createHash } from "node:crypto";
import { RUBRIC } from "@/lib/rubric";
import type { Judge } from "./types";

// Deterministic stand-in for Gemini (AI_JUDGE_FAKE=1). Development and the bot test only: judge.ts refuses it in
// production. Scores derive from the file's hash, so the same file always gets the same score.

function scoresFor(bytes: Uint8Array) {
  const h = createHash("sha256").update(bytes).digest();
  return Object.fromEntries(RUBRIC.map((c, i) => [c.key, Math.round((h[i] / 255) * c.max * 0.6 + c.max * 0.3)]));
}

export const fakeJudge: Judge = {
  parallelism: () => Number(process.env.GEMINI_PARALLEL ?? 1),
  async score(_prompt, file) {
    const scores = scoresFor(file.bytes);
    const reasons = Object.fromEntries(RUBRIC.map((c) => [c.key, `Fake judge: ${c.label.toLowerCase()} scored from the file hash.`]));
    return { text: JSON.stringify({ scores, reasons, flags: [], summary: "Deterministic fake verdict." }), model: "fake-judge" };
  },
  async compare(_prompt, files) {
    const total = (bytes: Uint8Array) => Object.values(scoresFor(bytes)).reduce((n, v) => n + v, 0);
    const order = [...files].sort((a, b) => total(b.file.bytes) - total(a.file.bytes)).map((f) => f.label);
    return { text: JSON.stringify({ order, notes: order.map((label) => ({ label, note: "Fake comparison." })) }), model: "fake-judge" };
  },
};
