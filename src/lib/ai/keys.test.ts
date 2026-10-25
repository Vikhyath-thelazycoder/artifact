import { describe, expect, it } from "vitest";
import { createKeyPool, parseKeys } from "./keys";

describe("Gemini key pool", () => {
  it("reads GEMINI_API_KEYS and GEMINI_API_KEY, trimmed and de-duplicated", () => {
    expect(parseKeys({ GEMINI_API_KEYS: " a, b ,,a", GEMINI_API_KEY: "c" })).toEqual(["a", "b", "c"]);
    expect(parseKeys({ GEMINI_API_KEY: "a" })).toEqual(["a"]);
    expect(parseKeys({ GEMINI_API_KEY: "x, y,z" })).toEqual(["x", "y", "z"]);
    expect(parseKeys({})).toEqual([]);
  });

  it("spreads concurrent calls across keys", () => {
    const pool = createKeyPool(["a", "b", "c"]);
    const used = [pool.acquire("m")!, pool.acquire("m")!, pool.acquire("m")!].map((l) => l.key);
    expect(new Set(used)).toEqual(new Set(["a", "b", "c"]));
  });

  it("rests a key that hit its quota for that model only", () => {
    let t = 0;
    const pool = createKeyPool(["a", "b"], () => t);
    pool.rest("a", "m", 60_000);
    expect(pool.acquire("m")!.key).toBe("b");
    expect(pool.acquire("other")).not.toBeNull();
    pool.rest("b", "m", 30_000);
    expect(pool.acquire("m")).toBeNull();
    expect(pool.waitMs("m")).toBe(30_000);
    t = 31_000;
    expect(pool.acquire("m")!.key).toBe("b");
  });
});
