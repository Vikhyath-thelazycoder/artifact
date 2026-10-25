// The judging rubric (PRD rule 9, spec §9.1). Keys match the scores / ai_scores columns.

export const RUBRIC = [
  { key: "theme", label: "Theme communication", max: 30, hint: "Does the poster clearly communicate the announced theme?" },
  { key: "originality", label: "Originality and concept", max: 25, hint: "Is the idea distinctive rather than a generic or copied layout?" },
  { key: "hierarchy", label: "Visual hierarchy and readability", max: 20, hint: "Is the headline clear? Can the message be understood quickly?" },
  { key: "composition", label: "Visual design and composition", max: 15, hint: "Typography, spacing, alignment, contrast and balance." },
  { key: "message", label: "Relevance and message clarity", max: 10, hint: "Do visuals and supporting text reinforce the theme?" },
] as const;

export type CriterionKey = (typeof RUBRIC)[number]["key"];
export type RubricScores = Record<CriterionKey, number>;

export const RUBRIC_TOTAL = RUBRIC.reduce((n, c) => n + c.max, 0);

export function totalOf(s: RubricScores): number {
  return RUBRIC.reduce((n, c) => n + s[c.key], 0);
}

/** Clamps to whole points in each criterion's range. */
export function clampScores(raw: Partial<Record<CriterionKey, unknown>>): RubricScores {
  const out = {} as RubricScores;
  for (const c of RUBRIC) {
    const v = Math.round(Number(raw[c.key]));
    out[c.key] = Number.isFinite(v) ? Math.min(c.max, Math.max(0, v)) : 0;
  }
  return out;
}

export function emptyScores(): RubricScores {
  return { theme: 0, originality: 0, hierarchy: 0, composition: 0, message: 0 };
}
