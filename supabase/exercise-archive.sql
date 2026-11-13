-- Applied remotely via Supabase MCP on project WorkoutApp (axvwkvzeqsnzcrkttbva).
-- set_logs reference exercises with no cascade, so an exercise with logged
-- sets can't be deleted. Removing one from a routine (manual delete or an
-- AI edit) archives it instead: hidden from the editor and Today, while
-- History, Progress and weight suggestions still see its sets.
alter table public.exercises
  add column if not exists archived boolean not null default false;
