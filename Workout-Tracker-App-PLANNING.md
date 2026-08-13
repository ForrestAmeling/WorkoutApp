# Workout Tracker App — Planning & Task Doc

## 1. Goal

A mobile-friendly web app that replaces the printable PDF/CSV tracker: shows today's exercises with rep/set targets, lets you log weight + reps per set in real time at the gym, and — the new part — calls the DeepSeek API to suggest a starting weight for each set based on your logged history, so you're not guessing.

Single user (you) to start. No app store distribution — install-to-homescreen on your phone is enough.

## 2. Stack decision

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind**, deployed on Vercel | Mobile-first responsive UI, ships as a PWA (installable, home-screen icon, works like an app without app-store overhead) |
| Backend / DB | **Supabase** (Postgres + Auth + Row Level Security) | You already named it; gives you a hosted DB, auth, and a browser-safe client via RLS in one service |
| AI | **DeepSeek API**, called from a Next.js Route Handler (server-side only) | Never call it from the browser — that exposes your API key. A serverless function on Vercel is the natural place |
| Hosting/CI | **GitHub → Vercel** | Push to `main` = deploy; every PR gets a preview URL, useful even solo for testing on your phone before merging |

**Why not Flutter/Dart:** it's a legitimate option for a "real" mobile app, but it pulls you into a second ecosystem (Dart, its own state management, its own way of calling APIs securely — you'd likely still need a small Node/Vercel backend just to hide the DeepSeek key) for a tool only you use. A PWA gets "install icon, full-screen, works offline for today's workout" on both iOS and Android with one codebase and no store review process. Revisit this only if you later want push notifications that work reliably in the background — PWA push support on iOS is still limited.

## 3. Architecture

```
[Phone browser / installed PWA]
        |  HTTPS
        v
[Next.js app on Vercel]
   ├─ Pages/Components — render today's workout, log sets
   ├─ Route Handler: /api/suggest-weight
   │      └─ calls DeepSeek chat/completions (server-side, key in env var)
   └─ Supabase client (anon key, protected by RLS) — direct CRUD for sets/sessions
        |
        v
[Supabase: Postgres + Auth + RLS]
```

The browser talks to Supabase directly for normal reads/writes (fast, no extra hop, safe because RLS restricts rows to your user). It only goes through a Vercel Route Handler for the one thing that needs a hidden secret: the DeepSeek call.

## 4. Data model (Supabase/Postgres)

```sql
-- Master list of movements in the program
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  day_number int not null check (day_number between 1 and 5),
  is_accessory boolean not null default false,
  sort_order int not null
);

-- Rep/set target per exercise, per week-focus (light/middle/heavy)
create table exercise_targets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references exercises(id) on delete cascade,
  week_focus text not null check (week_focus in ('light','middle','heavy')),
  target_sets int not null,
  rep_low int not null,
  rep_high int not null
);

-- One 3-week rotation through the program
create table cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  cycle_number int not null,
  started_on date not null default current_date
);

-- One logged workout (a specific day, on a specific date, inside a cycle+week)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  cycle_id uuid references cycles(id) not null,
  week_focus text not null check (week_focus in ('light','middle','heavy')),
  day_number int not null check (day_number between 1 and 5),
  performed_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- The actual weight/reps logged per set
create table set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  exercise_id uuid references exercises(id) not null,
  set_number int not null,
  weight numeric,
  reps int,
  ai_suggested_weight numeric,
  notes text,
  created_at timestamptz not null default now()
);
```

Enable RLS on `cycles`, `sessions`, `set_logs`, scoped to `user_id = auth.uid()`. `exercises`/`exercise_targets` are program-wide reference data — read-only for everyone, no user scoping needed.

## 5. AI weight-suggestion design

**Flow:**
1. You open today's session and tap into an exercise's next set.
2. Client calls `POST /api/suggest-weight` with `{ exercise_id, week_focus, rep_low, rep_high }`.
3. The Route Handler queries Supabase for the last 1–3 `set_logs` for that same `exercise_id` **and same `week_focus`** (comparing a Light-week attempt to a Light-week attempt, not to a Heavy week — mixing those defeats the whole periodization).
4. It builds a prompt for DeepSeek asking for structured JSON: `{ "suggested_weight": number, "rationale": string }`.
5. The suggestion pre-fills the weight input; you can accept or override it before logging the real set.
6. What you actually log becomes the history that improves the next suggestion.

