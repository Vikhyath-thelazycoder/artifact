// Demo video: one complete ARTIFEX event on the TEST project, recorded side by side from the admin console, the
// projector and one participant's phone, plus a caption log, then joined into a single 1920×1080 MP4 (demo/,
// git-ignored). Same approach as the AI Musical Chair demo.
//
// The admin and the phone are driven through the real UI (forms, buttons, dialogs, file picker). The other 19
// participants are bots that register and upload real posters through the same APIs as the bot test.
//
//   npx tsx --env-file=.env.local scripts/record-demo.ts
//
// With GEMINI_API_KEY set, judging uses real Gemini; otherwise the dev-only fake judge (labelled in the video).
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const PORT = 3100;
const SITE = `http://127.0.0.1:${PORT}`;
process.env.TEST_APP_URL = SITE; // before the harness loads
const OUT = resolve("demo");
const WORK = join(OUT, "work");
const BOTS = 19; // + the phone participant = 20
const DURATION = 75;
const REAL_AI = Boolean(process.env.GEMINI_API_KEY);
const THEME = { title: "Save Water, Save Life", brief: "A poster for World Water Day at Techvidya: make people want to save water." };
const PHONE = { name: "Ananya Rao", usn: `4SU${String(Date.now()).slice(-7)}`, branch: "CSE", pin: "482913" };
const ADMIN_EMAIL = `demo-admin-${Date.now()}@staff.artifex.test`;
const ADMIN_PASSWORD = `demo-${Math.random().toString(36).slice(2)}A9!`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startServer(): Promise<ChildProcess> {
  // A dev server on its own port and build dir, pointed at the TEST project. The fake judge only works outside
  // production builds, which is why this isn't `next start`.
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: SITE,
    NEXT_DIST_DIR: ".next-demo",
    NEXT_TELEMETRY_DISABLED: "1",
    ...(REAL_AI ? {} : { AI_JUDGE_FAKE: "1", GEMINI_STEP_GAP_MS: "2200" }),
  };
  const server = spawn("npx", ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: "ignore" });
  return new Promise((ok, fail) => {
    const until = Date.now() + 90_000;
    const poll = async () => {
      try {
        if ((await fetch(`${SITE}/rules`)).ok) return ok(server);
      } catch {}
      if (Date.now() > until) return fail(new Error("server didn't start"));
      setTimeout(poll, 500);
    };
    void poll();
  });
}

const captionHtml = `<!doctype html><html><head><style>
  html,body{margin:0;height:100%;background:#0E0D0B;color:#F4EFE6;font-family:-apple-system,system-ui,sans-serif}
  .wrap{padding:28px 26px;display:flex;flex-direction:column;height:100%;box-sizing:border-box;
    background-image:linear-gradient(to right,#34302a55 1px,transparent 1px),linear-gradient(to bottom,#34302a55 1px,transparent 1px);background-size:48px 48px}
  .kicker{color:#FF5A1F;letter-spacing:.3em;font-weight:800;font-size:14px}
  h1{font-family:Georgia,serif;font-style:italic;font-weight:400;font-size:44px;margin:6px 0 4px}
  .sub{color:#A8A093;font-size:15px;line-height:1.5}
  .labels{margin:22px 0 14px;display:grid;gap:8px;font-size:15px}
  .labels b{color:#FF5A1F}
  ol{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:9px;font-size:16px;line-height:1.35;overflow:hidden;flex:1}
  li{color:#A8A093} li:last-child{color:#F4EFE6;font-weight:700;border-left:3px solid #FF5A1F;padding-left:10px}
</style></head><body><div class="wrap">
  <div class="kicker">TECHVIDYA</div><h1>Artifex</h1>
  <div class="sub">Automated demo · 20 participants (19 bots + 1 phone) · ${DURATION}-second round<br/>Judging: ${REAL_AI ? "Gemini" : "dev-only fake judge (no Gemini key set)"}</div>
  <div class="labels"><div><b>Top left</b> · admin console</div><div><b>Bottom left</b> · projector</div><div><b>Right</b> · participant phone (${PHONE.name})</div></div>
  <ol id="log"></ol></div></body></html>`;

async function caption(page: Page, line: string) {
  console.log("  " + line);
  await page.evaluate((l) => {
    const ol = document.getElementById("log")!;
    const li = document.createElement("li");
    li.textContent = l;
    ol.appendChild(li);
    while (ol.children.length > 18) ol.removeChild(ol.firstChild!);
  }, line);
}

