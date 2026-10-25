import { RUBRIC, clampScores, type CriterionKey, type RubricScores } from "@/lib/rubric";

// Structured-output schemas Gemini must answer in, and validation of what it returns (SECURITY.md T-11:
// LLM output is untrusted).

export const FLAGS = ["off_theme", "unreadable", "possible_template", "contains_instructions", "blank_or_broken"] as const;

export const SCORE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: Object.fromEntries(RUBRIC.map((c) => [c.key, { type: "integer", minimum: 0, maximum: c.max }])),
      required: RUBRIC.map((c) => c.key),
    },
    reasons: {
      type: "object",
      properties: Object.fromEntries(RUBRIC.map((c) => [c.key, { type: "string" }])),
      required: RUBRIC.map((c) => c.key),
    },
    flags: { type: "array", items: { type: "string", enum: [...FLAGS] } },
    summary: { type: "string" },
  },
  required: ["scores", "reasons", "flags", "summary"],
} as const;

export const COMPARE_SCHEMA = {
  type: "object",
  properties: {
    order: { type: "array", items: { type: "string" }, description: "Labels, best first" },
    notes: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, note: { type: "string" } }, required: ["label", "note"] },
    },
  },
  required: ["order", "notes"],
} as const;

export type ScoreVerdict = {
  scores: RubricScores;
  reasons: Record<CriterionKey, string>;
  flags: string[];
  summary: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function parseJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new Error("AI_BAD_OUTPUT");
}

/** Every criterion must be present as a number; values are clamped to their range. */
export function validateScore(raw: string): ScoreVerdict {
  const v = parseJson(raw);
  const s = v.scores as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") throw new Error("AI_BAD_OUTPUT");
  for (const c of RUBRIC) {
    if (typeof s[c.key] !== "number" || !Number.isFinite(s[c.key] as number)) throw new Error("AI_BAD_OUTPUT");
  }
  const r = (v.reasons ?? {}) as Record<string, unknown>;
  const reasons = Object.fromEntries(RUBRIC.map((c) => [c.key, text(r[c.key], 240)])) as Record<CriterionKey, string>;
  const flags = Array.isArray(v.flags) ? [...new Set(v.flags.filter((f): f is string => (FLAGS as readonly string[]).includes(f as string)))] : [];
  return { scores: clampScores(s), reasons, flags, summary: text(v.summary, 600) };
}

/** The order must be a permutation of exactly the labels sent. */
export function validateCompare(raw: string, labels: string[]): { order: string[]; notes: Record<string, string> } {
  const v = parseJson(raw);
  const order = Array.isArray(v.order) ? v.order.map((x) => String(x).trim().toUpperCase().replace(/^DESIGN\s+/, "")) : [];
  if (order.length !== labels.length || new Set(order).size !== labels.length || !order.every((l) => labels.includes(l))) {
    throw new Error("AI_BAD_OUTPUT");
  }
  const notes: Record<string, string> = {};
  if (Array.isArray(v.notes)) {
    for (const n of v.notes as { label?: unknown; note?: unknown }[]) {
      const label = String(n?.label ?? "").trim().toUpperCase().replace(/^DESIGN\s+/, "");
      if (labels.includes(label)) notes[label] = text(n?.note, 300);
    }
  }
  return { order, notes };
}