**Guardrails (build these in from day one, don't bolt on later):**
- No history for that exercise+week-focus yet → skip the AI call, leave the field blank for manual entry.
- Clamp any AI-suggested change to a sane bound (e.g. ±15% of last logged weight) so a bad model response can't suggest something wild.
- If the DeepSeek call fails or times out, fall back to the deterministic rule you already use by hand: missed bottom of rep range → suggest ~5–10% less; blew past top of range → suggest ~5–10% more; landed in range → suggest the same weight.
- Store `ai_suggested_weight` next to the real logged weight in `set_logs` — over time this tells you if the suggestions are actually useful, and gives you real data to tune the prompt.

**Model choice:** start with `deepseek-chat` (cheaper, fast, plenty for this) rather than `deepseek-reasoner` — this isn't a task that needs extended reasoning, just a small rule+history-informed number.

## 6. Security / environment variables

| Variable | Where it lives | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env (public) | Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env (public) | Safe to expose — RLS is what actually protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env (server-only) | Only if a Route Handler ever needs to bypass RLS; avoid using this unless necessary |
| `DEEPSEEK_API_KEY` | Vercel env (server-only) | **Never** prefix with `NEXT_PUBLIC_` — must only be read inside the Route Handler |

## 7. Phased task list

### Phase 0 — Setup & decisions
- [ ] Create GitHub repo
- [ ] `npx create-next-app` with TypeScript + Tailwind + App Router
- [ ] Create Supabase project; note project URL + anon key
- [ ] Create Vercel project, link to GitHub repo, connect env vars
- [ ] Get a DeepSeek API key, add as a Vercel server-only env var
- [ ] Drop this file into the repo as `PLANNING.md`
- [ ] Decide: lbs or kg (default lbs, revisit as a setting later)

### Phase 1 — Data model
- [ ] Write Supabase SQL migrations for the 5 tables above (Supabase CLI or SQL editor)
- [ ] Enable RLS policies scoped to `auth.uid()` on `cycles`/`sessions`/`set_logs`
- [ ] Seed `exercises` + `exercise_targets` from the existing 3-week program (the CSV you already have is the source data)
- [ ] Sanity-check seed data in the Supabase table editor

### Phase 2 — Core logging UI (MVP, no AI yet)
- [ ] Set up Supabase Auth (magic link is lowest-friction for solo use)
- [ ] Build "today's workout" view — figure out current cycle/week/day, list exercises + targets
- [ ] Build the set-logging form: weight + reps per set, large touch targets, +/- steppers for weight (typing on a phone mid-set is annoying)
- [ ] Write `set_logs` to Supabase on submit
- [ ] Build a simple session history list (past sessions → logged sets)
- [ ] Mobile pass: test on an actual phone browser, not just resized desktop

### Phase 3 — AI weight suggestions
- [ ] Build `/api/suggest-weight` Route Handler (server-side DeepSeek call)
- [ ] Implement the prompt + JSON-response parsing described in §5
- [ ] Add "Suggest weight" trigger on the set-entry screen (button, or auto-fetch when the field is empty)
- [ ] Implement guardrails: clamp delta, skip-if-no-history, rule-based fallback on API failure
- [ ] Store `ai_suggested_weight` alongside the logged weight

### Phase 4 — PWA / mobile polish
- [ ] Add `manifest.json` + icons, register a service worker (`next-pwa` or hand-rolled)
- [ ] Verify "Add to Home Screen" works on both iOS and Android
- [ ] Cache today's workout for offline use (gym wifi is never reliable)
- [ ] Queue offline-logged sets and sync when back online

### Phase 5 — Progress & history
- [ ] Per-exercise weight/rep trend view across cycles
- [ ] Flag when a lift has been stuck at the same weight for N sessions in the same week-focus
- [ ] CSV export as a fallback / backup

### Phase 6 — Later / nice-to-have
- [ ] In-app program editor (swap an exercise without a code change/redeploy)
- [ ] Dark mode
- [ ] Support a second user, if that ever comes up
- [ ] Notifications/reminders for workout days (know the PWA push limits on iOS before committing to this)

## 8. Open questions to settle as you go

- Auto-advance to the next day/week based on the last completed session, or pick manually each time?
- Confirm DeepSeek model (`deepseek-chat` recommended over `deepseek-reasoner` for this use case — cheaper and fast enough).
- Units: lbs vs kg — locking this in early avoids a migration later.
