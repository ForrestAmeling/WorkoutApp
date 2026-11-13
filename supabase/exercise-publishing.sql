-- Applied remotely via Supabase MCP on project WorkoutApp (axvwkvzeqsnzcrkttbva).
-- Opt-in publishing of shared exercises to free-exercise-db (public
-- domain): the owner requests it, an app admin approves or declines, and a
-- daily cron batches approved exercises into one GitHub pull request
-- (/api/cron/publish-exercises). Admin rows are added by hand.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
create policy app_admins_select_self on public.app_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- One row per pull request opened upstream. PRs are public on GitHub, so
-- any signed-in user may read them; only the server (service role) writes.
create table if not exists public.exercise_submissions (
  id uuid primary key default gen_random_uuid(),
  pr_number int,
  pr_url text,
  branch text,
  status text not null default 'open' check (status in ('open', 'merged', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.exercise_submissions enable row level security;
create policy exercise_submissions_select on public.exercise_submissions
  for select to authenticated
  using (true);

alter table public.custom_exercises
  add column if not exists publish_status text not null default 'none'
    check (publish_status in (
      'none', 'requested', 'approved', 'rejected', 'submitted', 'merged', 'closed'
    )),
  add column if not exists publish_consented_at timestamptz,
  add column if not exists publish_reviewed_at timestamptz,
  add column if not exists publish_note text,
  add column if not exists published_slug text,
  add column if not exists submission_id uuid
    references public.exercise_submissions(id) on delete set null;

create index if not exists custom_exercises_publish_queue_idx
  on public.custom_exercises (publish_status, publish_reviewed_at)
  where publish_status in ('requested', 'approved', 'submitted');

-- Owners may only request publishing or withdraw a request; review and
-- submission fields are server-only. Changing an approved exercise sends
-- it back for review, and making it private withdraws a pending request.
create or replace function public.custom_exercises_guard_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prior text := case when tg_op = 'INSERT' then 'none' else old.publish_status end;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if new.publish_status is distinct from prior
     and not (new.publish_status = 'requested' and prior in ('none', 'rejected', 'closed'))
     and not (new.publish_status = 'none' and prior in ('requested', 'approved', 'rejected', 'closed'))
  then
    raise exception 'Publish status can only be requested or withdrawn'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.publish_reviewed_at := null;
    new.publish_note := null;
    new.published_slug := null;
    new.submission_id := null;
    new.publish_consented_at := case when new.publish_status = 'requested' then now() end;
  else
    new.publish_reviewed_at := old.publish_reviewed_at;
    new.publish_note := old.publish_note;
    new.published_slug := old.published_slug;
    new.submission_id := old.submission_id;
    new.publish_consented_at := case
      when new.publish_status = 'requested' and prior <> 'requested' then now()
      else old.publish_consented_at
    end;
  end if;

  if new.visibility <> 'shared' and new.publish_status in ('requested', 'approved') then
    new.publish_status := 'none';
  end if;

  if tg_op = 'UPDATE' and prior = 'approved' and new.publish_status = 'approved'
     and (new.name, new.equipment, new.level, new.force, new.mechanic, new.category,
          new.primary_muscles, new.secondary_muscles, new.instructions, new.images)
       is distinct from
         (old.name, old.equipment, old.level, old.force, old.mechanic, old.category,
          old.primary_muscles, old.secondary_muscles, old.instructions, old.images)
  then
    new.publish_status := 'requested';
  end if;

  return new;
end;
$$;

drop trigger if exists custom_exercises_guard_publish on public.custom_exercises;
create trigger custom_exercises_guard_publish
  before insert or update on public.custom_exercises
  for each row execute function public.custom_exercises_guard_publish();
