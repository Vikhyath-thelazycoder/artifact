# Privacy Impact Assessment (PIA): ARTIFEX

**System:** ARTIFEX event website (Techvidya)
**Assessment date:** 2026-10-25
**Data controller:** the Techvidya event organisers, under the college's student-data policy
**Review:** before go-live, and again whenever data collection or a third party changes

## 1. Summary

ARTIFEX collects the minimum needed to run a 10-minute design competition:
- who entered (name, USN, optional branch);
- the design each person submitted;
- how it was judged.

The main privacy risks:
1. Exposing students' designs or details before or beyond what the organisers intend.
2. Sending designs to Google's Gemini API on a free-tier key, which allows Google to use the content to improve its products.
3. Keeping data longer than needed.

The controls below reduce the first and third risks to low. The second is accepted by the organisers. They should state it in the rules page or the registration notice (§8).

## 2. Data inventory

| Data | Source | Purpose | Who can see it | Stored where | Retention (proposed) |
|---|---|---|---|---|---|
| Full name | Participant | Identify the entrant; show on the published leaderboard | Self, admins; public once published | Supabase `participants` | 6 months after the event |
| USN | Participant | Unique entry, login identity | Self, admins (never judges, never public) | `participants`, auth email `<usn>@participants.artifex.app` | 6 months |
| Branch (optional) | Participant | Organiser statistics | Self, admins | `participants` | 6 months |
| PIN | Participant | Login | Nobody (hashed by Supabase Auth) | Supabase Auth | Deleted with the account |
| Participant code (AFX-NNN) | System | Blind judging; public leaderboard | Self, staff; public once published | `participants` | 6 months |
| Design files + versions, SHA-256, arrival times | Participant / system | Judging, disputes | Self (own), staff via signed links | Private bucket + `submission_versions` | 6 months, unless the participant consents to longer (e.g. an exhibition) |
| Manual scores and private comments | Judges | Judging | Admin; judges see only their own | `scores` | 6 months |
| AI scores, reasons, flags | Gemini via server | Judging aid | Admin only (D-011) | `ai_scores` | 6 months |
| Audit log | System | Accountability, disputes | Admin only | `audit_logs` | 12 months |
| Staff email | Organisers | Staff login | Admins | Supabase Auth, `staff` | Until removed |

**Not collected:** phone numbers, home addresses, photos of people, device fingerprints, location, analytics or tracking cookies. The only cookie is the Supabase session cookie.

## 3. Data flows

1. The participant's browser sends name, USN, branch and PIN to Supabase (TLS). The PIN is hashed by Supabase Auth.
2. The design file goes from the browser straight to the private Supabase Storage bucket (TLS).
3. The admin's server route sends the design file plus theme and rubric to the Google Gemini API. It sends **no** name, USN or participant code (D-010).
4. After publication, the public leaderboard and projector show rank, participant code, name and score.

## 4. Necessity and proportionality

- **Name** is needed to announce winners. **USN** is needed to stop duplicate entries and to bind an account to a real student.
- Both are kept away from judges, so judging stays blind.
- **Branch** is optional.
- No contact data is collected. Organisers announce results in the hall and on the leaderboard.
- **AI judging** is optional per event (D-007). When it's off, nothing goes to Google.

## 5. Risks and controls

| # | Risk | Likelihood × impact (before) | Controls | Residual |
|---|---|---|---|---|
| P-1 | Someone reads another participant's details or design | Medium × Medium | RLS per row, private bucket, own-folder storage policy, signed URLs for staff only; tested by the bot test | Low |
| P-2 | Results, scores or comments leak before publishing | Medium × Medium | Admin-only tables; `public_results` empty until published; comments never public | Low |
| P-3 | Designs sent to Gemini on a free-tier key may be used by Google to improve products, and may be seen by human reviewers | High × Low–Medium | Only the design, theme and rubric are sent (no identity); AI mode is optional; AI is used only after the round, on final files | **Medium, accepted by organisers.** Disclose it (§8). A paid Gemini tier would change this, but organisers chose the free tier |
| P-4 | Judges are biased by identity | Medium × Medium | Judges see participant codes only; RLS blocks names and USNs | Low |
| P-5 | Data is kept indefinitely | High × Low | Retention schedule (§2); deletion procedure (§7) | Low, once the procedure is followed |
| P-6 | A secret key leak exposes all data | Low × High | Service key never in Vercel or the browser; bundle scan; individual staff accounts | Low |
| P-7 | Names are shown publicly without the person expecting it | Medium × Low | Rules page states the leaderboard shows name and score; organisers can switch to codes only (one-line change in `public_results`) | Low |
| P-8 | Someone registers using another student's USN | Low × Medium | USN must match the account; physical check at the venue; admins can remove a registration through Supabase | Low |

## 6. Individuals' rights

- **Access:** a participant sees their own registration, submission versions and receipt in `/play`.
- **Correction:** a participant asks an organiser at the help desk. The organiser corrects the name in the Supabase dashboard (audited by Supabase).
- **Deletion:** a participant may ask for removal before or after the event. Deleting the auth user cascades to their participant row, submissions, scores and results; the storage files are removed separately (§7). If this happens before results are published, the participant leaves the competition.

## 7. Retention and deletion procedure

Six months after the event:
1. Export any results the college must keep (rank, name, score) to the college's records system.
2. Delete participant auth users. That cascades to `participants`, `submissions`, `submission_versions`, `scores`, `ai_scores` and `results`.
3. Delete the bucket folders `events/<event_id>/`.
4. After 12 months, remove that event's audit logs.
5. Record the deletion in the event's records.

Designs kept for an exhibition need the participant's opt-in.

## 8. Required notices

Add to the rules page or registration notice before the event:

> Your name and score appear on the public leaderboard when results are published. Your USN is never shown publicly or to judges. Organisers may use an AI tool (Google Gemini) to help with judging. Only your design file is sent to it, never your name or USN. Under the free tier, Google may use submitted content to improve its services. Your data is deleted six months after the event.

The organisers chose to keep the judging method internal (D-011). This notice discloses the data use without revealing which judging mode was used.

## 9. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Event lead | | | |
| Faculty coordinator / data owner | | | |
