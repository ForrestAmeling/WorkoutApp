-- Applied remotely via Supabase MCP on project WorkoutApp (axvwkvzeqsnzcrkttbva).
-- A "run" is one attempt at working through a routine. Today's position
-- (which week focus / day is next) is worked out from the open run's
-- sessions only, so closing the open run ("Restart") sends Today back to
-- the first focus and day while every logged session stays where it is.
-- History, Progress and weight suggestions never filter by run, so closed
-- runs keep feeding them.

create table if not exists public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  started_on date not null default current_date,
  closed_on date,
  created_at timestamptz not null default now()
);

-- At most one open run per routine.
create unique index if not exists routine_runs_one_open_per_routine
  on public.routine_runs (routine_id) where closed_on is null;
create index if not exists routine_runs_routine_started_idx
  on public.routine_runs (routine_id, started_on desc);
create index if not exists routine_runs_user_id_idx
  on public.routine_runs (user_id);

alter table public.routine_runs enable row level security;

create policy routine_runs_select_own on public.routine_runs
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy routine_runs_insert_own on public.routine_runs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );
create policy routine_runs_update_own on public.routine_runs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.routines r
      where r.id = routine_id and r.user_id = (select auth.uid())
    )
  );
create policy routine_runs_delete_own on public.routine_runs
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sessions
  add column if not exists run_id uuid references public.routine_runs(id) on delete set null;
create index if not exists sessions_run_id_idx on public.sessions (run_id);

-- Every session lands in its routine's open run, opening one if needed.
-- Done in the database (not app code) because sessions are inserted from
-- three client-side paths (ExerciseCard, OfflineSync, ensureSession) and
-- from whatever app version is already deployed. Runs as the invoker, so
-- RLS still applies to the routine_runs insert.
create or replace function public.sessions_assign_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.run_id is not null or new.routine_id is null then
    return new;
  end if;

  select id into new.run_id
  from public.routine_runs
  where routine_id = new.routine_id and closed_on is null;

  if new.run_id is null then
    insert into public.routine_runs (user_id, routine_id, started_on)
    values (new.user_id, new.routine_id, new.performed_on)
    on conflict (routine_id) where closed_on is null do nothing
    returning id into new.run_id;

    -- Lost a race with a concurrent insert that opened the run first.
    if new.run_id is null then
      select id into new.run_id
      from public.routine_runs
      where routine_id = new.routine_id and closed_on is null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_assign_run on public.sessions;
create trigger sessions_assign_run
  before insert on public.sessions
  for each row execute function public.sessions_assign_run();

-- Backfill: one open run per routine that already has sessions, starting
-- at its first logged day, so existing progress picks up where it was.
insert into public.routine_runs (user_id, routine_id, started_on)
select s.user_id, s.routine_id, min(s.performed_on)
from public.sessions s
where s.routine_id is not null
  and not exists (
    select 1 from public.routine_runs rr where rr.routine_id = s.routine_id
  )
group by s.user_id, s.routine_id;

update public.sessions s
set run_id = rr.id
from public.routine_runs rr
where rr.routine_id = s.routine_id
  and rr.closed_on is null
  and s.run_id is null;
