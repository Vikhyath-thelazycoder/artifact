# Product Requirements: ARTIFEX

## Problem

ARTIFEX is the Techvidya creative design competition. Every participant gets the same theme and has **10 minutes** to design an original poster or flyer in a permitted tool (Figma, Canva, Photoshop, Illustrator or another tool the organisers allow). They then submit it digitally.

The event needs four things under time pressure:
- a fair shared deadline;
- reliable uploads with proof of receipt;
- a fast way to judge dozens of designs;
- a leaderboard to announce the winners.

## Target users

| User | Context | Needs |
|---|---|---|
| Participant | A student on a laptop or phone, designing against the clock | Clear rules, the theme at the same moment as everyone else, a countdown they can trust, an upload that obviously worked |
| Admin (organiser) | Runs the event from a laptop at the front of the room | One-click control of the round, a live view of who has submitted, judging that finishes quickly, a safe publish step |
| Judge (optional) | Reviews designs after the round | A blind, consistent rubric workspace |
| Audience | Watches the projector | The theme, the countdown, then the winners |

## Goals

1. Everyone eligible sees the same theme and the same deadline. The server is the clock.
2. Uploads are accepted only within the published deadline policy, with a receipt every time.
3. Judging takes minutes, not hours. The admin can let Gemini judge, judge manually, or cancel the AI and switch to manual.
4. Results stay private until the admin publishes, then appear on a leaderboard and the projector.
5. A full rehearsal with at least 20 bot participants passes before the event.

## Non-goals

- A built-in design editor.
- Team entries.
- Proving originality technically. The declaration and audit trail support the organisers' review; they are not proof.
- Showing AI scores, AI reasons or the judging mode to participants (D-011).
- Paid AI tiers or any AI provider other than Gemini (D-008).

## Features

The full feature list is in [FEATURES.md](FEATURES.md). In summary:
- **Public:** landing page, rules, leaderboard, projector board.
- **Participant:** register and log in, lobby, live workspace with countdown, upload, receipt, replacement.
- **Admin:** dashboard, round control, settings, submissions gallery, judging (manual and AI), results and publish, audit log.
- **Testing:** the bot test.

## Competition rules (source of truth)

1. One shared round. It starts when the admin presses **Start round**. `deadline = start + duration` (default 10 minutes).
2. The theme is hidden until the round starts. Then everyone sees it at once.
3. Individual only. One participant account per USN per event.
4. Accepted files: PNG, JPG or PDF, up to 10 MB.
5. **Deadline policy (D-005):** the upload must be fully received and confirmed by the server by the deadline plus a 10-second network grace. Later uploads are rejected. No individual exceptions.
6. A participant may replace their submission before the deadline. The latest accepted version is judged, and earlier versions are kept for disputes.
7. Before uploading, participants confirm the originality declaration: their own work, made during the round, not copied, shared or modified from someone else's design.
8. The admin may **extend** the round for everyone (with a reason) or **end it early**. There is no pause.
9. **Rubric (100 points):** theme communication 30, originality and concept 25, visual hierarchy and readability 20, visual design and composition 15, relevance and message clarity 10.
10. **Judging mode** is chosen by the admin: Manual (the mean of the judges' submitted totals) or AI (Gemini rubric totals). The admin can cancel AI judging at any time.
11. **Ranks always follow the score, highest first** (D-017). **Ties** are broken by the AI finalist comparison (between finalists, AI mode), then theme score, originality, hierarchy and the earlier submission.
12. Results are published by the admin. The judges' (organisers') decision is final.

## Workflows

**Participant**
1. Open the site and read the rules.
2. Register with name, USN, branch (optional) and a 6-digit PIN.
3. Acknowledge the rules, then wait in the lobby.
4. When the round starts, the theme and countdown appear.
5. Design in a permitted tool and export a PNG, JPG or PDF.
6. Confirm the declaration, then upload.
7. A receipt shows the reference, server time and file name.
8. Optionally replace the file before the deadline.
9. Wait for results, then view the leaderboard.

**Admin**
1. **Set up:** name, theme, brief, duration, file rules, judging mode.
2. Open registration and watch the lobby fill.
3. Start the round.
4. Watch submissions arrive. Extend or end the round if needed.
5. The round closes automatically at the deadline.
6. Judge, either **Manual** (score the submissions) or **AI** (start the run, watch progress, cancel if needed).
7. Compute the results, review the ranking and publish.
8. The projector shows the leaderboard.

## Constraints

- Free tiers: Supabase Free, Vercel Hobby and a Gemini free-tier key, which has per-minute and per-day request limits. AI judging must pace itself and survive quota errors.
- Vercel route time limit of about 60 s, so AI work runs one design per request.
- Up to roughly 200 participants. Expect 20–100.
- Uploads go straight to Supabase Storage, which avoids Vercel's 4.5 MB body limit.

## Success criteria

- The bot test (≥ 20 bots) is green: every rule check passes, there are no cross-participant reads, and late uploads are rejected.
- AI judging scores 20 designs and orders the finalists, within the free tier's limits, with the admin able to cancel.
- 30+ real phones and laptops register on the venue Wi-Fi within 5 minutes during the rehearsal.
- Results are invisible before publishing and correct after (ranks 1..n).

## Assumptions

- One event round at a time. "New event" starts a fresh one; old events and their results are kept.
- Participants export and upload the file themselves; nothing integrates with Canva or Figma.
- The venue has internet access for every participant device.

## Open questions

- The event date, venue and final theme (organisers).
- Whether to show scores on the public leaderboard or ranks only. The default shows scores; it's a one-line change.
