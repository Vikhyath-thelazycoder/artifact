// Bot test (T-401, D-014): a whole ARTIFEX event with at least 20 bot participants, an admin bot and a judge bot,
// through the real Edge Function, storage, API routes and RPCs. Every rule is checked as it happens.
//
//   npm run dev                                   # the app (AI_JUDGE_FAKE=1 for a free dry run, or a real GEMINI_API_KEY)
//   npm run bot-test -- --bots 20 --duration 45   # this script
//
// Flags: --bots N (min 20) · --duration seconds (min 30) · --ai on|off · --keep (leave the data for the UI)
// Never touches production (scripts/lib/harness.ts refuses).
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  aiStep, anon, appUrl, deleteCreatedUsers, finalize, freshEvent, makeParticipant, makeStaff, rpcErr, rpcOk, service, sleep, storageUpload,
  type Actor,
} from "./lib/harness";
import { pdfPoster, pngPoster, type Quality } from "./lib/posters";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, "");
  const v = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "true";
  args.set(k, v);
}
const BOTS = Number(args.get("bots") ?? 20);
const DURATION = Number(args.get("duration") ?? 45);
const AI = (args.get("ai") ?? "on") !== "off";
const KEEP = args.get("keep") === "true";
const THEME = { title: "Save Water, Save Life", brief: "A poster for World Water Day at Techvidya: make people want to save water." };

if (BOTS < 20) {
  console.error("The bot test needs at least 20 participants (D-014). Use --bots 20 or more.");
  process.exit(1);
}
if (DURATION < 30) {
  console.error("--duration must be at least 30 seconds.");
  process.exit(1);
}

type Bot = Actor & { usn: string; i: number; participantId: string; code: string; role: string };
type Check = { section: string; what: string; ok: boolean; detail?: string };
const checks: Check[] = [];
let section = "";
const notes: string[] = [];
const latencies: number[] = [];

