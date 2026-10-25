# Architecture: ARTIFEX

Decisions referenced as D-xxx are in [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md). The original specification is [ARTIFEX_ARCHITECTURE.md](../ARTIFEX_ARCHITECTURE.md).

## Major components

```
                       ┌──────────────────────────── Vercel (Next.js 15) ──────────────────────────────┐
 Participant ─HTTPS──▶ │ /  /rules  /play        landing, rules, register → lobby → live workspace      │
 Admin laptop ─HTTPS─▶ │ /admin/**               control room, settings, submissions, judging, audit     │
 Judge ───────HTTPS──▶ │ /admin/judging          blind rubric scoring                                   │
 Projector ───HTTPS──▶ │ /screen  /leaderboard   theme + countdown + counter, then the winners           │
                       │ /api/submissions/finalize   sniff + hash → finalize_submission (as the user)   │
                       │ /api/ai/step                one AI judging step (as the admin) ────────────┐   │
                       └───────────────┬────────────────────────────────────────────────────────────┼───┘
                                       │ supabase-js: RPC, Auth, Storage (user's own session)       │ @google/genai
                       ┌───────────────▼────────────────── Supabase ──────────────┐          ┌──────▼──────┐
                       │ Auth: participants (USN + PIN), staff (email)            │          │ Gemini API  │
                       │ Postgres: tables + RLS + security-definer RPCs + audit   │          │ (free key)  │
                       │ Storage: private bucket "submissions" + insert policy    │          └─────────────┘
                       │ Edge Function: participant-signup (service key inside)   │
                       └──────────────────────────────────────────────────────────┘
```

| Component | Responsibility | Lives in |
|---|---|---|
| Event engine (SQL) | State machine, deadline, auto-close, registration, finalisation, scoring, AI run state, results, audit (D-002) | `supabase/migrations/0003_rpc.sql` |
| Access rules (SQL) | RLS on every table; storage insert/select policies | `supabase/migrations/0002_rls_storage.sql` |
| Account creation | Pre-confirmed participant accounts; the only use of the service key (D-003) | `supabase/functions/participant-signup` |
| Participant app | Register/login, lobby, theme, countdown, upload with progress, receipt | `src/app/play`, `src/components/play`, `src/lib/participant` |
| Admin console | Control room, settings, gallery, judging (manual, AI, results), audit | `src/app/admin`, `src/components/admin` |
| AI judging | Prompts, schemas, validation, Gemini client, fake judge, step handler | `src/lib/ai`, `src/app/api/ai/step` |
| Public surfaces | Landing, rules, leaderboard, projector | `src/app/page.tsx`, `rules`, `leaderboard`, `screen`, `src/components/public` |
| Bot test | ≥ 20 bots through the real stack, with every rule checked | `scripts/bot-test.ts`, `scripts/lib` |

## Boundaries

- **Clients never write tables.** Every write goes through an RPC, and the RPC checks role, state and the database clock.
- **Uploads go straight to storage**, but only through the insert policy (own folder, window open). They count only once `finalize_submission` records them from the storage server's own metadata.
- **Both server routes run as the caller.** They forward the user's cookie or bearer token to Supabase, never the service role. RLS and the RPCs still decide.
- **The Gemini key lives only in the server environment.** It's imported only from `server-only` modules and is never `NEXT_PUBLIC_`.
- **The TypeScript code never decides outcomes.** It displays them. Ranking, deadlines and validity are SQL.

## Data flow

1. **Registration:**
   - The Edge Function creates the account.
   - The browser signs in with USN + PIN.
   - `register_participant` binds the USN to the account email and assigns `AFX-NNN`.
2. **Round:**
   - `start_round` writes `started_at` and `deadline_at`.
   - Every client polls `my_status` or `public_board`, gets `server_now`, computes the clock offset and counts down to the shared deadline.
3. **Submission:**
   - The browser uploads the file to storage, which checks the policy.
   - It then calls `/api/submissions/finalize`, which sniffs and hashes the file.
   - `finalize_submission` uses `storage.objects.created_at` as the arrival time and returns the receipt.
4. **Close:** the first RPC after `deadline + grace` flips the event to `closed` (`sync_current_event`).
5. **Judging:**
   - Manual: judges call `save_score`.
   - AI: the admin's browser loops `/api/ai/step`, and each step makes one Gemini call recorded by `record_ai_*`.
   - Cancel flips the run, so nothing more is recorded.
6. **Results:**
   - `compute_results` writes ranks.
   - The admin reviews them, then `publish_results` flips the event to `published`.
   - `public_results` then serves rank, code, name and score to everyone.

Full sequences: [SYSTEM_WORKFLOW.md](SYSTEM_WORKFLOW.md).

## Trust boundaries

| Boundary | Untrusted input | Control |
|---|---|---|
| Browser → Supabase RPC | Every argument | Role check, state check, regex/range validation, `auth.uid()` ownership, row locks |
| Browser → Storage | Object path, bytes, declared MIME type | Insert policy (path, window, rules), bucket type list + 10 MB cap; no update/delete policies |
| Browser → finalize route | Path, file name | Path regex, magic-byte sniff, SHA-256 on the server, file name used as display metadata only |
| Admin → AI step route | Run id | Admin check in the route and in every RPC; run state checked on every record |
| Design file → Gemini → server | Pixels / PDF text, model JSON | Design is data (system prompt), schema-constrained output, server validation + SQL range checks |
| Participant names → admin, projector, leaderboard | Text | Validation regex, React escaping, no `dangerouslySetInnerHTML` (lint rule), CSP |

## Failure modes

| Failure | Effect | Mitigation |
|---|---|---|
| Participant refreshes, sleeps the laptop or changes the device clock | Timer looks wrong | Deadline from the server; offset re-measured every poll and on wake |
| Network drops mid-upload | Upload incomplete | Nothing is shown as accepted until the receipt arrives; retry while the window is open; "Reconnecting…" badge |
| Upload completes after deadline + grace | Late | Storage policy refuses it; `finalize_submission` also checks the arrival time |
| Double click on Submit or Start | Duplicates | Buttons disabled while busy; finalisation idempotent per path; `start_round` checks state |
| Admin laptop dies mid-round | Console lost | All state is on the server; the round closes itself; log in elsewhere and continue |
| Admin closes the page during AI judging | Loop stops | The run stays `running`; reopening Judging resumes it automatically, or the admin cancels |
| Gemini free-tier limit (429) | Slower judging | The step returns a 20 s wait; the model chain falls back to other Flash models |
| Gemini can't read a design | Missing AI score | 3 attempts, then "unreadable"; results fall back to the manual score for that design (admin scores it) |
| Gemini returns nonsense or obeys a poster's instructions | Wrong score | Schema + validation; "contains_instructions" flag; the admin reviews the ranking before publishing |
| Supabase free-tier limits | Slow or refused requests | Polling every 3 s keeps load low (≈ 35 requests/s at 100 users); upgrade to Pro for the event day if needed |
