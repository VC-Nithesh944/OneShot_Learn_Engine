alter table public.user_profiles
  add column if not exists longest_streak integer not null default 0;