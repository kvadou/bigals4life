alter table public.league_weeks add column if not exists recap text;
alter table public.league_weeks add column if not exists recap_at timestamptz;
