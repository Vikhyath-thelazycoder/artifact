# System Workflow: ARTIFEX

## Event state machine

```
          start_round()                deadline + grace passes            publish_results()
 setup ─────────────────▶ live ─────────────────────────────────▶ closed ─────────────────────▶ published
   ▲  (theme, timing        │  extend_round(s, reason)          (judging:    ◀───────────────────
   │   editable)            │  end_round(reason) → deadline=now   manual/AI)   unpublish_results(reason)
   │                        └── uploads open until deadline + grace
   └──── new_event(name): archives the current event (not while live) and opens a fresh one in setup
```

Registration is a separate switch (`set_registration`). It can be open in `setup` and `live` and is forced closed on publish.

## User action → backend behaviour

| Actor | Action | Backend |
|---|---|---|
| Participant | Register | `participant-signup` (account) → sign in → `register_participant` (USN = account email, code assigned) |
| Participant | Log in | Supabase Auth with `<usn>@participants.artifex.app` + PIN |
| Participant | Accept rules | `acknowledge_rules` |
| Participant | Waits in the lobby | Polls `my_status` every 3 s. The theme is `null` until `live` |
| Admin | Start round | `start_round`: `deadline = now() + duration`, audit `round.started` |
| Participant | Submit | Storage insert (policy) → `/api/submissions/finalize` (sniff, SHA-256) → `finalize_submission` (arrival ≤ deadline + grace) → receipt, audit `submission.accepted` or `.replaced` |
| Admin | Extend / End | `extend_round` / `end_round`, both require a reason and are audited |
| — | Deadline + grace passes | The next RPC call runs `sync_current_event` → `closed`, audit `round.closed` |
| Judge / Admin | Score | `judge_queue` (blind) → `save_score` (draft or submit) |
| Admin | AI judging | `start_ai_run` → loop `/api/ai/step` → `ai_next` → Gemini → `record_ai_score` / `record_ai_failure` → finalists → `record_ai_finalists` |
| Admin | Cancel AI | `cancel_ai_run` → status `cancelled`; later records are ignored |
| Admin | Compute | `compute_results('manual' | 'ai')` → `results` rows, audit |
| Admin | Publish | `publish_results` → `published`; `public_results` starts returning rows |

## Data flow (submission, detailed)

1. The browser prechecks the extension (PNG, JPG, PDF) and the size against the event limit.
2. The participant ticks the originality declaration. Submit is disabled without it.
3. `XHR POST /storage/v1/object/submissions/events/<event>/<participant>/<uuid>.<ext>` is sent with the participant's token. The progress bar follows the upload.
4. The storage policy `can_upload_object` checks the path, the current event, the owner, rules accepted, `now() ≤ deadline + grace` and the replacement setting. The bucket checks the type and the 10 MB cap.
5. `POST /api/submissions/finalize`: the route downloads the object with the same session, requires the magic bytes to match the extension, and computes SHA-256.
6. `finalize_submission`:
   - locks the participant row;
   - returns the existing receipt if this path was already finalised;
   - reads size, type and `created_at` from `storage.objects`;
   - rejects the upload if it arrived after deadline + grace;
   - creates the submission (with reference `R-XXXXXXXX`) and a new version, then sets it active.
7. The browser shows the receipt: reference, server time, file name, version.

## Round end

- The deadline passes, and uploads in flight still have the grace period.
- At deadline + grace the storage policy refuses new objects, and the next RPC flips the event to `closed`.
- The participant view switches to "Pens down", and the admin sees "Go to judging".

## AI flow

```
Admin page                  /api/ai/step (as admin)                 Postgres                    Gemini
──────────                  ───────────────────────                 ────────                    ──────
start_ai_run() ───────────────────────────────────────────────────▶ run(running, scoring)
loop:
  POST {runId} ───────────▶ ai_next(run) ─────────────────────────▶ next unscored design
                            download(storage_key) (staff policy)
                            sniff magic bytes
                            score(theme, rubric, file) ─────────────────────────────────────▶ JSON verdict
                            validateScore()
                            record_ai_score() ─────────────────────▶ ignored if cancelled
  ◀── {state, delayMs} ────
  wait delayMs (4.5 s; 20 s after a 429)
...all scored →             ai_next → phase finalists, top N
                            compare(theme, rubric, A..N files) ─────────────────────────────▶ JSON order
                            validateCompare() → record_ai_finalists ▶ run completed
Cancel (any time) ── cancel_ai_run() ─────────────────────────────▶ run cancelled
```

## External API flow

| Service | Called from | Auth |
|---|---|---|
| Supabase REST/RPC, Auth, Storage | Browser, server routes, bot test | Anon key + the user's JWT |
| Supabase Edge Function `participant-signup` | Browser (registration), bot test | Anon key; the function holds the service key |
| Gemini `generateContent` (+ Files API for > 15 MB) | `/api/ai/step` only | `GEMINI_API_KEY` (server env) |

## State changes summary

| Field | Set by | When |
|---|---|---|
| `events.status` | `start_round`, `sync_current_event`, `publish_results`, `unpublish_results` | Start; deadline + grace; publish; correction |
| `events.deadline_at` | `start_round`, `extend_round`, `end_round` | Start, extension, early end |
| `submissions.active_version_id` | `finalize_submission` | Each accepted upload |
| `scores.*` | `save_score` | While closed |
| `ai_runs.status/phase` | `start_ai_run`, `ai_next`, `record_ai_finalists`, `cancel_ai_run` | Run lifecycle |
| `results.*` | `compute_results` | On demand while closed |

## Verification

- `npm test` (27 unit tests): time, files, rubric, AI output validation, AI step handler, env, CSP, participant validation.
- `npm run test:integration` (13 tests): anonymous visitors can't call admin RPCs or read tables.
- `npm run bot-test` (75 checks with 20 bots): the full workflow above, including attacks, cancel and publish. Latest report: [reports/bot-test.md](reports/bot-test.md).
