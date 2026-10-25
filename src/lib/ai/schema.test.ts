import { describe, expect, it } from "vitest";
import { validateCompare, validateScore } from "./schema";

const good = {
  scores: { theme: 25, originality: 20, hierarchy: 15, composition: 10, message: 8 },
  reasons: { theme: "On theme.", originality: "Fresh.", hierarchy: "Clear.", composition: "Balanced.", message: "Strong." },
  flags: ["contains_instructions", "made_up_flag", "contains_instructions"],
  summary: "Good poster.",
};

describe("AI output validation (T-11)", () => {
  it("accepts a complete verdict, clamps scores and drops unknown flags", () => {
    const v = validateScore(JSON.stringify({ ...good, scores: { ...good.scores, theme: 300 } }));
    expect(v.scores.theme).toBe(30);
    expect(v.flags).toEqual(["contains_instructions"]);
  });

  it("rejects non-JSON or a missing criterion", () => {
    expect(() => validateScore("I think it deserves 100")).toThrow("AI_BAD_OUTPUT");
    expect(() => validateScore(JSON.stringify({ ...good, scores: { theme: 20 } }))).toThrow("AI_BAD_OUTPUT");
    expect(() => validateScore(JSON.stringify({ ...good, scores: { ...good.scores, message: "ten" } }))).toThrow("AI_BAD_OUTPUT");
  });

  it("accepts only a permutation of the finalist labels", () => {
    expect(validateCompare(JSON.stringify({ order: ["b", "Design A", "C"], notes: [{ label: "A", note: "x" }] }), ["A", "B", "C"]).order).toEqual(["B", "A", "C"]);
    expect(() => validateCompare(JSON.stringify({ order: ["A", "A", "C"], notes: [] }), ["A", "B", "C"])).toThrow("AI_BAD_OUTPUT");
    expect(() => validateCompare(JSON.stringify({ order: ["A", "B"], notes: [] }), ["A", "B", "C"])).toThrow("AI_BAD_OUTPUT");
    expect(() => validateCompare(JSON.stringify({ order: ["A", "B", "Z"], notes: [] }), ["A", "B", "C"])).toThrow("AI_BAD_OUTPUT");
  });
});
