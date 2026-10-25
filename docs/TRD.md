# Technical Requirements: ARTIFEX

Decisions are referenced as D-xxx ([PROJECT_DECISIONS.md](PROJECT_DECISIONS.md)) and threats as T-xx ([SECURITY.md](SECURITY.md)).

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS v4 |
| Backend | Supabase: Postgres 17 (RLS + security-definer RPCs), Auth, Storage, one Edge Function (Deno) |
| AI | Gemini API through `@google/genai` (server routes only), on a normal free-tier key (D-008) |
| Tests | Vitest (unit, jsdom), Vitest integration against the test Supabase project, `scripts/bot-test.ts` end-to-end |
| Hosting | Vercel (app) + Supabase cloud (production project and a separate test project) |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). In short:
- The browser talks to Supabase directly for reads, RPCs and uploads.
- Two Next.js server routes exist because they need server-side work. `/api/submissions/finalize` checks magic bytes and hashes the file. `/api/ai/step` calls Gemini.
- Both routes act as the calling user, never with the service role.

## Infrastructure

- **Supabase production project:** apply migrations with `supabase db push`, deploy the function with `supabase functions deploy participant-signup`.
- **Supabase test project:** used by the bot test and the integration tests. It can also be the local stack (`supabase start`).
- **Vercel project:** production deployment for the event, preview deployments for rehearsals.
- **Private Storage bucket `submissions`:** 10 MB cap, accepts only `image/png`, `image/jpeg` and `application/pdf`.

## APIs

Every RPC raises an UPPER_SNAKE error code. [src/lib/errors.ts](../src/lib/errors.ts) maps each code to a readable message.

### Public (anon + authenticated)

| RPC | Returns |
|---|---|
| `public_board()` | `server_now`, the public event (the theme only once the round has started), counts of registered and submitted |
| `public_results()` | `{published:false, rows:[]}` until published, then `rows` of `{rank, code, name, score}` |

### Participant (authenticated)

| RPC / route | Behaviour |
|---|---|
| `register_participant(name, usn, branch)` | Needs registration open. The USN must match the account email (D-003). Idempotent. Assigns `AFX-NNN` |
| `acknowledge_rules()` | Sets `rules_ack_at` |
| `my_status()` | `server_now`, the public event, own participant row, own receipt + version history, `upload_open`, `upload_closes_at` |
| Storage `POST /storage/v1/object/submissions/events/<event>/<participant>/<uuid>.<ext>` | Allowed only by the `can_upload_object` policy: own folder, current event, rules accepted, window open (deadline + grace), replacement setting respected |
| `POST /api/submissions/finalize {path, filename}` | Reads the file back with the user's session, checks its magic bytes against the extension, computes SHA-256, then calls `finalize_submission` |
| `finalize_submission(path, filename, sha256)` | Takes size, type and arrival time from `storage.objects`. Accepts if the arrival time ≤ deadline + grace. Creates a version and returns the receipt. Idempotent per path |

### Staff

| RPC | Role | Behaviour |
|---|---|---|
| `admin_event()` | staff | Full event row + `server_now` |
| `judge_queue()` | staff | Blind list: code, active file key, own score (no name or USN) |
| `save_score(submission, theme, originality, hierarchy, composition, message, comment, submit)` | staff | Only while `closed`. Range-checked. Upsert per judge |
| `update_event_settings(p jsonb)` | admin | Theme and timing keys only in `setup` (`THEME_LOCKED` otherwise) |
| `set_registration(open)` | admin | Audited |
| `start_round()` | admin | `setup → live`. `deadline = now() + duration`. Needs a theme |
| `extend_round(seconds, reason)` | admin | Live only, 10–1800 s, for everyone. Audited with the old and new deadline |
| `end_round(reason)` | admin | `deadline = now()`; in-flight uploads keep the grace period. Audited |
| `new_event(name)` | admin | Archives the current event and opens a fresh one in `setup` |
| `start_ai_run()` | admin | `closed` only, one running run at a time. Sets `judging_mode = ai` |
| `ai_next(run)` / `ai_next_batch(run, limit)` | admin | Next design(s) to score (up to one per Gemini key, D-018), or the finalists to compare, or the final state |
| `record_ai_score / record_ai_failure / record_ai_finalists` | admin | Ignored once the run is cancelled. Scores range-checked. The finalist order must be a permutation of the expected top N |
| `cancel_ai_run(run, reason)` | admin | Stops the run and audits it |
| `compute_results(source)` | admin | `manual` = mean of submitted judge totals; `ai` = latest completed run, falling back to manual for unreadable files. Ranks follow the score, highest first; the finalist comparison breaks ties between finalists (D-017) |
| `publish_results()` / `unpublish_results(reason)` | admin | `closed ↔ published`, audited |

### Edge Function

`participant-signup` takes `POST {usn, pin}` and returns `{status:"created"|"exists"}`. It creates a pre-confirmed account `<usn>@participants.artifex.app` with the PIN as the password. It never changes an existing account.

### HTTP route: `POST /api/ai/step {runId, finalistAttempt}`

- Admin only, checked in the route and again in every RPC.
- Each step does one of three things:
  1. Score one design: download it with the admin's session, sniff its type, then call Gemini.
  2. Compare the finalists.
  3. Report a final state.
- Returns `{state, step, delayMs, code?}`. The admin's browser waits `delayMs` before the next step: 4.5 s by default, `GEMINI_STEP_GAP_MS`.
- On a quota error (`AI_QUOTA`) it asks for a 20 s wait instead of failing the design.

