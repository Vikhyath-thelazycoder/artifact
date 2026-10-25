import { describe, expect, it, vi } from "vitest";
import { handleAiStep, type StepDeps } from "./step";

const RUN = "11111111-1111-1111-1111-111111111111";
const pdf = new TextEncoder().encode("%PDF-1.4 poster");
const verdict = JSON.stringify({
  scores: { theme: 20, originality: 15, hierarchy: 10, composition: 8, message: 5 },
  reasons: { theme: "", originality: "", hierarchy: "", composition: "", message: "" },
  flags: [],
  summary: "",
});

const item = (id: string) => ({ submission_id: id, version_id: `v-${id}`, storage_key: `k-${id}`, mime_type: "application/pdf" });

function deps(over: Partial<StepDeps> = {}, next: unknown = { state: "score", items: [item("s1")] }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "ai_next_batch") return { data: next, error: null };
    if (name === "admin_event") return { data: { theme_title: "Water", theme_brief: "" }, error: null };
    return { data: { recorded: true, state: "running" }, error: null };
  });
  const d: StepDeps = {
    role: async () => "admin",
    rpc,
    download: async () => pdf,
    judge: { parallelism: () => 1, score: vi.fn(async () => ({ text: verdict, model: "m" })), compare: vi.fn(async () => ({ text: "", model: "m" })) },
    ...over,
  };
  return { d, rpc };
}

describe("AI step", () => {
  it("is admin only and needs a configured judge", async () => {
    expect((await handleAiStep({ runId: RUN }, deps({ role: async () => "none" }).d)).status).toBe(401);
    expect((await handleAiStep({ runId: RUN }, deps({ role: async () => "user" }).d)).status).toBe(403);
    expect((await handleAiStep({ runId: RUN }, deps({ judge: null }).d)).body.code).toBe("AI_NOT_CONFIGURED");
    expect((await handleAiStep({ runId: "x" }, deps().d)).status).toBe(422);
  });

  it("scores one design and records it", async () => {
    const { d, rpc } = deps();
    const r = await handleAiStep({ runId: RUN }, d);
    expect(r.body).toMatchObject({ state: "running", step: "scored" });
    expect(rpc).toHaveBeenCalledWith("record_ai_score", expect.objectContaining({ p_submission: "s1", p_scores: expect.objectContaining({ theme: 20 }) }));
  });

  it("scores a whole batch at once, one design per key", async () => {
    const score = vi.fn(async () => ({ text: verdict, model: "m" }));
    const { d, rpc } = deps({ judge: { parallelism: () => 3, score, compare: async () => ({ text: "", model: "" }) } }, { state: "score", items: [item("a"), item("b"), item("c")] });
    const r = await handleAiStep({ runId: RUN }, d);
    expect(rpc).toHaveBeenCalledWith("ai_next_batch", { p_run: RUN, p_limit: 3 });
    expect(score).toHaveBeenCalledTimes(3);
    expect(r.body).toMatchObject({ state: "running", step: "scored", scored: 3, batch: 3 });
  });

  it("records a failure for a file that isn't a real image or PDF, without calling Gemini", async () => {
    const { d, rpc } = deps({ download: async () => new TextEncoder().encode("<svg>") });
    await handleAiStep({ runId: RUN }, d);
    expect(rpc).toHaveBeenCalledWith("record_ai_failure", expect.objectContaining({ p_code: "BAD_FILE" }));
    expect(d.judge!.score).not.toHaveBeenCalled();
  });

  it("waits on a quota error instead of failing the design", async () => {
    const { d, rpc } = deps({ judge: { parallelism: () => 1, score: async () => Promise.reject(new Error("AI_QUOTA")), compare: async () => ({ text: "", model: "" }) } });
    const r = await handleAiStep({ runId: RUN }, d);
    expect(r.body).toMatchObject({ step: "waiting", code: "AI_QUOTA" });
    expect(rpc).not.toHaveBeenCalledWith("record_ai_failure", expect.anything());
  });

  it("stops when the run was cancelled", async () => {
    const r = await handleAiStep({ runId: RUN }, deps({}, { state: "cancelled" }).d);
    expect(r.body).toEqual({ state: "cancelled" });
  });

  it("completes on rubric totals after three failed finalist comparisons", async () => {
    const { d, rpc } = deps({}, { state: "finalists", items: [{ submission_id: "a", storage_key: "k", mime_type: "application/pdf" }] });
    const r = await handleAiStep({ runId: RUN, finalistAttempt: 3 }, d);
    expect(r.body.step).toBe("finalists_skipped");
    expect(rpc).toHaveBeenCalledWith("record_ai_finalists", expect.objectContaining({ p_order: [] }));
  });
});
