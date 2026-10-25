import { describe, expect, it } from "vitest";
import { RUBRIC, RUBRIC_TOTAL, clampScores, totalOf } from "./rubric";

describe("rubric", () => {
  it("is the approved 30/25/20/15/10 rubric out of 100", () => {
    expect(RUBRIC.map((c) => c.max)).toEqual([30, 25, 20, 15, 10]);
    expect(RUBRIC_TOTAL).toBe(100);
  });

  it("clamps to whole points within each criterion", () => {
    const s = clampScores({ theme: 99, originality: -4, hierarchy: 12.6, composition: "7", message: undefined });
    expect(s).toEqual({ theme: 30, originality: 0, hierarchy: 13, composition: 7, message: 0 });
    expect(totalOf(s)).toBe(50);
  });
});