## Database

All tables are in `public`, all have RLS, and there are no client writes ([0001_schema.sql](../supabase/migrations/0001_schema.sql), [0002_rls_storage.sql](../supabase/migrations/0002_rls_storage.sql), [0003_rpc.sql](../supabase/migrations/0003_rpc.sql)).

| Table | Purpose | Key constraints |
|---|---|---|
| `staff` | Admin and judge accounts | role ∈ {admin, judge} |
| `events` | Config + state machine `setup → live → closed → published` | One `is_current` row. Live requires `started_at` and `deadline_at`. Duration 30–7200 s, grace 0–60 s, max file ≤ 10 MB |
| `participants` | Registration per event | Unique `(event, user)`, `(event, usn)`, `(event, code)`. USN `^[0-9A-Z]{6,12}$` |
| `submissions` | One per participant per event | Unique `(event, participant)`. `active_version_id` |
| `submission_versions` | Every accepted file | Unique `storage_key`, `(submission, version)`. SHA-256, server `received_at` |
| `scores` | Manual rubric scores | Per-criterion ranges. `total` is generated. Unique `(submission, judge)` |
| `ai_runs` | AI judging runs | One `running` per event (partial unique index) |
| `ai_scores` | AI verdict per design per run | Ranges, `total` generated, reasons, flags, `finalist_rank` |
| `results` | Computed ranking | Unique `(event, rank)` |
| `audit_logs` | Insert-only via RPCs | — |

**Auto-close:** `sync_current_event()` runs at the start of every state-dependent RPC. Once `now() > deadline + grace` it flips `live → closed`, so the round ends on time even if nobody presses a button.

## Integrations

- **Supabase Auth:**
  - Participants: email/password, where the email is synthetic and the password is the 6-digit PIN.
  - Staff: real email and a strong password.
  - Sessions use cookies (`@supabase/ssr`) in the browser, or a bearer token for scripts.
- **Supabase Storage:**
  - The browser uploads by XHR straight to the bucket, which gives upload progress and bypasses Vercel's 4.5 MB body limit.
  - Staff view files through 10-minute signed URLs.
- **Gemini:**
  - `generateContent` with `responseJsonSchema`, temperature 0.2.
  - Model chain: `GEMINI_MODEL` → `gemini-flash-latest` → `gemini-3-flash-preview` → `gemini-flash-lite-latest`. The next model is tried on 404, 429, 5xx or a timeout. Each model gets up to 22 s, within a 50 s budget per step.
  - Files go inline up to 15 MB per request, otherwise through the Files API.

## AI/LLM system

| Aspect | Design |
|---|---|
| Inputs | One design file + theme + rubric (scoring); top-N files labelled A, B, C… + theme + rubric (comparison). No names, USNs or codes (D-010) |
| Outputs | JSON: 5 integer scores, 5 one-line reasons, flags from a fixed list, summary / order + notes |
| Validation | [src/lib/ai/schema.ts](../src/lib/ai/schema.ts): rejects non-JSON or missing criteria, clamps ranges, drops unknown flags, requires the order to be a permutation. The SQL re-checks the ranges |
| Prompt injection | System prompt: design text is data; flag `contains_instructions`. The bot test includes a poster telling the AI to award 100 points |
| Failure handling | Bad output, timeout or error → that design is retried up to 3 times, then marked unreadable (manual fallback in results). Quota → wait and retry. Finalist comparison fails 3 times → rubric order only |
| Cancel | `cancel_ai_run` flips the run; any later `record_*` is ignored; the browser loop stops at once |
| Fake judge | `AI_JUDGE_FAKE=1` gives deterministic scores from the file hash. Refused when `NODE_ENV` or `VERCEL_ENV` is production |

## Runtime

- The participant, board and admin pages poll every 3 s (D-013) and immediately on tab focus or when the network returns.
- The countdown ticks locally from the shared `deadline_at` and a measured server clock offset.
- Route handlers run on the Node runtime with `maxDuration` of 30 s (finalize) and 60 s (AI step).

## Deployment

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Environment variables

| Variable | Where | Secret |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (all environments) | No (anon key; the env check refuses a service key) |
| `NEXT_PUBLIC_SITE_URL` | Vercel | No |
| `GEMINI_API_KEY`, `GEMINI_API_KEYS` (comma-separated pool, D-018) | Vercel server env | **Yes**: never `NEXT_PUBLIC_` |
| `GEMINI_PARALLEL` | Vercel (optional) | No |
| `GEMINI_MODEL`, `GEMINI_STEP_GAP_MS` | Vercel (optional) | No |
| `AI_JUDGE_FAKE` | Local / bot test only | No |
| `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_APP_URL` | Developer machine / CI only | Service key **yes** |
| `STAFF_SUPABASE_URL`, `STAFF_SUPABASE_SERVICE_ROLE_KEY` | Organiser's machine, only when running `create-staff` | **Yes** |

The production service-role key is never set in Vercel. Supabase injects it into the Edge Function itself.

## Dependencies

- **Runtime:** `next`, `react`, `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`, `@google/genai`, `zod`, `server-only`.
- **Dev:** TypeScript, Tailwind, ESLint, Vitest, Testing Library, jsdom, tsx.
- `postcss` is pinned to ≥ 8.5.23 through `overrides`, which clears the advisories in the PostCSS bundled with Next.js. `npm audit` reports 0 vulnerabilities.
