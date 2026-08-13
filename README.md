# IronLog — Workout Tracker

Mobile-first PWA for logging your 3-week light/middle/heavy program with DeepSeek starting-weight suggestions.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS)
- DeepSeek API via `/api/suggest-weight` (server-only)

## Setup

1. Copy `.env.example` → `.env.local` and fill values (already present for local use).
2. In Supabase → Authentication → URL configuration, add:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
3. Install & run:

```bash
npm install
npm run dev
```

Open on your phone (same Wi‑Fi) via your machine’s LAN IP, or deploy to Vercel and Add to Home Screen.

## Data

Program seed comes from `Workout_Tracker.csv` (32 exercises × 3 week foci). Regenerate SQL with:

```bash
node scripts/generate-seed.js
```

## Units

Pounds (lb) by default.
