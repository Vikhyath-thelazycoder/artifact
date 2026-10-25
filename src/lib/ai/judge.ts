import "server-only";

import { fakeJudge } from "./fake";
import { geminiJudge } from "./gemini";
import type { Judge } from "./types";

/** The configured judge, or null when no Gemini key is set. The fake judge never runs in production. */
export function configuredJudge(): Judge | null {
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (process.env.AI_JUDGE_FAKE === "1" && !production) return fakeJudge;
  return process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS ? geminiJudge : null;
}
