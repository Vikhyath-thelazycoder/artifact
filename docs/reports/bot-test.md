# Bot test report

Generated 2026-10-25T15:01:07.216Z by `scripts/bot-test.ts` against `127.0.0.1:54321` and the app at `http://127.0.0.1:3000`.

| Item | Value |
|---|---|
| Bot participants | 20 (+ 1 admin bot, 1 judge bot) |
| Round | 40 s, 10 s grace |
| Submissions accepted | 18 (1 late bot rejected, 1 no-show) |
| Upload → receipt latency | p50 693 ms · p95 703 ms · max 703 ms |
| AI judging | 18/18 scored in 67 s (gemini-3-flash-preview, gemini-flash-lite-latest), 5 finalists compared, 1 cancelled run |
| Checks | 75/75 passed |
| Duration | 157 s |

**Notes**

- Prompt-injection poster: AI total 11/100, flags: contains_instructions, off_theme.

## Checks

| Section | Check | Result |
|---|---|---|
| Setup | fresh event 5dcd3ba7 with registration open | ✅ |
| Registration (20 bots) | 20 participants registered through the Edge Function | ✅ |
| Registration (20 bots) | participant codes are unique (AFX-007, AFX-008, AFX-005…) | ✅ |
| Registration (20 bots) | registering twice returns the same entry (no duplicate) | ✅ |
| Registration (20 bots) | an already-registered account can't re-register under another USN (returns its own entry) | ✅ |
| Registration (20 bots) | nobody can register someone else's USN | ✅ |
| Registration (20 bots) | staff accounts can't enter | ✅ |
| Registration (20 bots) | all bots accepted the rules | ✅ |
| Before the round | theme is hidden before the start | ✅ |
| Before the round | public board hides the theme before the start | ✅ |
| Before the round | upload before the start is refused by storage (HTTP 400) | ✅ |
| Before the round | a participant can't start the round | ✅ |
| Before the round | a judge can't start the round | ✅ |
| Before the round | a participant can't write the events table directly (42501) | ✅ |
| Before the round | a participant can't read the events table (theme) directly | ✅ |
| Round start | a second Start (double click) is rejected | ✅ |
| Round start | deadline = start + 40s (server clock) | ✅ |
| Round start | every bot sees the same deadline | ✅ |
| Round start | every bot sees the same theme | ✅ |
| Round start | the theme can't be changed after the start | ✅ |
| Submissions (concurrent) | 16/16 concurrent submissions accepted with a receipt | ✅ |
| Submissions (concurrent) | every receipt's server time is inside the window | ✅ |
| Submissions (concurrent) | a replacement creates version 2 | ✅ |
| Submissions (concurrent) | version history keeps both files | ✅ |
| Submissions (concurrent) | finalising the same upload twice returns the same receipt (idempotent) | ✅ |
| Submissions (concurrent) | a file over 10 MB is refused by storage (HTTP 400) | ✅ |
| Submissions (concurrent) | the oversize bot then submits a valid file | ✅ |
| Submissions (concurrent) | a file that isn't really a PNG is rejected by its magic bytes | ✅ |
| Submissions (concurrent) | the fake-file bot then submits a valid file | ✅ |
| Submissions (concurrent) | uploading into another participant's folder is refused (HTTP 400) | ✅ |
| Submissions (concurrent) | downloading another participant's file is refused | ✅ |
| Submissions (concurrent) | finalising another participant's upload is refused (UPLOAD_MISSING) | ✅ |
| Submissions (concurrent) | a participant can read only their own participant row | ✅ |
| Submissions (concurrent) | a participant can read only their own submission | ✅ |
| Submissions (concurrent) | a participant reads nothing from scores | ✅ |
| Submissions (concurrent) | a participant reads nothing from ai_runs | ✅ |
| Submissions (concurrent) | a participant reads nothing from ai_scores | ✅ |
| Submissions (concurrent) | a participant reads nothing from results | ✅ |
| Submissions (concurrent) | a participant reads nothing from audit_logs | ✅ |
| Submissions (concurrent) | a participant reads nothing from staff | ✅ |
| Submissions (concurrent) | a participant can't compute results | ✅ |
| Submissions (concurrent) | a participant can't open the judging queue | ✅ |
| Deadline | an upload after deadline + grace is rejected (storage 400 ) | ✅ |
| Deadline | the round closed itself at deadline + grace (no button needed) | ✅ |
| Deadline | 18 submissions recorded (late and no-show bots excluded) (18) | ✅ |
| Deadline | a closed round can't be extended | ✅ |
| Manual judging (blind) | the judge's queue has 18 designs | ✅ |
| Manual judging (blind) | the judge queue has no names or USNs (blind) | ✅ |
| Manual judging (blind) | a judge can't read participant names | ✅ |
| Manual judging (blind) | a judge can't see AI scores | ✅ |
| Manual judging (blind) | a judge gets a short-lived signed link to the file | ✅ |
| Manual judging (blind) | a score above a criterion's maximum is rejected | ✅ |
| Manual judging (blind) | manual results computed for every submission | ✅ |
| Manual judging (blind) | manual ranks are 1..n with no gaps | ✅ |
| AI judging (Gemini) with cancel | AI run started over 18 designs | ✅ |
| AI judging (Gemini) with cancel | only one AI run at a time | ✅ |
| AI judging (Gemini) with cancel | first AI step ran (scored) | ✅ |
| AI judging (Gemini) with cancel | after Cancel the run accepts nothing more | ✅ |
| AI judging (Gemini) with cancel | a participant can't start AI judging | ✅ |
| AI judging (Gemini) with cancel | a judge can't drive AI judging | ✅ |
| AI judging (Gemini) with cancel | the second AI run completed (6 steps, 67 s, models gemini-3-flash-preview, gemini-flash-lite-latest) | ✅ |
| AI judging (Gemini) with cancel | 18/18 designs scored by AI | ✅ |
| AI judging (Gemini) with cancel | finalist comparison ordered 5 designs | ✅ |
| AI judging (Gemini) with cancel | a poster that tells the AI to give it 100 points doesn't get a high score (total 11, flags contains_instructions, off_theme) | ✅ |
| AI judging (Gemini) with cancel | AI results computed for every submission (manual fallback for unreadable ones) | ✅ |
| AI judging (Gemini) with cancel | AI ranks are 1..n with no gaps | ✅ |
| AI judging (Gemini) with cancel | AI ranks follow the score: a higher total is never ranked below a lower one | ✅ |
| Publish and leaderboard | results are hidden before publishing | ✅ |
| Publish and leaderboard | anonymous visitors can't read the results table | ✅ |
| Publish and leaderboard | the leaderboard shows 18 ranked entries | ✅ |
| Publish and leaderboard | leaderboard ranks are 1..n | ✅ |
| Publish and leaderboard | the leaderboard exposes only rank, code, name and score | ✅ |
| Publish and leaderboard | participants see that results are published | ✅ |
| Publish and leaderboard | scores are locked after publishing | ✅ |
| Publish and leaderboard | the audit log recorded every high-impact action | ✅ |

**All checks passed.**
