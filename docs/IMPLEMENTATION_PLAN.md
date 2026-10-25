# Implementation Plan: ARTIFEX

This is the single working plan. New work goes into the phase it belongs to. Status values:
`PLANNED` · `IN_PROGRESS` · `DONE` · `BLOCKED` · `DEFERRED`.

Decisions are referenced as D-xxx ([PROJECT_DECISIONS.md](PROJECT_DECISIONS.md)). Threats are referenced as T-xx ([SECURITY.md](SECURITY.md)).

**Inputs needed from the organisers**
- A Gemini API key. It goes in `.env.local` as `GEMINI_API_KEY`, never in chat or in git.
- For deployment: a Supabase cloud project (production) and a second one for testing, plus a Vercel project.
- The theme, kept secret until the round starts, and the event date.

There are four phases.

---

## P1 · Foundations and data
Status: **DONE** (2026-10-25)

**Objective:** a Next.js app that builds cleanly on a Supabase schema where every rule is enforced in the database.

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| T-101 | Scaffold Next.js 15 + TypeScript strict + Tailwind v4 + ESLint + Vitest | — | `npm run build`, `lint`, `typecheck` and `test` all pass |
| T-102 | Design tokens, fonts, UI primitives (Button, Panel, Badge, Field) | T-101 | Tokens match DESIGN.md; text contrast ≥ 4.5:1 |
| T-103 | Env validation (zod), Supabase browser/server/route clients, middleware session refresh | T-101 | A missing env var shows a setup page naming the variable, never its value |
| T-104 | Security headers + nonce CSP | T-103 | Every header from SECURITY.md is present (unit test) |
| T-105 | Migration: schema (events, staff, participants, submissions, versions, scores, ai_runs, ai_scores, results, audit_logs) | — | `supabase db reset` applies cleanly |
| T-106 | Migration: RLS, private `submissions` bucket and storage policies | T-105 | A participant can read only their own rows and files (T-01, T-02) |
| T-107 | Migration: RPCs for participants, admin event control, scoring, AI records, results | T-106 | Invalid transitions are rejected; times come from `now()` (T-04, T-05, T-08) |
| T-108 | `participant-signup` Edge Function + `scripts/create-staff.ts` | T-105 | Accounts are pre-confirmed; no service key outside Supabase or local scripts |

## P2 · Participant and admin event flow
Status: **DONE** (2026-10-25)

**Objective:** a participant can register, wait, see the theme, design for 10 minutes, upload and get a receipt. The admin runs the event from a laptop.

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| T-201 | Landing page and rules page (rules, tools, formats, deadline policy, rubric) | T-102 | Readable at 360 px; rubric and deadline policy match D-005 and D-012 |
| T-202 | Register / log in (USN + PIN), rules acknowledgement | T-108 | Duplicate USN is handled; refreshing returns to the same state |
| T-203 | Lobby → live workspace: theme reveal, server-synced countdown (2-minute and 30-second warnings) | T-107 | Refresh and device-clock changes don't affect the timer (T-05) |
| T-204 | Upload: client checks → private storage → `/api/submissions/finalize` (magic-byte sniff, SHA-256) → receipt | T-203 | Nothing shows "accepted" before the server confirms; replacements create versions |
| T-205 | Admin: login, dashboard (counts, live participant table), controls (registration, start, extend, end) with confirmation dialogs | T-107 | Only valid actions are enabled; every action is audited |
| T-206 | Admin: event settings (name, theme, brief, duration, grace, max size, replacement, judging mode, finalists) | T-205 | Theme and timing lock once the round starts |
| T-207 | Admin: submissions gallery (signed URLs, versions) | T-204 | Staff only; participant links never work for other participants (T-02) |
| T-208 | Projector board `/screen`: theme, giant countdown, submission counter | T-203 | Readable from the back of a hall; no private data |

## P3 · Judging, AI and leaderboard
Status: **DONE** (2026-10-25). The AI path is verified with the fake judge; a real Gemini run is pending a `GEMINI_API_KEY` in `.env.local`

**Objective:** the admin judges manually or lets Gemini judge (and can cancel), reviews the ranking and publishes the leaderboard.

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| T-301 | Manual scoring workspace (rubric sliders, comment, save draft / submit), blind by participant code | T-207 | Totals are computed in SQL; judges see only their own scores |
| T-302 | Gemini client: model chain, timeout, structured output, quota mapping | T-103 | Key never in the client bundle (T-10) |
| T-303 | AI judging run: start → step loop (score one design per step) → finalist comparison → complete; progress UI; **Cancel** | T-302, T-107 | A cancelled run records nothing more; another run can start; AI output is validated (T-11) |
| T-304 | Results: compute from Manual or AI, leaderboard preview with tie-break notes, publish / unpublish (audited) | T-301, T-303 | Ranks are 1..n with no gaps; nothing is public before publishing (T-07) |
| T-305 | Public leaderboard `/leaderboard` + projector reveal (podium + table) | T-304 | Shows only rank, code, name and score; "Judging in progress" before publishing |
| T-306 | Audit log page | T-205 | Every high-impact action is listed with actor, time and reason |

## P4 · Bot testing, hardening and release
Status: **IN_PROGRESS**. T-401, T-402 and T-403 are done (75/75 bot checks, 27 unit + 13 integration tests, no secrets in the bundle, 0 audit findings). T-404 and T-405 need the organisers' Supabase, Vercel and Gemini accounts

**Objective:** proof that the whole event works with at least 20 participants under attack, then deployment.

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| T-401 | `scripts/bot-test.ts`: ≥ 20 bots register, upload real PDF/PNG posters concurrently, replace, attack; admin closes, runs AI (real Gemini or fake), cancels, completes, computes, publishes; checks every rule | P2, P3 | Report `docs/reports/bot-test.md` is all green |
| T-402 | Security integration tests (RLS, storage, admin RPCs, deadline) against local Supabase | P1 | All negative tests pass |
| T-403 | Bundle secret check after build + `npm audit` | T-101 | No secret value or secret-shaped token in client files; no high or critical advisories |
| T-404 | Deploy: Supabase prod (migrations, function, auth limits), Vercel env vars, staff accounts | T-401 | RELEASE_CHECKLIST.md §1 done |
| T-405 | Rehearsal with real phones on the venue Wi-Fi + Gemini quota check | T-404 | RELEASE_CHECKLIST.md §2 signed off |

---

## Change history

| Date | Change |
|---|---|
| 2026-10-25 | P1–P3 done; P4 bot test, security tests and audit done; deployment and rehearsal remain |
| 2026-10-25 | Plan created with four phases from ARTIFEX_ARCHITECTURE.md and the user's decisions (Gemini-only AI judging, admin-chosen mode with cancel, ≥ 20-bot test, leaderboard UI) |
