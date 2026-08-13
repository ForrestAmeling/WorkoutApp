-- Applied remotely via Supabase MCP on project WorkoutApp (axvwkvzeqsnzcrkttbva).
-- Prevent two ExerciseCards from creating the same session at once.
create unique index if not exists sessions_user_day_unique
  on public.sessions (user_id, routine_id, performed_on, week_focus, day_number);

create index if not exists exercises_routine_id_idx
  on public.exercises (routine_id);
create index if not exists exercises_routine_day_id_idx
  on public.exercises (routine_day_id);
create index if not exists sessions_cycle_id_idx
  on public.sessions (cycle_id);
create index if not exists sessions_routine_id_idx
  on public.sessions (routine_id);

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
