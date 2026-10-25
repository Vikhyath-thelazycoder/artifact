# Design: ARTIFEX

## Visual direction (D-016)

- **Purpose:** a creative competition run against the clock. The interface should feel like a designer's studio (expressive type, a drafting-table grid) while staying calm and legible during a 10-minute sprint. The spec's rule: *the interface feels creative; the logic is boringly reliable.*
- **Tone:** dark editorial studio. Ink background, warm "paper" text, one **signal-orange** accent, a serif display face for headlines and a monospace face for every number that matters.
- **Signature detail:** a faint 48 px drafting grid behind hero areas and the projector, plus a small orange dot after the *Artifex* wordmark.
- **Avoid:** purple or neon gradients, decorative blobs, glassmorphism, nested cards, stock imagery, animation near the timer or upload controls.

## Surfaces

| Surface | User context | Rules |
|---|---|---|
| `/play` | A participant on a laptop beside their design tool, or a phone | One primary state in big type; theme + countdown + upload visible together on desktop (sticky side column); stacked on mobile with the countdown above the upload |
| `/admin/**` | The organiser at the front of the room | Dense and scannable: stat tiles, one control bar showing only valid actions, a live table |
| `/screen` | The projector | Readable from the back of a hall: `vw`-based type, giant countdown, submission counter, then a podium |
| `/leaderboard` | Everyone after publishing | Podium for the top 3, ranked table below |

## Typography

- **Display:** *Instrument Serif* (regular and italic), for headlines, the theme, names on the podium and the wordmark.
- **UI/body:** *Space Grotesk* 400/500/600.
- **Numbers:** *JetBrains Mono* with tabular figures, for the countdown, counts, scores, codes and times.
- **Eyebrows:** mono 11 px, uppercase, 0.18em tracking, muted.

## Color

Tokens live in [src/app/globals.css](../src/app/globals.css). The theme is dark only, for a dim hall with a projector.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0E0D0B` | Background |
| `--surface` / `--raised` | `#1A1815` / `#24211D` | Panels / hover, selected |
| `--line` | `#34302A` | Borders, grid |
| `--paper` | `#F4EFE6` | Primary text (contrast 17:1 on ink) |
| `--muted` | `#A8A093` | Secondary text (7.4:1 on ink) |
| `--signal` | `#FF5A1F` | The one accent: primary actions, live state, focus ring |
| `--ok` / `--warn` / `--danger` | `#46D483` / `#FFB020` / `#FF5C5C` | Status only: accepted, 2-minute warning, 30-second warning / errors |
| `--gold` / `--silver` / `--bronze` | `#F2C14E` / `#C9CCD3` / `#D08A4F` | Podium only |

Status never relies on colour alone. Each state also changes its text and icon (✓ Accepted, "Under 2 minutes", "30 seconds: upload now").

## Content states

| State | Trigger | Feedback |
|---|---|---|
| Loading | First fetch | "Connecting…" / "Loading…" |
| Empty | No participants, submissions or results | One sentence explaining what comes next |
| Error | RPC/route error code | Friendly message from `errors.ts`, next to the action |
| Offline | Network lost | "Reconnecting…" badge; never claims an upload succeeded |
| Success | Receipt | Green-bordered receipt card with reference, server time, file, version |
| Permission | Not staff | Server redirect to `/admin/login` |

## Countdown (spec §14.3)

- `MM:SS`, rounded up, so `00:00` shows only when time is really up.
- Under 2 minutes: amber, with the label "Under 2 minutes: export your design".
- Under 30 seconds: red, with the label "30 seconds: upload now".
- No sounds. Motion respects `prefers-reduced-motion`.

## Responsive rules

- **Participant:** 360 px and up, 16 px gutters, 56 px tap targets for primary actions.
- **Admin:** designed for 1280–1920 px and usable at 1024. Tables scroll horizontally inside their panel, never the page.
- **Projector:** 16:9, with all sizes in `vw` and `vh`.

## Accessibility

- Visible focus ring (2 px signal orange). Every control is keyboard reachable. Native `<dialog>` for confirmations.
- `role="timer"` with an `aria-label` on the countdown, and `aria-live` on its label, upload progress and status messages.
- Inline errors next to the field. Labels on every input.

## Motion

| Motion | Purpose |
|---|---|
| Podium rise (600 ms, staggered 3rd → 1st) | The payoff moment on the leaderboard and projector |
| Progress bars (upload, AI run) | Show work is happening |
| Width and colour transitions (≤ 250 ms) | State changes |

Nothing moves near the timer or upload controls during the round.
