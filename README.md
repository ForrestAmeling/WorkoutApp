# Reps — Workout Tracker

Mobile-first PWA for logging your program with DeepSeek starting-weight suggestions.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS)
- DeepSeek API via `/api/suggest-weight` (server-only)

## Setup

1. Copy `.env.example` → `.env.local` and fill values (already present for local use).
2. In Supabase → Authentication → URL configuration, add:
   - Site URL: `http://localhost:3000`
   - Redirect URL: `http://localhost:3000/auth/callback`
3. Optional: run `supabase/session-unique.sql` in the SQL editor to block duplicate sessions.
4. Install & run:

```bash
npm install
npm run dev
```

Open on your phone (same Wi‑Fi) via your machine’s LAN IP, or deploy to Vercel and Add to Home Screen.

## Data

Program seed comes from `Workout_Tracker.csv` (32 exercises × 3 week foci). Regenerating SQL **does not wipe logged workouts**.

```bash
node scripts/generate-seed.js
```

## Units

Pounds (lb) by default. Switch to kilograms in Settings — values stay stored in pounds.
