-- Bowling Bro': one review per bowler per night, one profile per bowler. JSON state validated by zod in lib/review/schema.ts.
create table if not exists public.night_reviews (
  scorebook_id uuid not null references public.scorebooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bowler smallint not null check (bowler between 0 and 3),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (scorebook_id, user_id)
);
create table if not exists public.bowler_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.night_reviews enable row level security;
alter table public.bowler_profiles enable row level security;
revoke all on public.night_reviews from anon, authenticated;
revoke all on public.bowler_profiles from anon, authenticated;
grant select, insert, update, delete on public.night_reviews to service_role;
grant select, insert, update, delete on public.bowler_profiles to service_role;