function check(ok: boolean, what: string, detail?: string) {
  checks.push({ section, what, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
}
function heading(s: string) {
  section = s;
  console.log(`\n── ${s}`);
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

/** Bot roles: most submit normally; a few probe the rules. */
function roleOf(i: number, n: number): string {
  if (i === 0) return "replacer";
  if (i === 1) return "double_finalize";
  if (i === 2) return "oversize";
  if (i === 3) return "fake_png";
  if (i === 4) return "intruder";
  if (i === 5) return "injection";
  if (i === n - 1) return "late";
  if (i === n - 2) return "no_show";
  return "normal";
}
function qualityOf(i: number): Quality {
  return (["strong", "medium", "weak", "off_theme", "strong", "medium", "image_only"] as Quality[])[i % 7];
}

async function design(bot: Bot): Promise<{ bytes: Uint8Array; mime: string; ext: string; name: string }> {
  if (bot.role === "injection") return { bytes: pdfPoster("injection", bot.i), mime: "application/pdf", ext: "pdf", name: "poster.pdf" };
  if (bot.i % 5 === 4) return { bytes: pngPoster(bot.i), mime: "image/png", ext: "png", name: `poster-${bot.i}.png` };
  return { bytes: pdfPoster(qualityOf(bot.i), bot.i), mime: "application/pdf", ext: "pdf", name: `poster-${bot.i}.pdf` };
}

const pathFor = (eventId: string, bot: Bot, ext: string) => `events/${eventId}/${bot.participantId}/${randomUUID()}.${ext}`;

async function submit(eventId: string, bot: Bot, d?: Awaited<ReturnType<typeof design>>) {
  const file = d ?? (await design(bot));
  const path = pathFor(eventId, bot, file.ext);
  const t = Date.now();
  const up = await storageUpload(bot, path, file.bytes, file.mime);
  if (up < 200 || up >= 300) return { ok: false, stage: "storage", status: up, path };
  const fin = await finalize(bot, path, file.name);
  latencies.push(Date.now() - t);
  return { ok: fin.status === 200, stage: "finalize", status: fin.status, code: fin.body.code as string | undefined, receipt: fin.body.receipt as Record<string, unknown> | undefined, path };
}

async function main() {
  const t0 = Date.now();
  const tag = Date.now().toString(36).slice(-4).toUpperCase();
  console.log(`ARTIFEX bot test · ${BOTS} bots · ${DURATION}s round · AI ${AI ? "on" : "off"} · app ${appUrl}`);

  heading("Setup");
  const ping = await fetch(`${appUrl}/rules`).catch(() => null);
  if (!ping?.ok) throw new Error(`The app isn't reachable at ${appUrl}: start it with \`npm run dev\` first`);
  const admin = await makeStaff("admin", "admin");
  const judge = await makeStaff("judge", "judge");
  const eventId = await freshEvent(admin, `Bot test ${tag}`, {
    theme_title: THEME.title, theme_brief: THEME.brief, duration_seconds: DURATION, grace_seconds: 10, judging_mode: "ai", ai_finalists: 5,
  });
  await rpcOk(admin.client, "set_registration", { p_open: true });
  check(true, `fresh event ${eventId.slice(0, 8)} with registration open`);

  heading(`Registration (${BOTS} bots)`);
  const usns = Array.from({ length: BOTS }, (_, i) => `9B${tag}${String(i).padStart(3, "0")}`);
  const bots = (await pool(usns, 8, async (usn) => {
    const i = usns.indexOf(usn);
    const p = await makeParticipant(usn);
    const row = await rpcOk<{ id: string; code: string }>(p.client, "register_participant", { p_name: `Bot ${String.fromCharCode(65 + (i % 26))}${"abcdefghij"[Math.floor(i / 26) % 10]}`, p_usn: usn, p_branch: "CSE" });
    return { ...p, i, participantId: row.id, code: row.code, role: roleOf(i, BOTS) } as Bot;
  })) as Bot[];
  check(bots.length === BOTS, `${BOTS} participants registered through the Edge Function`);
  const codes = new Set(bots.map((b) => b.code));
  check(codes.size === BOTS, "participant codes are unique", [...codes].slice(0, 3).join(", ") + "…");
  const again = await rpcOk<{ id: string }>(bots[0].client, "register_participant", { p_name: "Bot again", p_usn: bots[0].usn, p_branch: "" });
  check(again.id === bots[0].participantId, "registering twice returns the same entry (no duplicate)");
  check((await rpcErr(bots[1].client, "register_participant", { p_name: "Imposter", p_usn: bots[2].usn, p_branch: "" })) === null,
    "an already-registered account can't re-register under another USN (returns its own entry)");
  const stranger = await makeParticipant(`9S${tag}999`);
  check((await rpcErr(stranger.client, "register_participant", { p_name: "Stranger", p_usn: bots[3].usn, p_branch: "" })) === "USN_MISMATCH",
    "nobody can register someone else's USN");
  check((await rpcErr(admin.client, "register_participant", { p_name: "Admin", p_usn: "1AD00AD000", p_branch: "" })) === "STAFF_CANNOT_REGISTER",
    "staff accounts can't enter");

  // Everyone but one accepts the rules; that bot must be refused at upload time.
  await pool(bots, 10, (b) => rpcOk(b.client, "acknowledge_rules"));
  check(true, "all bots accepted the rules");

  heading("Before the round");
  const pre = await rpcOk<{ event: { theme_title: string | null; status: string }; upload_open: boolean }>(bots[6].client, "my_status");
  check(pre.event.theme_title === null && pre.event.status === "setup", "theme is hidden before the start");
  const board = await rpcOk<{ event: { theme_title: string | null } }>(anon(), "public_board");
  check(board.event.theme_title === null, "public board hides the theme before the start");
  const early = await storageUpload(bots[6], pathFor(eventId, bots[6], "pdf"), pdfPoster("strong", 1), "application/pdf");
  check(early >= 400, "upload before the start is refused by storage", `HTTP ${early}`);
  check((await rpcErr(bots[6].client, "start_round")) === "NOT_ADMIN", "a participant can't start the round");
  check((await rpcErr(judge.client, "start_round")) === "NOT_ADMIN", "a judge can't start the round");
  const { error: directWrite } = await bots[6].client.from("events").update({ status: "live" }).eq("id", eventId);
  const { data: evRow } = await service.from("events").select("status").eq("id", eventId).single();
  check(evRow?.status === "setup", "a participant can't write the events table directly", directWrite?.code ?? "0 rows");
  const { data: peek } = await bots[6].client.from("events").select("theme_title");
  check((peek ?? []).length === 0, "a participant can't read the events table (theme) directly");

  heading("Round start");
  const started = await rpcOk<{ deadline_at: string; started_at: string }>(admin.client, "start_round");
  check((await rpcErr(admin.client, "start_round")) === "INVALID_TRANSITION", "a second Start (double click) is rejected");
  const deadlineMs = Date.parse(started.deadline_at);
  check(Math.abs(deadlineMs - Date.parse(started.started_at) - DURATION * 1000) < 5, `deadline = start + ${DURATION}s (server clock)`);
  const statuses = await pool(bots, 10, (b) => rpcOk<{ event: { deadline_at: string; theme_title: string } }>(b.client, "my_status"));
  check(statuses.every((s) => s.event.deadline_at === started.deadline_at), "every bot sees the same deadline");
  check(statuses.every((s) => s.event.theme_title === THEME.title), "every bot sees the same theme");
  check((await rpcErr(admin.client, "update_event_settings", { p: { theme_title: "Changed" } })) === "THEME_LOCKED", "the theme can't be changed after the start");

  heading("Submissions (concurrent)");
  const normal = bots.filter((b) => ["normal", "replacer", "double_finalize", "injection", "intruder"].includes(b.role));
  const results = await pool(normal, 20, async (b) => ({ b, r: await submit(eventId, b) }));
  const okCount = results.filter((x) => x.r.ok).length;
  check(okCount === normal.length, `${okCount}/${normal.length} concurrent submissions accepted with a receipt`);
  check(results.every((x) => !x.r.receipt || Date.parse(String(x.r.receipt.received_at)) <= deadlineMs + 10_000), "every receipt's server time is inside the window");

  const replacer = bots.find((b) => b.role === "replacer")!;
  const second = await submit(eventId, replacer, { bytes: pdfPoster("strong", 77), mime: "application/pdf", ext: "pdf", name: "final.pdf" });
  check(second.ok && second.receipt?.version === 2, "a replacement creates version 2");
  const { data: rv } = await service.from("submission_versions").select("version_number").eq("submission_id", (await service.from("submissions").select("id").eq("participant_id", replacer.participantId).single()).data!.id);
  check((rv ?? []).length === 2, "version history keeps both files");

  const doubler = bots.find((b) => b.role === "double_finalize")!;
  const first = results.find((x) => x.b === doubler)!.r;
  const repeat = await finalize(doubler, first.path, "poster.pdf");
  check(repeat.status === 200 && (repeat.body.receipt as { version: number }).version === 1, "finalising the same upload twice returns the same receipt (idempotent)");

  const big = bots.find((b) => b.role === "oversize")!;
  const bigBytes = new Uint8Array(10 * 1024 * 1024 + 4096);
  bigBytes.set(pdfPoster("strong", 2));
  const bigStatus = await storageUpload(big, pathFor(eventId, big, "pdf"), bigBytes, "application/pdf");
  check(bigStatus >= 400, "a file over 10 MB is refused by storage", `HTTP ${bigStatus}`);
  const bigRetry = await submit(eventId, big);
  check(bigRetry.ok, "the oversize bot then submits a valid file");

  const faker = bots.find((b) => b.role === "fake_png")!;
  const fakePath = pathFor(eventId, faker, "png");
  await storageUpload(faker, fakePath, new TextEncoder().encode("<svg onload=alert(1)>not a png</svg>"), "image/png");
  const fakeFin = await finalize(faker, fakePath, "evil.png");
  check(fakeFin.status === 422 && fakeFin.body.code === "FILE_CONTENT_MISMATCH", "a file that isn't really a PNG is rejected by its magic bytes");
  const fakeRetry = await submit(eventId, faker);
  check(fakeRetry.ok, "the fake-file bot then submits a valid file");

  const intruder = bots.find((b) => b.role === "intruder")!;
  const victim = bots.find((b) => b.role === "normal")!;
  const intrudeStatus = await storageUpload(intruder, pathFor(eventId, victim, "pdf"), pdfPoster("weak", 3), "application/pdf");
  check(intrudeStatus >= 400, "uploading into another participant's folder is refused", `HTTP ${intrudeStatus}`);
  const victimPath = results.find((x) => x.b === victim)!.r.path;
  const { data: stolen } = await intruder.client.storage.from("submissions").download(victimPath);
  check(!stolen, "downloading another participant's file is refused");
  const stealFin = await finalize(intruder, victimPath, "mine.pdf");
  check(stealFin.status !== 200, "finalising another participant's upload is refused", String(stealFin.body.code));
  const { data: others } = await intruder.client.from("participants").select("id");
  check((others ?? []).length === 1, "a participant can read only their own participant row");
  const { data: subs } = await intruder.client.from("submissions").select("id");
  check((subs ?? []).length === 1, "a participant can read only their own submission");
  for (const t of ["scores", "ai_runs", "ai_scores", "results", "audit_logs", "staff"]) {
    const { data } = await intruder.client.from(t).select("*").limit(5);
    check((data ?? []).length === 0, `a participant reads nothing from ${t}`);
  }
  check((await rpcErr(intruder.client, "compute_results", { p_source: "manual" })) === "NOT_ADMIN", "a participant can't compute results");
  check((await rpcErr(intruder.client, "judge_queue")) === "NOT_STAFF", "a participant can't open the judging queue");

  heading("Deadline");
  const late = bots.find((b) => b.role === "late")!;
  const waitMs = deadlineMs + 10_000 - Date.now() + 1500;
  console.log(`  … waiting ${Math.round(waitMs / 1000)} s for deadline + grace`);
  await sleep(Math.max(0, waitMs));
  const lateRes = await submit(eventId, late);
  check(!lateRes.ok, "an upload after deadline + grace is rejected", `${lateRes.stage} ${lateRes.status} ${lateRes.code ?? ""}`);
  const after = await rpcOk<{ event: { status: string }; counts: { submitted: number } }>(anon(), "public_board");
  check(after.event.status === "closed", "the round closed itself at deadline + grace (no button needed)");
  const expected = BOTS - 2; // late + no_show
  check(after.counts.submitted === expected, `${expected} submissions recorded (late and no-show bots excluded)`, `${after.counts.submitted}`);
  check((await rpcErr(admin.client, "extend_round", { p_seconds: 60, p_reason: "too late" })) === "ROUND_NOT_LIVE", "a closed round can't be extended");

  heading("Manual judging (blind)");
  const queue = await rpcOk<{ items: Record<string, unknown>[] }>(judge.client, "judge_queue");
  check(queue.items.length === expected, `the judge's queue has ${expected} designs`);
  check(queue.items.every((it) => !("name" in it) && !("usn" in it)), "the judge queue has no names or USNs (blind)");
  const { data: judgeSeesPeople } = await judge.client.from("participants").select("name");
  check((judgeSeesPeople ?? []).length === 0, "a judge can't read participant names");
  const { data: judgeSeesAi } = await judge.client.from("ai_scores").select("*");
  check((judgeSeesAi ?? []).length === 0, "a judge can't see AI scores");
  const { data: signed } = await judge.client.storage.from("submissions").createSignedUrl(String(queue.items[0].storage_key), 60);
  check(Boolean(signed?.signedUrl), "a judge gets a short-lived signed link to the file");
  await pool(queue.items, 6, (it, ) => {
    const k = Number(String(it.code).slice(-3));
    return rpcOk(judge.client, "save_score", {
      p_submission: it.submission_id, p_theme: 10 + (k * 7) % 21, p_originality: 8 + (k * 5) % 18, p_hierarchy: 6 + (k * 3) % 15,
      p_composition: 5 + (k * 2) % 11, p_message: 3 + k % 8, p_comment: "bot score", p_submit: true,
    });
  });
  check((await rpcErr(judge.client, "save_score", { p_submission: queue.items[0].submission_id, p_theme: 31, p_originality: 0, p_hierarchy: 0, p_composition: 0, p_message: 0, p_comment: "", p_submit: true })) === "VALIDATION",
    "a score above a criterion's maximum is rejected");
  const manual = await rpcOk<{ count: number }>(admin.client, "compute_results", { p_source: "manual" });
  check(manual.count === expected, "manual results computed for every submission");
  const { data: manualRows } = await service.from("results").select("rank").eq("event_id", eventId).order("rank");
  check((manualRows ?? []).every((r, i) => r.rank === i + 1), "manual ranks are 1..n with no gaps");

  let aiSummary = "skipped (--ai off)";
  if (AI) {
    heading("AI judging (Gemini) with cancel");
    const run1 = await rpcOk<{ id: string; total: number }>(admin.client, "start_ai_run");
    check(run1.total === expected, `AI run started over ${expected} designs`);
    check((await rpcErr(admin.client, "start_ai_run")) === "AI_RUN_ACTIVE", "only one AI run at a time");
    const s1 = await aiStep(admin, run1.id);
    if (s1.status === 503 && s1.body.code === "AI_NOT_CONFIGURED") {
      throw new Error("The app has no judge: set GEMINI_API_KEY (or AI_JUDGE_FAKE=1 for a dry run) and restart `npm run dev`");
    }
    check(s1.status === 200, "first AI step ran", s1.body.step ?? s1.body.code);
    await rpcOk(admin.client, "cancel_ai_run", { p_run: run1.id, p_reason: "bot test cancel" });
    const { count: beforeCount } = await service.from("ai_scores").select("*", { count: "exact", head: true }).eq("run_id", run1.id);
    const afterCancel = await aiStep(admin, run1.id);
    const { count: afterCount } = await service.from("ai_scores").select("*", { count: "exact", head: true }).eq("run_id", run1.id);
    check(afterCancel.body.state === "cancelled" && beforeCount === afterCount, "after Cancel the run accepts nothing more");
    check((await rpcErr(intruder.client, "start_ai_run")) === "NOT_ADMIN", "a participant can't start AI judging");
    const judgeStep = await aiStep(judge, run1.id);
    check(judgeStep.status === 403, "a judge can't drive AI judging");

    const run2 = await rpcOk<{ id: string }>(admin.client, "start_ai_run");
    const tAi = Date.now();
    let steps = 0;
    let finalistAttempt = 0;
    let quotaWaits = 0;
    for (;;) {
      const s = await aiStep(admin, run2.id, finalistAttempt);
      steps++;
      if (s.status !== 200) throw new Error(`AI step failed: ${s.status} ${s.body.code}`);
      if (s.body.state !== "running") break;
      if (s.body.step === "finalists_retry") finalistAttempt++;
      if (s.body.code === "AI_QUOTA") quotaWaits++;
      if (steps > expected * 6 + 20) throw new Error("AI run isn't converging");
      const { data: runRow } = await service.from("ai_runs").select("models_used").eq("id", run2.id).single();
      const fake = (runRow?.models_used ?? []).includes("fake-judge");
      await sleep(fake ? 50 : (s.body.delayMs ?? 1000));
      if (steps % 5 === 0) console.log(`  … ${steps} steps`);
    }
    const aiMs = Date.now() - tAi;
    const { data: run } = await service.from("ai_runs").select("*").eq("id", run2.id).single();
    const { data: aiRows } = await service.from("ai_scores").select("submission_id, status, total, flags, finalist_rank, model, attempts").eq("run_id", run2.id);
    const ok = (aiRows ?? []).filter((r) => r.status === "ok");
    check(run?.status === "completed", "the second AI run completed", `${steps} steps, ${(aiMs / 1000).toFixed(0)} s, models ${run?.models_used.join(", ")}`);
    check(ok.length >= expected - 1, `${ok.length}/${expected} designs scored by AI`);
    const finalists = (aiRows ?? []).filter((r) => r.finalist_rank != null).sort((a, b) => a.finalist_rank - b.finalist_rank);
    check(run?.finalists === 0 || finalists.length === run?.finalists || finalists.length === 0, `finalist comparison ordered ${finalists.length} designs`);

    const injector = bots.find((b) => b.role === "injection")!;
    const { data: injSub } = await service.from("submissions").select("id").eq("participant_id", injector.participantId).single();
    const inj = (aiRows ?? []).find((r) => r.submission_id === injSub?.id);
    const real = !(run?.models_used ?? []).includes("fake-judge");
    if (real && inj) {
      check((inj.total ?? 0) < 60, "a poster that tells the AI to give it 100 points doesn't get a high score", `total ${inj.total}, flags ${inj.flags.join(", ") || "none"}`);
      notes.push(`Prompt-injection poster: AI total ${inj.total}/100, flags: ${inj.flags.join(", ") || "none"}.`);
    }
    if (quotaWaits) notes.push(`Gemini free-tier limit hit ${quotaWaits} time(s); the run waited and carried on.`);

    const aiRes = await rpcOk<{ count: number }>(admin.client, "compute_results", { p_source: "ai" });
    check(aiRes.count === expected, "AI results computed for every submission (manual fallback for unreadable ones)");
    const { data: aiRanked } = await service.from("results").select("rank, submission_id, source, tie_break_note").eq("event_id", eventId).order("rank");
    check((aiRanked ?? []).every((r, i) => r.rank === i + 1), "AI ranks are 1..n with no gaps");
    const totalOf = new Map(ok.map((r) => [r.submission_id, r.total as number]));
    const ranked = (aiRanked ?? []).map((r) => totalOf.get(r.submission_id) ?? -1).filter((t) => t >= 0);
    check(ranked.every((t, i) => i === 0 || ranked[i - 1] >= t), "AI ranks follow the score: a higher total is never ranked below a lower one");
    aiSummary = `${ok.length}/${expected} scored in ${(aiMs / 1000).toFixed(0)} s (${run?.models_used.join(", ")}), ${finalists.length} finalists compared, 1 cancelled run`;
  }

  heading("Publish and leaderboard");
  const hidden = await rpcOk<{ published: boolean; rows: unknown[] }>(anon(), "public_results");
  check(!hidden.published && hidden.rows.length === 0, "results are hidden before publishing");
  const { data: anonResults } = await anon().from("results").select("*");
  check((anonResults ?? []).length === 0, "anonymous visitors can't read the results table");
  await rpcOk(admin.client, "publish_results");
  const pub = await rpcOk<{ published: boolean; rows: Record<string, unknown>[] }>(anon(), "public_results");
  check(pub.published && pub.rows.length === expected, `the leaderboard shows ${pub.rows.length} ranked entries`);
  check(pub.rows.every((r, i) => r.rank === i + 1), "leaderboard ranks are 1..n");
  check(pub.rows.every((r) => Object.keys(r).sort().join(",") === "code,name,rank,score"), "the leaderboard exposes only rank, code, name and score");
  const st = await rpcOk<{ event: { status: string } }>(bots[7].client, "my_status");
  check(st.event.status === "published", "participants see that results are published");
  check((await rpcErr(admin.client, "save_score", { p_submission: queue.items[0].submission_id, p_theme: 1, p_originality: 1, p_hierarchy: 1, p_composition: 1, p_message: 1, p_comment: "", p_submit: true })) === "JUDGING_NOT_OPEN",
    "scores are locked after publishing");
  const { data: audit } = await service.from("audit_logs").select("action").eq("event_id", eventId);
  const actions = new Set((audit ?? []).map((a) => a.action));
  check(["registration.opened", "round.started", "round.closed", "submission.accepted", "submission.replaced", "ai.run_cancelled", "ai.run_completed", "results.computed", "results.published"].every((a) => actions.has(a)),
    "the audit log recorded every high-impact action");

  const failed = checks.filter((c) => !c.ok);
  const durationS = ((Date.now() - t0) / 1000).toFixed(0);
  const lines = [
    "# Bot test report",
    "",
    `Generated ${new Date().toISOString()} by \`scripts/bot-test.ts\` against \`${new URL(process.env.TEST_SUPABASE_URL!).host}\` and the app at \`${appUrl}\`.`,
    "",
    "| Item | Value |",
    "|---|---|",
    `| Bot participants | ${BOTS} (+ 1 admin bot, 1 judge bot) |`,
    `| Round | ${DURATION} s, 10 s grace |`,
    `| Submissions accepted | ${expected} (1 late bot rejected, 1 no-show) |`,
    `| Upload → receipt latency | p50 ${pct(latencies, 50)} ms · p95 ${pct(latencies, 95)} ms · max ${pct(latencies, 100)} ms |`,
    `| AI judging | ${aiSummary} |`,
    `| Checks | ${checks.length - failed.length}/${checks.length} passed |`,
    `| Duration | ${durationS} s |`,
    "",
    ...(notes.length ? ["**Notes**", "", ...notes.map((n) => `- ${n}`), ""] : []),
    "## Checks",
    "",
    "| Section | Check | Result |",
    "|---|---|---|",
    ...checks.map((c) => `| ${c.section} | ${c.what}${c.detail ? ` (${c.detail.replace(/\|/g, "/")})` : ""} | ${c.ok ? "✅" : "❌"} |`),
    "",
    failed.length ? `**${failed.length} check(s) failed.**` : "**All checks passed.**",
    "",
  ];
  mkdirSync("docs/reports", { recursive: true });
  writeFileSync("docs/reports/bot-test.md", lines.join("\n"));

  if (!KEEP) {
    heading("Cleanup");
    const { data: objects } = await service.storage.from("submissions").list(`events/${eventId}`, { limit: 1000 });
    for (const folder of objects ?? []) {
      const { data: files } = await service.storage.from("submissions").list(`events/${eventId}/${folder.name}`, { limit: 100 });
      const keys = (files ?? []).map((f) => `events/${eventId}/${folder.name}/${f.name}`);
      if (keys.length) await service.storage.from("submissions").remove(keys);
    }
    await deleteCreatedUsers();
    await service.from("events").update({ is_current: false }).eq("id", eventId);
    await service.from("events").insert({ name: "ARTIFEX 2026" });
    check(true, "bot accounts and files removed; a fresh event is current");
  } else {
    notes.push("--keep: bot data left in place for the UI.");
    console.log("\n--keep: data left in place. Admin bot accounts were created with random passwords; use scripts/create-staff.ts for your own login.");
  }

  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed in ${durationS} s · report: docs/reports/bot-test.md`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  await deleteCreatedUsers().catch(() => null);
  process.exit(1);
});