async function main() {
  const h = await import("./lib/harness");
  const { pdfPoster, pngPoster } = await import("./lib/posters");
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  console.log("Starting the app against the test project…");
  const server = await startServer();
  // Warm up every page so the first compile doesn't show in the video.
  for (const p of ["/", "/play", "/screen", "/leaderboard", "/admin/login", "/admin", "/admin/judging"]) await fetch(SITE + p).catch(() => null);

  const contexts: { name: string; ctx: BrowserContext; page: Page; t: number }[] = [];
  let eventId = "";
  try {
    console.log("Setting up: demo admin, fresh event…");
    const { data: created, error } = await h.service.auth.admin.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true });
    if (error || !created.user) throw error ?? new Error("createUser failed");
    await h.service.from("staff").insert({ user_id: created.user.id, role: "admin", display_name: "Demo host" });
    const admin = await h.makeStaff("admin", "demo-bot-admin");
    eventId = await h.freshEvent(admin, "ARTIFEX · Techvidya 2026", {
      theme_title: THEME.title, theme_brief: THEME.brief, duration_seconds: DURATION, grace_seconds: 10, judging_mode: "ai", ai_finalists: 5,
    });
    await h.rpcOk(admin.client, "set_registration", { p_open: true });

    const posterPath = join(WORK, "ananya-save-water.pdf");
    writeFileSync(posterPath, pdfPoster("strong", 2026));

    // The full Chromium (not the headless shell) so its built-in PDF viewer renders PDF previews.
    const browser = await chromium.launch({ channel: "chromium", args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
    const open = async (name: string, width: number, height: number, url: string, extra: Parameters<typeof browser.newContext>[0] = {}) => {
      const ctx = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: join(WORK, name), size: { width, height } }, ...extra });
      const page = await ctx.newPage();
      contexts.push({ name, ctx, page, t: Date.now() });
      await page.goto(url);
      return page;
    };
    const cap = await (async () => {
      const ctx = await browser.newContext({ viewport: { width: 461, height: 1080 }, recordVideo: { dir: join(WORK, "caption"), size: { width: 461, height: 1080 } } });
      const page = await ctx.newPage();
      contexts.push({ name: "caption", ctx, page, t: Date.now() });
      await page.setContent(captionHtml);
      return page;
    })();
    const adminPage = await open("admin", 1280, 720, `${SITE}/admin/login`);
    const screen = await open("screen", 1280, 720, `${SITE}/screen`);
    const phone = await open("phone", 390, 844, `${SITE}/play`, {
      isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
    });

    await caption(cap, "The organiser logs in to the control room");
    await adminPage.getByLabel("Email").fill(ADMIN_EMAIL);
    await adminPage.getByLabel("Password").fill(ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "Sign in" }).click();
    await adminPage.waitForURL(`${SITE}/admin`);

    await caption(cap, `${PHONE.name} registers on her phone with USN + PIN`);
    await phone.getByLabel("Full name").pressSequentially(PHONE.name, { delay: 45 });
    await phone.getByLabel("USN").pressSequentially(PHONE.usn, { delay: 45 });
    await phone.getByLabel("Branch (optional)").fill(PHONE.branch);
    await phone.getByLabel("6-digit PIN").pressSequentially(PHONE.pin, { delay: 70 });
    await phone.getByRole("button", { name: "Register" }).click();
    await phone.getByText("You're in.").waitFor({ timeout: 20_000 });
    await sleep(1200);
    await caption(cap, "She accepts the rules; the theme stays hidden until the start");
    await phone.getByRole("button", { name: "I've read the rules" }).click();
    await sleep(1500);

    await caption(cap, `${BOTS} more participants register (bots)`);
    const usns = Array.from({ length: BOTS }, (_, i) => `9D${String(Date.now()).slice(-4)}${String(i).padStart(3, "0")}`);
    const names = ["Arjun", "Diya", "Kabir", "Meera", "Rohan", "Sana", "Vihaan", "Isha", "Aditya", "Nisha", "Karthik", "Pooja", "Rahul", "Sneha", "Varun", "Tara", "Nikhil", "Riya", "Siddharth"];
    const bots = [];
    for (const [i, usn] of usns.entries()) {
      const p = await h.makeParticipant(usn);
      const row = await h.rpcOk<{ id: string; code: string }>(p.client, "register_participant", { p_name: `${names[i]} ${"KMSRPV"[i % 6]}`, p_usn: usn, p_branch: "ECE" });
      await h.rpcOk(p.client, "acknowledge_rules");
      bots.push({ ...p, i, participantId: row.id });
    }
    await sleep(3500);

    await caption(cap, "Admin presses Start round and confirms");
    await adminPage.getByRole("button", { name: "Start round" }).first().click();
    await sleep(1800);
    await adminPage.getByRole("dialog").getByRole("button", { name: "Start round" }).click();
    await phone.getByText(THEME.title).first().waitFor({ timeout: 10_000 });
    await caption(cap, `Theme revealed everywhere at once: “${THEME.title}”`);
    await sleep(3000);

    // Bots upload over the round; the phone uploads half-way through.
    const uploads = (async () => {
      for (const b of bots) {
        await sleep(1000 + Math.random() * 1600);
        const png = b.i % 5 === 4;
        const bytes = png ? pngPoster(b.i) : pdfPoster((["strong", "medium", "weak", "off_theme", "medium", "image_only"] as const)[b.i % 6], b.i);
        const path = `events/${eventId}/${b.participantId}/${crypto.randomUUID()}.${png ? "png" : "pdf"}`;
        await h.storageUpload(b, path, bytes, png ? "image/png" : "application/pdf");
        await h.finalize(b, path, png ? "poster.png" : "poster.pdf");
      }
    })();
    await caption(cap, "Participants design in their own tools, then upload PNG / JPG / PDF");
    await sleep(14_000);
    await caption(cap, `${PHONE.name} picks her PDF and confirms the originality declaration`);
    await phone.locator('input[type="file"]').setInputFiles(posterPath);
    await sleep(1500);
    await phone.getByRole("checkbox").check();
    await sleep(1200);
    await phone.getByRole("button", { name: "Submit design" }).click();
    await phone.getByText("Submission received").waitFor({ timeout: 20_000 });
    await caption(cap, "Server receipt: reference, server time, file, version");
    await phone.getByText("Submission received").scrollIntoViewIfNeeded();
    await uploads;
    await caption(cap, "The projector counts submissions live");

    const { data: ev } = await h.service.from("events").select("deadline_at").eq("id", eventId).single();
    const left = Date.parse(ev!.deadline_at) + 10_000 - Date.now();
    await caption(cap, `Countdown runs on the server clock · ${Math.round(left / 1000)} s left (incl. grace)`);
    await sleep(Math.max(0, left - 22_000));
    await caption(cap, "Under 30 seconds: the timer turns red with a text warning");
    await sleep(Math.max(0, Date.parse(ev!.deadline_at) + 11_500 - Date.now()));
    await caption(cap, "Deadline + 10 s grace: the round closes by itself");
    await adminPage.reload();
    await sleep(3500);

    await caption(cap, "Admin opens Submissions: every design previews from the private bucket");
    await adminPage.getByRole("link", { name: "Submissions" }).click();
    await adminPage.locator("article img, article iframe").first().waitFor({ timeout: 20_000 });
    await sleep(5000);
    await adminPage.mouse.wheel(0, 700);
    await sleep(4000);
    await adminPage.mouse.wheel(0, 900);
    await sleep(3500);
    await caption(cap, "Admin opens Judging · mode: AI (Gemini)");
    await adminPage.getByRole("link", { name: "Judging" }).click();
    await adminPage.getByRole("button", { name: "Start AI judging" }).waitFor({ timeout: 15_000 });
    await sleep(1500);
    await adminPage.getByRole("button", { name: "Start AI judging" }).click();
    await caption(cap, "AI scores each design on the rubric, one at a time");
    const scoredAtLeast = async (n: number, ms: number) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const { data: run } = await h.service.from("ai_runs").select("id, status").eq("event_id", eventId).order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (!run) {
          await sleep(500);
          continue;
        }
        const { count } = await h.service.from("ai_scores").select("*", { count: "exact", head: true }).eq("run_id", run!.id).eq("status", "ok");
        if ((count ?? 0) >= n || run!.status !== "running") return run!;
        await sleep(500);
      }
      return null;
    };
    await scoredAtLeast(3, REAL_AI ? 180_000 : 60_000);
    await caption(cap, "The admin can cancel AI judging at any moment…");
    await sleep(800);
    await adminPage.getByRole("button", { name: "Cancel AI judging" }).click();
    await adminPage.getByRole("button", { name: "Run AI judging again" }).waitFor({ timeout: 10_000 });
    await caption(cap, "…cancelled: nothing more is recorded from that run");
    await sleep(3500);
    await caption(cap, "Run AI judging again, all the way through");
    await adminPage.getByRole("button", { name: "Run AI judging again" }).click();
    const until = Date.now() + (REAL_AI ? 15 * 60_000 : 180_000);
    let saidFinalists = false;
    for (;;) {
      const { data: run } = await h.service.from("ai_runs").select("status, phase").eq("event_id", eventId).order("started_at", { ascending: false }).limit(1).single();
      if (run?.phase === "finalists" && !saidFinalists) {
        saidFinalists = true;
        await caption(cap, "Top 5 finalists compared side by side (breaks ties only)");
      }
      if (run?.status === "completed") break;
      if (Date.now() > until) throw new Error("AI run didn't finish in time");
      await sleep(run?.phase === "finalists" ? 4000 : 1500);
    }
    await caption(cap, "AI judging complete: highest score first, with flags and summaries");
    await sleep(3000);
    await adminPage.getByRole("table").scrollIntoViewIfNeeded();
    await adminPage.mouse.wheel(0, 260);
    await sleep(6000);
    await caption(cap, "AI results are internal: only the admin sees them");
    await adminPage.mouse.wheel(0, 500);
    await sleep(5000);
    await adminPage.mouse.wheel(0, -2000);
    await sleep(1500);

    await caption(cap, "Results: compute the ranking from the AI scores");
    await adminPage.getByRole("tab", { name: "Results & publish" }).click();
    await sleep(1500);
    await adminPage.getByRole("button", { name: "Compute ranking" }).click();
    await adminPage.getByRole("cell", { name: "1", exact: true }).first().waitFor({ timeout: 15_000 });
    await caption(cap, "Ranks follow the score, highest first: the admin reviews before anything is public");
    await adminPage.getByRole("table").scrollIntoViewIfNeeded();
    await sleep(6500);
    await adminPage.mouse.wheel(0, -2000);
    await sleep(1000);
    await adminPage.getByRole("button", { name: "Publish results" }).click();
    await sleep(1500);
    await adminPage.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await caption(cap, "Published: the projector reveals the podium");
    await screen.getByText("The winners").waitFor({ timeout: 15_000 });
    await sleep(3000);
    await phone.getByText("Results are out.").waitFor({ timeout: 15_000 });
    await caption(cap, `${PHONE.name} opens the leaderboard`);
    await phone.getByRole("link", { name: "Open the leaderboard" }).click();
    await phone.waitForURL(`${SITE}/leaderboard`);
    await sleep(6000);
    const { data: mine } = await h.anon().rpc("public_results");
    const rank = (mine as { rows: { name: string; rank: number }[] }).rows.find((r) => r.name === PHONE.name)?.rank;
    await caption(cap, `Event complete · ${PHONE.name} finished #${rank ?? "?"} of 20`);
    await sleep(8000);

    for (const c of contexts) await c.ctx.close();
    await browser.close();

    console.log("Joining the recordings…");
    const start = Math.max(...contexts.map((c) => c.t));
    const input = async (name: string) => {
      const c = contexts.find((x) => x.name === name)!;
      return { path: (await c.page.video()!.path()) as string, offset: ((start - c.t) / 1000).toFixed(2) };
    };
    const [a, s, p, k] = [await input("admin"), await input("screen"), await input("phone"), await input("caption")];
    const out = join(OUT, "artifex-demo.mp4");
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-ss", a.offset, "-i", a.path, "-ss", s.offset, "-i", s.path, "-ss", p.offset, "-i", p.path, "-ss", k.offset, "-i", k.path,
      "-filter_complex",
      "[0:v]scale=960:540,setsar=1[a];[1:v]scale=960:540,setsar=1[s];[2:v]scale=499:1080,setsar=1[p];[3:v]scale=461:1080,setsar=1[k];" +
        "[a][s]vstack[left];[left][p][k]hstack=inputs=3,fps=30,format=yuv420p[v]",
      "-map", "[v]", "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-movflags", "+faststart", out,
    ]);
    console.log(`\nVideo: ${out}`);
  } finally {
    server.kill();
    await h.deleteCreatedUsers().catch(() => null);
    if (eventId) {
      const { data: me } = await h.service.auth.admin.listUsers({ perPage: 200 });
      for (const u of me?.users ?? []) {
        if (u.email === ADMIN_EMAIL || u.email === `${PHONE.usn.toLowerCase()}@participants.artifex.app`) await h.service.auth.admin.deleteUser(u.id);
      }
      await h.service.from("events").update({ is_current: false }).eq("id", eventId);
      await h.service.from("events").insert({ name: "ARTIFEX 2026" });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
