alter table public.set_logs
  add column if not exists skipped boolean not null default false;

create index if not exists set_logs_skipped_idx
  on public.set_logs (skipped) where skipped;
