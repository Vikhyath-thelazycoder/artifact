// Black-box checks through the public API, exactly as an attacker would call it (SECURITY.md T-06, T-07).
// The full end-to-end flow with 20+ participants is scripts/bot-test.ts.
import { describe, expect, it } from "vitest";
import { anon, rpcErr } from "../scripts/lib/harness";

const adminRpcs: [string, Record<string, unknown>][] = [
  ["start_round", {}],
  ["end_round", { p_reason: "x x x" }],
  ["extend_round", { p_seconds: 60, p_reason: "x x x" }],
  ["update_event_settings", { p: { theme_title: "leak" } }],
  ["set_registration", { p_open: true }],
  ["compute_results", { p_source: "manual" }],
  ["publish_results", {}],
  ["start_ai_run", {}],
  ["new_event", { p_name: "x" }],
  ["judge_queue", {}],
  ["admin_event", {}],
];

describe("anonymous visitors", () => {
  it.each(adminRpcs)("cannot call %s", async (name, args) => {
    expect(await rpcErr(anon(), name, args)).toMatch(/permission denied|NOT_AUTHENTICATED/);
  });

  it("cannot read any table", async () => {
    for (const t of ["events", "participants", "submissions", "submission_versions", "scores", "ai_runs", "ai_scores", "results", "audit_logs", "staff"]) {
      const { data } = await anon().from(t).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it("can read the public board without the theme before the start, and no results before publishing", async () => {
    const { data: board } = await anon().rpc("public_board");
    if (board.event.status === "setup") expect(board.event.theme_title).toBeNull();
    const { data: results } = await anon().rpc("public_results");
    if (!results.published) expect(results.rows).toEqual([]);
  });
});
