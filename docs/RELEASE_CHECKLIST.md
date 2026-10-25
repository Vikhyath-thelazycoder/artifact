# Release checklist: ARTIFEX at Techvidya

## 1. Before the event (once)

### Supabase (production project)
- [ ] Create the project in a region near the venue (e.g. Mumbai).
- [ ] `supabase link --project-ref <ref>` then `supabase db push` (applies `0001`–`0003`).
- [ ] `supabase functions deploy participant-signup --no-verify-jwt`.
- [ ] Auth → Providers → Email: **Confirm email OFF** (accounts are pre-confirmed anyway); minimum password length 6.
- [ ] Auth → Rate limits: raise **sign-ins/sign-ups** to at least 300 per 5 minutes. Every phone on campus Wi-Fi shares one IP.
- [ ] Storage: confirm the bucket `submissions` is **private**, 10 MB, and limited to PNG, JPG and PDF (created by `0002`).
- [ ] Create a **separate test project** for the bot test. Never run it against production.

### Vercel
- [ ] Import the repo. Framework: Next.js.
- [ ] Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the **anon/publishable** key), `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY` (server only). Do **not** set `AI_JUDGE_FAKE` or any service-role key.
- [ ] Redeploy after setting the variables.
- [ ] Supabase Auth → URL configuration: add the Vercel domain as the Site URL.

### Accounts
- [ ] `STAFF_SUPABASE_URL=… STAFF_SUPABASE_SERVICE_ROLE_KEY=… npm run create-staff -- --email <you> --role admin` for each organiser (individual accounts), and `--role judge` for judges.
- [ ] Each staff member logs in once and changes their password.
- [ ] Name a backup admin with their own account.

### Content
- [ ] Settings: event name, **theme**, brief, 10 minutes, 10 s grace, 10 MB, replacement on/off, judging mode, finalists.
- [ ] Decide what the leaderboard shows (default: name, code, score) and the privacy notice ([PIA.md](PIA.md) §8).

## 2. Rehearsal (day before)
- [ ] Run the bot test against the **test** project with the real Gemini key: `npm run bot-test -- --bots 20 --duration 60`. Every check must be green. Note how long AI judging took and whether `AI_QUOTA` waits appeared.
- [ ] On the venue Wi-Fi: 30+ real phones and laptops register and log in within 5 minutes with no rate-limit errors.
- [ ] One real 2-minute round on production with 2–3 people: upload a PNG, a JPG and a PDF, check the receipts, judge, publish, then **New event** to reset.
- [ ] Projector: open `/screen` on the projector laptop and press F. Check it's readable from the back row.
- [ ] Admin laptop on power, with a backup device logged in.

## 3. Event-day runbook

| When | Action |
|---|---|
| 60 min before | Staff log in. Confirm the theme is correct (still hidden). Open registration. Share the site link or QR |
| 10 min before | Participants in `/play`, rules accepted (Control room: "accepted the rules" count). Projector on `/screen` |
| Start | Announce the rules verbally. Press **Start round** once and confirm. Check the projector shows the theme and timer |
| During | Watch the Submitted count. Use **Extend for everyone** only for a global problem, with a reason |
| Deadline | The round closes by itself at deadline + 10 s. Announce "pens down" |
| Judging | **AI:** Judging → Start AI judging (keep the page open; Cancel at any time). **Manual:** judges score in Judging |
| Results | Results & publish → choose the source → Compute ranking → review → **Publish**. Projector shows the podium |

## 4. If something goes wrong

| Problem | Do |
|---|---|
| A participant's upload fails | Check the error shown. If the window is open they retry. No individual exceptions after the deadline |
| Many uploads fail at once | Check Supabase status. Apply **Extend for everyone** with a reason if the outage was global |
| Admin laptop dies | Log in on the backup device. The round keeps running and closes on its own |
| Gemini quota exhausted / AI errors | The run waits and retries. If it stalls, **Cancel AI judging** and finish with **Manual scoring** |
| Wrong theme shown | Stop. Agree a remedy for everyone, record it, announce it. Run a new round with **New event** if needed |
| Published by mistake | **Unpublish** with a reason, fix, publish again |

## 5. Sign-off

| Item | Name | Date |
|---|---|---|
| Rehearsal bot test green | | |
| Venue Wi-Fi sign-in test | | |
| Privacy notice agreed (PIA §8) | | |
| Go-live | | |
