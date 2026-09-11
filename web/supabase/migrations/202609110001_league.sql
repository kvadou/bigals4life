-- League standings ingested from BLS-2013 weekly PDFs. Service-role only, like scorebooks.
create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  house text not null default '',
  weeks_total integer not null check (weeks_total > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.league_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id),
  number integer not null check (number > 0),
  name text not null,
  unique (season_id, number)
);
create table if not exists public.league_bowlers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id),
  bls_id integer not null,
  name text not null,
  hand text not null check (hand in ('L','R')),
  team_id uuid references public.league_teams(id),
  unique (season_id, bls_id)
);
create table if not exists public.league_weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id),
  week integer not null check (week > 0),
  bowled_on date not null,
  source_file text not null,
  warnings jsonb not null default '[]'::jsonb,
  ingested_at timestamptz not null default now(),
  unique (season_id, week)
);
create table if not exists public.league_team_weeks (
  week_id uuid not null references public.league_weeks(id) on delete cascade,
  team_id uuid not null references public.league_teams(id),
  place integer,
  percent_won numeric, points_won numeric, points_lost numeric, unearned_points numeric,
  ytd_percent_won numeric, ytd_won numeric, ytd_lost numeric,
  games_won integer, scratch_pins integer, pins_plus_hdcp integer,
  lanes text, opponent_team_id uuid references public.league_teams(id),
  hdcp_games integer[], hdcp_total integer, week_points_won numeric,
  discrepancies jsonb,
  primary key (week_id, team_id)
);
create table if not exists public.league_bowler_weeks (
  week_id uuid not null references public.league_weeks(id) on delete cascade,
  bowler_id uuid not null references public.league_bowlers(id),
  team_id uuid references public.league_teams(id),
  average integer, handicap integer, pins integer, games integer, to_raise integer, to_drop integer,
  scratch_games integer[], scratch_total integer, hdcp_total integer,
  match_points_ytd numeric,
  warning text,
  primary key (week_id, bowler_id)
);
do $$ declare t text; begin
  foreach t in array array['league_seasons','league_teams','league_bowlers','league_weeks','league_team_weeks','league_bowler_weeks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
