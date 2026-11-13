-- Applied remotely via Supabase MCP on project WorkoutApp (axvwkvzeqsnzcrkttbva).
-- User-created exercises, shaped like free-exercise-db entries. Routine
-- exercises link to one through exercises.library_id = 'user:<id>'.
-- visibility 'shared' lists it in the Reps community library for every
-- signed-in user; only the creator can change or delete it.

create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  visibility text not null default 'private'
    check (visibility in ('private', 'shared')),
  equipment text,
  level text check (level in ('beginner', 'intermediate', 'expert')),
  force text check (force in ('pull', 'push', 'static')),
  mechanic text check (mechanic in ('compound', 'isolation')),
  category text check (category in (
    'strength', 'stretching', 'plyometrics', 'strongman',
    'powerlifting', 'cardio', 'olympic weightlifting'
  )),
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  instructions text[] not null default '{}',
  -- Storage object paths in the exercise-images bucket ("<user_id>/<file>").
  images text[] not null default '{}' check (cardinality(images) <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_exercises_user_id_idx
  on public.custom_exercises (user_id);
create index if not exists custom_exercises_shared_idx
  on public.custom_exercises (visibility) where visibility = 'shared';

alter table public.custom_exercises enable row level security;

create policy custom_exercises_select_own_or_shared on public.custom_exercises
  for select to authenticated
  using (user_id = (select auth.uid()) or visibility = 'shared');
create policy custom_exercises_insert_own on public.custom_exercises
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy custom_exercises_update_own on public.custom_exercises
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy custom_exercises_delete_own on public.custom_exercises
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Private bucket: images are served through /api/exercise-images, which
-- signs a short-lived URL as the viewer, so these policies decide access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images', 'exercise-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy exercise_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exercise-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy exercise_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exercise-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Your own photos, plus photos of any shared exercise.
create policy exercise_images_select_own_or_shared on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exercise-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.custom_exercises ce
        where ce.visibility = 'shared' and objects.name = any (ce.images)
      )
    )
  );
