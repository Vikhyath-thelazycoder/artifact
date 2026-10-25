# ARTIFEX

The event website for **ARTIFEX**, Techvidya's 10-minute poster and flyer design competition:
- registration;
- a server-timed shared round;
- private uploads with receipts;
- manual or **Gemini AI** judging (cancellable);
- a published leaderboard and projector board.

Stack: Next.js 15 · Supabase (Postgres + RLS, Auth, Storage, Edge Function) · Gemini API · Tailwind v4 · Vitest.

## Run it locally

Needs Node 22, Docker and the Supabase CLI.

```bash
npm install
supabase start                         # local Postgres, Auth, Storage
supabase db reset                      # apply migrations
supabase functions serve               # participant-signup (keep running)
# .env.local: create it with the variables in docs/TRD.md › Environment variables (values from `supabase status`, plus GEMINI_API_KEY)
npm run dev                            # http://127.0.0.1:3000
npm run create-staff -- --email you@example.com --role admin
```

Pages:
- `/`: landing
- `/rules`
- `/play`: participants
- `/admin`: staff
- `/leaderboard`
- `/screen`: projector

## Test

```bash
npm test                               # unit tests
npm run test:integration               # anonymous-attacker checks against TEST_SUPABASE_URL
npm run bot-test -- --bots 20          # full event with ≥ 20 bots (app must be running)
AI_JUDGE_FAKE=1 npm run dev            # optional: free dry run of AI judging without Gemini
npm run build && npm run check:secrets # production build + bundle secret scan
```

## Docs

| Doc | What |
|---|---|
| [ARTIFEX_ARCHITECTURE.md](ARTIFEX_ARCHITECTURE.md) | Original specification |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | The four phases |
| [docs/PROJECT_DECISIONS.md](docs/PROJECT_DECISIONS.md) | Decisions D-001…D-016 |
| [docs/PRD.md](docs/PRD.md) | Product requirements and competition rules |
| [docs/TRD.md](docs/TRD.md) | Technical requirements: APIs, database, AI, env |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, boundaries, failure modes |
| [docs/SYSTEM_WORKFLOW.md](docs/SYSTEM_WORKFLOW.md) | State machine and flows |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and tests |
| [docs/PIA.md](docs/PIA.md) | Privacy impact assessment |
| [docs/DESIGN.md](docs/DESIGN.md) | Visual system |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature list |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Deploy, rehearsal, event-day runbook |
| [docs/reports/bot-test.md](docs/reports/bot-test.md) | Latest bot test report |
