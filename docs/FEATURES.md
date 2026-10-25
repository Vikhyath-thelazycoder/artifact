# Features: ARTIFEX

## Feature list

| ID | Feature | Users | Where |
|---|---|---|---|
| F1 | Landing page with live status | Everyone | `/` |
| F2 | Rules and rubric | Everyone | `/rules` |
| F3 | Register / log in (USN + PIN) | Participant | `/play` |
| F4 | Lobby with rules acknowledgement | Participant | `/play` |
| F5 | Live workspace: theme, server-synced countdown | Participant | `/play` |
| F6 | Upload with progress, declaration, receipt, replacement | Participant | `/play` |
| F7 | Control room: counts, participant table, registration, start, extend, end, new event | Admin | `/admin` |
| F8 | Event settings: theme, brief, timing, files, judging mode, finalists | Admin | `/admin/settings` |
| F9 | Submissions gallery with version history | Admin | `/admin/submissions` |
| F10 | Manual blind scoring | Admin, judge | `/admin/judging` |
| F11 | AI judging with Gemini: progress, resume, **cancel** | Admin | `/admin/judging` |
| F12 | Results: compute (AI or manual), review, publish, unpublish | Admin | `/admin/judging` |
| F13 | Public leaderboard (podium + table) | Everyone | `/leaderboard` |
| F14 | Projector board: theme, giant countdown, counter, winners | Audience | `/screen` |
| F15 | Audit log | Admin | `/admin/audit` |
| F16 | Bot test (≥ 20 bots) | Developers | `npm run bot-test` |

## Feature details

### F3 · Register / log in
- Fields: name (2–60 letters), USN (6–12 letters and digits, normalised to upper case), optional branch, 6-digit PIN.
- The account is created by the Edge Function with no email. The USN is bound to the account, so nobody can register someone else's USN.
- Registering twice or refreshing never creates a duplicate.

### F5 · Live workspace
- The theme and brief appear for everyone when the admin starts the round.
- The countdown uses the server deadline and a measured clock offset. Refreshing the page or changing the device clock doesn't change it, and sleeping the laptop re-syncs on wake.
- Warnings appear at 2 minutes and 30 seconds. At zero the view becomes "Pens down".

### F6 · Upload
- PNG, JPG or PDF up to 10 MB, checked before uploading and again on the server.
- The originality declaration must be ticked before Submit.
- A progress bar is followed by "Checking your file…". The upload counts as accepted only when the receipt arrives (reference, server time, file, version).
- Replacing the file creates v2, v3… and the latest is judged.
- Rejections:
  - the round is closed;
  - the file is too large or the wrong type;
  - the file isn't really a PNG, JPG or PDF;
  - replacing is turned off.

### F7 · Control room
- **Stat tiles:** registered, accepted rules, submitted, missing, countdown, judging mode.
- **Start round:** a confirmation dialog shows the theme, duration, eligible count and deadline rule. A double click is harmless.
- **Extend for everyone** or **End round now** both need a reason, which goes in the audit log.
- **New event** archives the current one.

### F10 · Manual scoring
- A queue by participant code only.
- Each entry shows a large preview (image or sandboxed PDF), five rubric sliders with hints, a live total, a private comment, and Save draft / Submit.
- Judges see only their own scores.

### F11 · AI judging (Gemini)
- **Start AI judging** scores each design on the rubric, one per step, paced for a free key. It then compares the top N (default 5) side by side. The comparison breaks ties only; it never moves a lower score above a higher one.
- The progress bar shows scored and unreadable counts and the models used.
- **Cancel AI judging** stops immediately; the admin can then judge manually or run AI judging again. A run interrupted by a page reload resumes automatically.
- The results table shows the AI total, finalist rank, flags (off theme, possible template, contains instructions…) and a summary.
- Internal only.

### F12 · Results
- Choose AI scores or Manual scores, then **Compute ranking**.
- Ranks follow the score, highest first (D-017). The preview shows rank, code, name, score, source and tie notes (finalist comparison, which criterion broke a tie, or the manual fallback).
- **Publish** shows the results on the leaderboard and projector. **Unpublish** needs a reason and is meant for corrections.

### F13 / F14 · Leaderboard and projector
- Shows "Judging in progress" until published, then a podium (2nd · 1st · 3rd) that rises in, followed by a ranked table.
- During the round the projector shows the theme, a giant countdown and "N / M submitted". Press F for fullscreen.

### F16 · Bot test
- 20+ bots go through registration, the start, concurrent uploads, a replacement, attacks, the deadline, blind manual judging, an AI run with cancel and a completed AI run, then compute, publish and the leaderboard. That's 75 checks.
- The report goes to `docs/reports/bot-test.md`.
